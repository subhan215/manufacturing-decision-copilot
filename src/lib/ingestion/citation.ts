import type {
  Citation,
  CitationRef,
  Corpus,
  DocumentChunk,
  SourceDocument,
} from "./types.ts";
import { offsetToLine } from "./text.ts";

/**
 * Normalize text for quote matching while preserving a mapping back to the
 * original offsets.
 *
 * This exists because evidence in the corpus carries Markdown emphasis — e.g.
 * supplier-13 states `**not stated.**` and supplier-03's certification
 * statements sit inside blockquotes. A model asked to quote verbatim returns
 * `not stated.` without the asterisks. Matching only on exact strings would
 * score those correct citations as failures and report a large, entirely
 * fictitious citation-error rate.
 *
 * `indexMap[i]` is the offset in the ORIGINAL string of normalized character
 * `i`, which is what lets a normalized match resolve back to real offsets for
 * highlighting and verification.
 */
export function normalizeForMatch(input: string): {
  text: string;
  indexMap: number[];
} {
  const out: string[] = [];
  const indexMap: number[] = [];
  let i = 0;
  let atLineStart = true;
  let pendingSpace = false;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      if (ch === "\n") atLineStart = true;
      if (out.length > 0) pendingSpace = true;
      i++;
      continue;
    }

    if (atLineStart) {
      // Leading blockquote markers, list bullets and heading hashes are layout,
      // not content, so a quote that omits them should still match.
      const rest = input.slice(i);
      const lead = /^(?:>+\s*|[-*+]\s+|#{1,6}\s+)/.exec(rest);
      if (lead) {
        i += lead[0].length;
        continue;
      }
    }
    atLineStart = false;

    if (ch === "*" || ch === "_") {
      i++;
      continue;
    }

    if (pendingSpace) {
      out.push(" ");
      indexMap.push(i);
      pendingSpace = false;
    }

    out.push(ch);
    indexMap.push(i);
    i++;
  }

  return { text: out.join(""), indexMap };
}

/** Locate a quote inside `haystack`, tolerating markdown/whitespace drift. */
function locate(
  haystack: string,
  quote: string,
): { start: number; end: number; normalized: boolean } | null {
  const exact = haystack.indexOf(quote);
  if (exact !== -1) {
    return { start: exact, end: exact + quote.length, normalized: false };
  }

  const hay = normalizeForMatch(haystack);
  const needle = normalizeForMatch(quote).text;
  if (needle.length === 0) return null;

  const at = hay.text.indexOf(needle);
  if (at === -1) return null;

  const start = hay.indexMap[at];
  const lastNormIdx = at + needle.length - 1;
  const end = hay.indexMap[lastNormIdx] + 1;
  return { start, end, normalized: true };
}

export function formatLocator(
  doc: SourceDocument,
  chunk: DocumentChunk | null,
  start: number | null,
  end: number | null,
): string {
  const parts = [doc.shortId];
  if (chunk?.headingText) parts.push(chunk.headingText);
  if (start !== null && end !== null) {
    const a = offsetToLine(doc.lineStarts, start);
    const b = offsetToLine(doc.lineStarts, Math.max(start, end - 1));
    parts.push(a === b ? `line ${a}` : `lines ${a}-${b}`);
  }
  return parts.join(" › ");
}

function build(
  ref: CitationRef,
  doc: SourceDocument | null,
  chunk: DocumentChunk | null,
  status: Citation["status"],
  span: { start: number; end: number } | null,
  actualChunkId: string | null,
): Citation {
  return {
    ...ref,
    docId: doc?.docId ?? null,
    status,
    start: span?.start ?? null,
    end: span?.end ?? null,
    startLine:
      doc && span ? offsetToLine(doc.lineStarts, span.start) : null,
    endLine:
      doc && span
        ? offsetToLine(doc.lineStarts, Math.max(span.start, span.end - 1))
        : null,
    actualChunkId,
    locator: doc
      ? formatLocator(doc, chunk, span?.start ?? null, span?.end ?? null)
      : `unresolved (${ref.chunkId})`,
    isVerified: status === "exact" || status === "normalized",
    isHallucinated: status === "unknown-chunk" || status === "not-found",
  };
}

/**
 * Verify a model-supplied citation against the corpus.
 *
 * This is mechanical verification rather than probabilistic judging: either the
 * quoted text physically exists at the cited location or it does not. That is
 * what makes "citation correctness" and "hallucination rate" defensible numbers
 * rather than an assertion.
 */
export function resolveCitation(ref: CitationRef, corpus: Corpus): Citation {
  const entry = corpus.byChunkId.get(ref.chunkId);
  if (!entry) {
    return build(ref, null, null, "unknown-chunk", null, null);
  }
  const { doc, chunk } = entry;

  const inChunk = locate(chunk.text, ref.quote);
  if (inChunk) {
    const span = {
      start: chunk.start + inChunk.start,
      end: chunk.start + inChunk.end,
    };
    return build(
      ref,
      doc,
      chunk,
      inChunk.normalized ? "normalized" : "exact",
      span,
      chunk.chunkId,
    );
  }

  const inDoc = locate(doc.text, ref.quote);
  if (inDoc) {
    const span = { start: inDoc.start, end: inDoc.end };
    const owner = findChunkAt(corpus, doc.docId, inDoc.start);
    return build(ref, doc, owner, "wrong-chunk", span, owner?.chunkId ?? null);
  }

  for (const [, candidate] of corpus.byChunkId) {
    if (candidate.doc.docId === doc.docId) continue;
    const hit = locate(candidate.chunk.text, ref.quote);
    if (hit) {
      const span = {
        start: candidate.chunk.start + hit.start,
        end: candidate.chunk.start + hit.end,
      };
      return build(
        ref,
        candidate.doc,
        candidate.chunk,
        "wrong-doc",
        span,
        candidate.chunk.chunkId,
      );
    }
  }

  return build(ref, doc, chunk, "not-found", null, null);
}

function findChunkAt(
  corpus: Corpus,
  docId: string,
  offset: number,
): DocumentChunk | null {
  for (const [, entry] of corpus.byChunkId) {
    if (entry.doc.docId !== docId) continue;
    if (offset >= entry.chunk.start && offset < entry.chunk.end) {
      return entry.chunk;
    }
  }
  return null;
}

export function verifyCitations(
  refs: CitationRef[],
  corpus: Corpus,
): { citations: Citation[]; verifiedRate: number; hallucinationRate: number } {
  const citations = refs.map((r) => resolveCitation(r, corpus));
  const n = citations.length || 1;
  return {
    citations,
    verifiedRate: citations.filter((c) => c.isVerified).length / n,
    hallucinationRate: citations.filter((c) => c.isHallucinated).length / n,
  };
}
