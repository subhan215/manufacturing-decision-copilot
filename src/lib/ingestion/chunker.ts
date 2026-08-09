import type { DocumentChunk, ChunkRole } from "./types.ts";
import {
  detectHeadings,
  isHorizontalRule,
  slugifyHeading,
  type HeadingHit,
} from "./headings.ts";
import { offsetToLine } from "./text.ts";

export interface ChunkerConfig {
  /** Fallback packing target when no headings are detectable. */
  targetChars: number;
  /** A trailing fallback block smaller than this merges backward. */
  minChars: number;
  /**
   * Safety valve for pathological documents only. Deliberately generous: this
   * corpus is ~8k tokens total, so we are not context-constrained and large
   * chunks cost nothing. Splitting a section risks separating evidence that
   * only means something together (see supplier-03's contradictory
   * certification statements), so we avoid it unless a chunk is absurd.
   */
  maxChars: number;
  /** A terminal rule must sit at least this far into the document. */
  trailerTailRatio: number;
  /** ...and leave at most this much text after it. */
  trailerMaxTailChars: number;
  /** Documents shorter than this are never sent down the fallback path. */
  fallbackMinDocChars: number;
}

export const DEFAULT_CHUNKER_CONFIG: ChunkerConfig = {
  targetChars: 900,
  minChars: 250,
  maxChars: 4000,
  trailerTailRatio: 0.25,
  trailerMaxTailChars: 900,
  fallbackMinDocChars: 1500,
};

interface PendingUnit {
  role: ChunkRole;
  headingText: string | null;
  headingLevel: number | null;
  start: number;
  end: number;
}

/**
 * Locate a terminal horizontal rule that introduces a provenance/metadata tail.
 *
 * A rule only qualifies if it sits near the end of the document AND leaves a
 * short tail. Without those guards, a mid-document signature rule or table
 * border in a real supplier PDF would silently swallow the last several
 * sections of the document.
 */
function findTrailerStart(
  lines: string[],
  lineStarts: number[],
  textLength: number,
  cfg: ChunkerConfig,
): number | null {
  for (let i = lines.length - 1; i > 0; i--) {
    if (!isHorizontalRule(lines[i])) continue;
    const prev = lines[i - 1];
    if (prev === undefined || prev.trim().length !== 0) continue; // setext underline, not a rule

    const ruleOffset = lineStarts[i];
    const tailLength = textLength - ruleOffset;
    if (ruleOffset < textLength * (1 - cfg.trailerTailRatio)) continue;
    if (tailLength > cfg.trailerMaxTailChars) continue;
    return ruleOffset;
  }
  return null;
}

/** Trim trailing whitespace so blank lines between sections belong to no chunk. */
function trimmedEnd(text: string, start: number, end: number): number {
  let e = end;
  while (e > start && /\s/.test(text[e - 1])) e--;
  return e;
}

function packFallbackUnits(
  text: string,
  start: number,
  end: number,
  cfg: ChunkerConfig,
): PendingUnit[] {
  const region = text.slice(start, end);
  const units: PendingUnit[] = [];

  // Paragraph offsets relative to `start`.
  const paragraphs: Array<{ s: number; e: number }> = [];
  const re = /\n[ \t]*\n/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region)) !== null) {
    paragraphs.push({ s: cursor, e: m.index });
    cursor = re.lastIndex;
  }
  paragraphs.push({ s: cursor, e: region.length });

  let openStart: number | null = null;
  let openEnd = 0;
  for (const p of paragraphs) {
    if (region.slice(p.s, p.e).trim().length === 0) continue;
    if (openStart === null) {
      openStart = p.s;
      openEnd = p.e;
      continue;
    }
    if (p.e - openStart > cfg.targetChars) {
      units.push({
        role: "body",
        headingText: null,
        headingLevel: null,
        start: start + openStart,
        end: start + openEnd,
      });
      openStart = p.s;
      openEnd = p.e;
    } else {
      openEnd = p.e;
    }
  }
  if (openStart !== null) {
    units.push({
      role: "body",
      headingText: null,
      headingLevel: null,
      start: start + openStart,
      end: start + openEnd,
    });
  }

  // A short tail block merges backward rather than standing alone.
  if (
    units.length >= 2 &&
    units[units.length - 1].end - units[units.length - 1].start < cfg.minChars
  ) {
    const last = units.pop()!;
    units[units.length - 1].end = last.end;
  }

  return units;
}

function splitOversize(
  text: string,
  unit: PendingUnit,
  cfg: ChunkerConfig,
): PendingUnit[] {
  if (unit.end - unit.start <= cfg.maxChars) return [unit];

  const parts = packFallbackUnits(text, unit.start, unit.end, {
    ...cfg,
    targetChars: cfg.maxChars,
  });
  if (parts.length <= 1) return [unit];

  return parts.map((p, i) => ({
    ...p,
    role: unit.role,
    headingText: i === 0 ? unit.headingText : unit.headingText,
    headingLevel: unit.headingLevel,
  }));
}

export function chunkDocument(
  docId: string,
  text: string,
  lineStarts: number[],
  cfg: ChunkerConfig = DEFAULT_CHUNKER_CONFIG,
): DocumentChunk[] {
  const lines = text.split("\n");
  const trailerStart = findTrailerStart(lines, lineStarts, text.length, cfg);
  const bodyEnd = trailerStart ?? text.length;

  const headings = detectHeadings(lines).filter(
    (h) => lineStarts[h.lineIndex] < bodyEnd,
  );

  const pending: PendingUnit[] = [];

  if (headings.length >= 2 || (headings.length === 1 && text.length < cfg.fallbackMinDocChars)) {
    // A leading level-1 heading plus the key:value preamble beneath it forms one
    // self-contained "title block". This matters: for supplier profiles that
    // block is the only place the facility location appears, and location is
    // load-bearing evidence for one of the mandatory requirements.
    let firstSectionIdx = 0;
    if (headings[0].level === 1 && headings.length > 1) {
      firstSectionIdx = 1;
      pending.push({
        role: "title-block",
        headingText: headings[0].text,
        headingLevel: 1,
        start: 0,
        end: lineStarts[headings[firstSectionIdx].lineIndex],
      });
    } else if (headings[0].lineIndex > 0) {
      pending.push({
        role: "title-block",
        headingText: null,
        headingLevel: null,
        start: 0,
        end: lineStarts[headings[0].lineIndex],
      });
    }

    for (let i = firstSectionIdx; i < headings.length; i++) {
      const h: HeadingHit = headings[i];
      const start = lineStarts[h.lineIndex];
      const next = headings[i + 1];
      const end = next ? lineStarts[next.lineIndex] : bodyEnd;
      pending.push({
        role: "section",
        headingText: h.text,
        headingLevel: h.level,
        start,
        end,
      });
    }
  } else {
    pending.push(...packFallbackUnits(text, 0, bodyEnd, cfg));
  }

  if (trailerStart !== null) {
    pending.push({
      role: "trailer",
      headingText: null,
      headingLevel: null,
      start: trailerStart,
      end: text.length,
    });
  }

  const expanded = pending.flatMap((u) => splitOversize(text, u, cfg));

  const slugCounts = new Map<string, number>();
  const headingStack: Array<{ level: number; text: string }> = [];
  const chunks: DocumentChunk[] = [];
  let seq = 0;

  for (const unit of expanded) {
    const end = trimmedEnd(text, unit.start, unit.end);
    if (end <= unit.start) continue; // whitespace-only region, not a real unit
    const body = text.slice(unit.start, end);

    let baseSlug: string;
    if (unit.role === "title-block") baseSlug = "_titleblock";
    else if (unit.role === "trailer") baseSlug = "provenance";
    else if (unit.role === "body") baseSlug = "_body";
    else baseSlug = slugifyHeading(unit.headingText ?? "");

    const seen = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, seen + 1);
    const headingSlug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;

    if (unit.headingLevel !== null && unit.headingText !== null) {
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= unit.headingLevel
      ) {
        headingStack.pop();
      }
      headingStack.push({ level: unit.headingLevel, text: unit.headingText });
    }

    chunks.push({
      chunkId: `${docId}#s${String(seq).padStart(2, "0")}-${headingSlug}`,
      docId,
      seq,
      role: unit.role,
      headingText: unit.headingText,
      headingSlug,
      headingPath: headingStack.map((h) => h.text),
      text: body,
      start: unit.start,
      end,
      startLine: offsetToLine(lineStarts, unit.start),
      endLine: offsetToLine(lineStarts, Math.max(unit.start, end - 1)),
    });
    seq++;
  }

  return chunks;
}
