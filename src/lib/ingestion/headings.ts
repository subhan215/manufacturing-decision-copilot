/**
 * Heading detection over raw text lines.
 *
 * Deliberately NOT a Markdown parser. The real challenge pack is expected to
 * arrive as PDFs, whose extracted text has no Markdown syntax at all — so
 * detection is heuristic over plain lines, and Markdown is treated as just one
 * shape those lines might happen to take.
 */

export type HeadingDetector =
  | "atx"
  | "setext"
  | "numbered"
  | "bold-line"
  | "caps-line";

export interface HeadingHit {
  /** 0-based index into the lines array. */
  lineIndex: number;
  level: number;
  text: string;
  detector: HeadingDetector;
}

const ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT_UNDERLINE = /^(={3,}|-{3,})$/;
const NUMBERED = /^\s*(\d+(?:\.\d+)*|[A-Z]|[IVXLC]+)[.)]\s+(\S.*)$/;
const BOLD_LINE = /^\s*(?:\*\*|__)(.{1,80}?)(?:\*\*|__):?\s*$/;
const COMBINING_MARKS = /[̀-ͯ]/g;

/** A line that is only a horizontal rule: ---, ***, ___ (3 or more). */
export function isHorizontalRule(line: string): boolean {
  return /^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line);
}

/**
 * Lines that must never be treated as headings by the weaker detectors.
 *
 * The key:value filter is the load-bearing one for this corpus: supplier
 * profiles open with lines like `**Location:** Mumbai, Maharashtra, India`, and
 * a naive "a bold line is a heading" rule would turn every data field into a
 * section boundary and shred the documents.
 */
function isRejectedAsHeading(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  if (t.length > 90) return true;
  if (!/[A-Za-z]/.test(t)) return true;
  if (t.includes("|")) return true; // table row
  if (/^>/.test(t)) return true; // blockquote
  if (/^([-*+•])\s+\S/.test(t)) return true; // bullet list item
  if (/^\*\*[^*]{1,40}:\*\*/.test(t)) return true; // **Key:** value
  if (/^[A-Z][A-Za-z ]{1,28}:\s+\S/.test(t)) return true; // Key: value
  if (/[.,;:]$/.test(t)) return true; // prose sentence or lead-in
  return false;
}

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim().length === 0;
}

function uppercaseRatio(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return 0;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length;
}

export function detectHeadings(lines: string[]): HeadingHit[] {
  const hits: HeadingHit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ATX is unambiguous, so it bypasses the prose-shaped rejection filters —
    // a legitimate heading is allowed to end in a period.
    const atx = ATX.exec(line);
    if (atx) {
      hits.push({
        lineIndex: i,
        level: atx[1].length,
        text: atx[2].trim(),
        detector: "atx",
      });
      continue;
    }

    // Setext: text underlined by === or ---. Distinguished from a horizontal
    // rule by what precedes it — a rule has a blank line above, an underline
    // has the heading text above.
    const next = lines[i + 1];
    if (
      next !== undefined &&
      SETEXT_UNDERLINE.test(next.trim()) &&
      !isBlank(line) &&
      !isRejectedAsHeading(line)
    ) {
      hits.push({
        lineIndex: i,
        level: next.trim().startsWith("=") ? 1 : 2,
        text: line.trim(),
        detector: "setext",
      });
      continue;
    }

    if (isRejectedAsHeading(line)) continue;

    const blankAbove = i === 0 || isBlank(lines[i - 1]);
    if (!blankAbove) continue;

    const numbered = NUMBERED.exec(line);
    if (numbered && isBlank(lines[i + 1])) {
      const depth = (numbered[1].match(/\./g) ?? []).length;
      hits.push({
        lineIndex: i,
        level: Math.min(6, 1 + depth),
        text: numbered[2].trim(),
        detector: "numbered",
      });
      continue;
    }

    // The two detectors below exist for PDF-extracted text, which has no
    // Markdown markers. They must not fire on this Markdown corpus — the
    // inspection script asserts a zero count.
    const bold = BOLD_LINE.exec(line);
    if (bold && isBlank(lines[i + 1])) {
      hits.push({
        lineIndex: i,
        level: 2,
        text: bold[1].trim(),
        detector: "bold-line",
      });
      continue;
    }

    const words = line.trim().split(/\s+/);
    if (words.length >= 2 && uppercaseRatio(line) >= 0.6) {
      hits.push({
        lineIndex: i,
        level: 2,
        text: line.trim(),
        detector: "caps-line",
      });
    }
  }

  return hits;
}

/**
 * Normalize a heading into a slug that is comparable ACROSS documents.
 *
 * Stripping parentheticals is what makes "Quality history (audited production
 * batches, n=27)", the n=40 variant, and a bare "Quality history" all resolve
 * to `quality-history`, so the same section is addressable in every supplier
 * profile. The verbatim heading is preserved separately for display.
 */
export function slugifyHeading(text: string): string {
  let s = text.normalize("NFKD").replace(COMBINING_MARKS, "");
  s = s.replace(/^\s*(\d+(?:\.\d+)*|[ivxlcIVXLC]+|[A-Za-z])[.)]\s+/, "");
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  s = s.replace(/[,;–—-]?\s*n\s*=\s*\d+\s*$/i, "");
  s = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (s.length > 48) {
    s = s
      .slice(0, 48)
      .replace(/-[^-]*$/, "")
      .replace(/-$/, "");
  }
  return s.length > 0 ? s : "section";
}
