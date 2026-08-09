import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { resolveProjectRoot } from "../paths.ts";

import type {
  Corpus,
  DocumentChunk,
  DocumentKind,
  ExcludedChunk,
  IngestedDocument,
  IngestionAudit,
  LeakageWarning,
  SourceDocument,
} from "./types.ts";
import {
  buildLineStarts,
  estimateTokens,
  normalizeText,
  sha256,
} from "./text.ts";
import { chunkDocument, DEFAULT_CHUNKER_CONFIG } from "./chunker.ts";
import { scanLeakage } from "./leakage.ts";

const BRIEF_RELPATH = "data/product-brief.md";
const SUPPLIER_EXTENSIONS = new Set([".md", ".txt"]);

export function resolveDataDir(): string {
  const override = process.env.DATA_DIR;
  if (override) {
    if (!existsSync(path.join(override, "product-brief.md"))) {
      throw new Error(
        `DATA_DIR is set to ${override} but product-brief.md was not found there.`,
      );
    }
    return override;
  }

  const dataDir = path.join(resolveProjectRoot(), "data");
  if (!existsSync(path.join(resolveProjectRoot(), BRIEF_RELPATH))) {
    throw new Error(`Found the project root, but ${BRIEF_RELPATH} is missing.`);
  }
  return dataDir;
}

/**
 * Explicit allowlist, never a recursive glob.
 *
 * This is what keeps `data/DATA_MANIFEST.md` — which contains the
 * case-to-requirement mapping and therefore functions as an answer key — out of
 * the evidence corpus by construction rather than by filtering. A filter can be
 * forgotten; a path that is never read cannot leak.
 */
export const SUPPLIER_DIRS = {
  primary: "supplier-profiles",
  /** Reworded variants used only by the phrasing-robustness evaluation. */
  paraphrased: "paraphrased",
} as const;

export type SupplierDirKey = keyof typeof SUPPLIER_DIRS;

export async function discoverDocuments(
  dataDir: string,
  supplierDirKey: SupplierDirKey = "primary",
): Promise<Array<{ absPath: string; kind: DocumentKind }>> {
  const docs: Array<{ absPath: string; kind: DocumentKind }> = [
    { absPath: path.join(dataDir, "product-brief.md"), kind: "product-brief" },
  ];

  // Still an explicit named directory, never a glob: the answer key in
  // DATA_MANIFEST.md remains unreachable regardless of which variant is loaded.
  const supplierDir = path.join(dataDir, SUPPLIER_DIRS[supplierDirKey]);
  const entries = await readdir(supplierDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && SUPPLIER_EXTENSIONS.has(path.extname(e.name)))
    .map((e) => e.name)
    // readdir order is not guaranteed across platforms; without this the demo
    // would order suppliers differently on a reviewer's machine.
    .sort((a, b) => a.localeCompare(b, "en"));

  for (const name of files) {
    docs.push({ absPath: path.join(supplierDir, name), kind: "supplier-profile" });
  }
  return docs;
}

function deriveTitle(text: string, fallback: string): string {
  for (const line of text.split("\n")) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return m[1].trim();
    if (line.trim().length > 0) break;
  }
  return fallback;
}

function deriveShortId(docId: string, kind: DocumentKind): string {
  if (kind === "product-brief") return "product-brief";
  const m = /^(supplier-\d+)/.exec(docId);
  return m ? m[1] : docId;
}

export async function loadDocument(
  absPath: string,
  kind: DocumentKind,
  projectRoot: string,
): Promise<SourceDocument> {
  const raw = await readFile(absPath, "utf8");
  const { text, normalizations } = normalizeText(raw);
  const docId = path.basename(absPath, path.extname(absPath));
  const title = deriveTitle(text, docId);

  return {
    docId,
    shortId: deriveShortId(docId, kind),
    kind,
    title,
    supplierName:
      kind === "supplier-profile"
        ? title.replace(/^Supplier Profile:\s*/i, "").trim()
        : undefined,
    relPath: path.relative(projectRoot, absPath).split(path.sep).join("/"),
    text,
    sha256: sha256(text),
    lineStarts: buildLineStarts(text),
    normalizations,
    loadedAt: new Date().toISOString(),
  };
}

export function ingestDocument(doc: SourceDocument): IngestedDocument {
  const all = chunkDocument(
    doc.docId,
    doc.text,
    doc.lineStarts,
    DEFAULT_CHUNKER_CONFIG,
  );

  const chunks: DocumentChunk[] = [];
  const excluded: ExcludedChunk[] = [];
  const warnings: LeakageWarning[] = [];

  for (const chunk of all) {
    // Structural exclusion applies uniformly to every document that has a
    // trailer, not only to the ones whose trailers happened to leak. Excluding
    // selectively based on which documents gave away answers would itself be
    // label-dependent preprocessing.
    if (chunk.role === "trailer") {
      excluded.push({
        chunk,
        ruleId: "trailer-region",
        matchedText: null,
        rationale:
          "Post-terminal-rule metadata region: document provenance, not supplier evidence.",
      });
      continue;
    }

    const hits = scanLeakage(chunk.text, doc.kind);
    const hard = hits.find((h) => h.rule.severity === "hard");
    if (hard) {
      excluded.push({
        chunk,
        ruleId: hard.rule.id,
        matchedText: hard.match,
        rationale: hard.rule.rationale,
      });
      continue;
    }

    for (const soft of hits.filter((h) => h.rule.severity === "soft")) {
      warnings.push({
        docId: doc.docId,
        chunkId: chunk.chunkId,
        ruleId: soft.rule.id,
        matchedText: soft.match,
      });
    }

    chunks.push(chunk);
  }

  return { doc, chunks, excluded, warnings };
}

let corpusPromise: Promise<Corpus> | null = null;
let cacheStamp: string | null = null;

async function buildCorpus(
  supplierDirKey: SupplierDirKey = "primary",
): Promise<Corpus> {
  const dataDir = resolveDataDir();
  const projectRoot = path.dirname(dataDir);
  const discovered = await discoverDocuments(dataDir, supplierDirKey);

  const ingested: IngestedDocument[] = [];
  for (const { absPath, kind } of discovered) {
    const doc = await loadDocument(absPath, kind, projectRoot);
    ingested.push(ingestDocument(doc));
  }

  const brief = ingested.find((d) => d.doc.kind === "product-brief");
  if (!brief) throw new Error("Product brief not found in discovered documents.");
  const suppliers = ingested.filter((d) => d.doc.kind === "supplier-profile");

  const byChunkId = new Map<string, { doc: SourceDocument; chunk: DocumentChunk }>();
  for (const d of ingested) {
    for (const chunk of [...d.chunks, ...d.excluded.map((e) => e.chunk)]) {
      if (byChunkId.has(chunk.chunkId)) {
        throw new Error(`Duplicate chunkId: ${chunk.chunkId}`);
      }
      byChunkId.set(chunk.chunkId, { doc: d.doc, chunk });
    }
  }

  return {
    brief,
    suppliers,
    byChunkId,
    builtAt: new Date().toISOString(),
  };
}

async function currentStamp(): Promise<string> {
  const dataDir = resolveDataDir();
  const discovered = await discoverDocuments(dataDir);
  const parts: string[] = [];
  for (const { absPath } of discovered) {
    const s = await stat(absPath);
    parts.push(`${absPath}:${s.mtimeMs}`);
  }
  return parts.join("|");
}

/**
 * Memoizes the Promise rather than the value, so concurrent renders on a cold
 * module share a single filesystem pass instead of racing.
 */
export async function getCorpus(opts?: { force?: boolean }): Promise<Corpus> {
  const force = opts?.force || process.env.INGEST_NO_CACHE === "1";

  if (!force && corpusPromise && process.env.NODE_ENV === "production") {
    return corpusPromise;
  }

  if (!force && corpusPromise && cacheStamp !== null) {
    const stamp = await currentStamp();
    if (stamp === cacheStamp) return corpusPromise;
  }

  cacheStamp = await currentStamp();
  corpusPromise = buildCorpus();
  return corpusPromise;
}

export function clearCorpusCache(): void {
  corpusPromise = null;
  cacheStamp = null;
}

/**
 * Build a corpus from an alternate supplier directory, bypassing the cache.
 *
 * Used by the phrasing-robustness evaluation, which needs the reworded variants
 * alongside the primary corpus rather than instead of it.
 */
export async function buildCorpusVariant(
  supplierDirKey: SupplierDirKey,
): Promise<Corpus> {
  return buildCorpus(supplierDirKey);
}

export function buildAudit(corpus: Corpus): IngestionAudit {
  const all = [corpus.brief, ...corpus.suppliers];

  const documents = all.map((d) => ({
    docId: d.doc.docId,
    relPath: d.doc.relPath,
    sha256: d.doc.sha256,
    retainedChunks: d.chunks.length,
    excludedChunks: d.excluded.length,
    retainedChars: d.chunks.reduce((n, c) => n + c.text.length, 0),
    excludedChars: d.excluded.reduce((n, e) => n + e.chunk.text.length, 0),
    estimatedTokens: estimateTokens(d.chunks.map((c) => c.text).join("\n")),
  }));

  const exclusions = all.flatMap((d) =>
    d.excluded.map((e) => ({
      docId: d.doc.docId,
      chunkId: e.chunk.chunkId,
      ruleId: e.ruleId,
      rationale: e.rationale,
      chars: e.chunk.text.length,
      excerpt: e.chunk.text.replace(/\s+/g, " ").slice(0, 120),
    })),
  );

  return {
    builtAt: corpus.builtAt,
    documents,
    exclusions,
    warnings: all.flatMap((d) => d.warnings),
    totals: {
      documents: documents.length,
      retainedChunks: documents.reduce((n, d) => n + d.retainedChunks, 0),
      excludedChunks: documents.reduce((n, d) => n + d.excludedChunks, 0),
      estimatedTokens: documents.reduce((n, d) => n + d.estimatedTokens, 0),
    },
  };
}
