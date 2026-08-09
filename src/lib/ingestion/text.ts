import { createHash } from "node:crypto";

/**
 * Normalize raw file text into the canonical form that all offsets index.
 *
 * Order matters: every transformation that can change string length must happen
 * BEFORE any offset, line index, or hash is computed. Normalizing afterwards
 * would shift every recorded position.
 */
export function normalizeText(raw: string): {
  text: string;
  normalizations: string[];
} {
  const normalizations: string[] = [];
  let text = raw;

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    normalizations.push("strip-bom");
  }

  if (text.includes("\r")) {
    text = text.replace(/\r\n?/g, "\n");
    normalizations.push("crlf-to-lf");
  }

  const nfc = text.normalize("NFC");
  if (nfc !== text) {
    text = nfc;
    normalizations.push("nfc");
  }

  return { text, normalizations };
}

/** lineStarts[i] is the offset at which line i+1 begins. */
export function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** 1-based line number containing `offset`. */
export function offsetToLine(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Rough token count for budget reporting only. Always label output as
 * "estimated" — this is not a real tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

export function countNonWhitespace(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) n++;
  }
  return n;
}
