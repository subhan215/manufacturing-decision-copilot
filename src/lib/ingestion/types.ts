/**
 * Ingestion contracts.
 *
 * String-literal unions only — no enums/namespaces/decorators — so these files
 * run unchanged under Node's native TypeScript type stripping (used by the CLI
 * inspection script) as well as under Next's bundler.
 *
 * Offset convention: every `start`/`end` in this module is a JS string index
 * (UTF-16 code unit) into `SourceDocument.text`, which is the NORMALIZED text.
 * Byte offsets are never used anywhere, including in anything shown to a model.
 */

export type DocumentKind = "product-brief" | "supplier-profile";

export type ChunkRole =
  | "title-block" // leading heading + key:value preamble before the first section
  | "section" // a detected heading and its body
  | "body" // fallback: paragraph-packed block, no heading detected
  | "trailer"; // post-horizontal-rule tail (provenance footers live here)

export interface SourceDocument {
  /** File basename without extension, e.g. "supplier-08-meridian-beauty-manufacturing". */
  docId: string;
  /** Compact display/prompt id, e.g. "supplier-08" or "product-brief". */
  shortId: string;
  kind: DocumentKind;
  title: string;
  /** Supplier profiles only: title with the "Supplier Profile: " prefix removed. */
  supplierName?: string;
  /** Repo-relative, posix separators. */
  relPath: string;
  /** Normalized canonical text. ALL offsets index this, never the bytes on disk. */
  text: string;
  /** sha256 of `text` (not of the raw bytes) — the reproducibility anchor. */
  sha256: string;
  /** lineStarts[i] is the offset of line i+1 (lines are 1-based everywhere). */
  lineStarts: number[];
  normalizations: string[];
  loadedAt: string;
}

export interface DocumentChunk {
  /** `${docId}#s{seq}-{headingSlug}`, plus `/p2`, `/p3` for split parts. */
  chunkId: string;
  docId: string;
  /**
   * Index among ALL detected units, including ones later excluded. Stable by
   * design: tuning an exclusion rule must never renumber surviving chunks, or
   * every stored gold-label citation silently breaks.
   */
  seq: number;
  role: ChunkRole;
  /** Verbatim heading, e.g. "Quality history (audited production batches, n=15)". */
  headingText: string | null;
  /** Normalized, e.g. "quality-history". Comparable across documents. */
  headingSlug: string;
  headingPath: string[];
  /** INVARIANT: doc.text.slice(start, end) === text */
  text: string;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  /**
   * Set when an oversize section was split. A prompt builder must always include
   * every part of a group together, or evidence that belongs together (e.g. two
   * contradictory statements) can be seen in isolation.
   */
  splitGroupId?: string;
}

/**
 * Deliberately NOT assignable to DocumentChunk. Prompt builders accept
 * DocumentChunk[]; quarantined text is structurally unable to reach them, so
 * nobody can forget a `.filter()` that does not exist.
 */
export interface ExcludedChunk {
  chunk: DocumentChunk;
  ruleId: string;
  matchedText: string | null;
  /** Human sentence for the judge-facing audit table. */
  rationale: string;
}

export interface LeakageWarning {
  docId: string;
  chunkId: string;
  ruleId: string;
  matchedText: string;
}

export interface IngestedDocument {
  doc: SourceDocument;
  /** Retained only. This is the only text that may ever reach a model. */
  chunks: DocumentChunk[];
  excluded: ExcludedChunk[];
  warnings: LeakageWarning[];
}

export interface Corpus {
  brief: IngestedDocument;
  suppliers: IngestedDocument[];
  byChunkId: Map<string, { doc: SourceDocument; chunk: DocumentChunk }>;
  builtAt: string;
}

/** What a model is asked to emit when it makes a claim. */
export interface CitationRef {
  chunkId: string;
  quote: string;
}

export type CitationStatus =
  | "exact" // quote found byte-identical in the cited chunk
  | "normalized" // found after markdown/whitespace normalization
  | "wrong-chunk" // quote is real, but lives elsewhere in the same document
  | "wrong-doc" // quote is real, but lives in a different document
  | "unknown-chunk" // cited chunk id does not exist
  | "not-found"; // quote exists nowhere in the corpus

export interface Citation extends CitationRef {
  docId: string | null;
  status: CitationStatus;
  start: number | null;
  end: number | null;
  startLine: number | null;
  endLine: number | null;
  /** Where the quote actually was, when status is wrong-chunk / wrong-doc. */
  actualChunkId: string | null;
  /** e.g. "supplier-08 › Order terms › lines 14-16" */
  locator: string;
  /** exact | normalized — both count as a correct citation. */
  isVerified: boolean;
  /** unknown-chunk | not-found — the model invented it. */
  isHallucinated: boolean;
}

export interface IngestionAudit {
  builtAt: string;
  documents: Array<{
    docId: string;
    relPath: string;
    sha256: string;
    retainedChunks: number;
    excludedChunks: number;
    retainedChars: number;
    excludedChars: number;
    estimatedTokens: number;
  }>;
  exclusions: Array<{
    docId: string;
    chunkId: string;
    ruleId: string;
    rationale: string;
    chars: number;
    /** First 120 chars, so a reviewer can see WHAT was withheld. */
    excerpt: string;
  }>;
  warnings: LeakageWarning[];
  totals: {
    documents: number;
    retainedChunks: number;
    excludedChunks: number;
    estimatedTokens: number;
  };
}
