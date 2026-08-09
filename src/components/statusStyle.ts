import type { VerdictStatus } from "@/lib/eligibility/types";

/**
 * Verdict presentation.
 *
 * Every status carries a mark and a text label as well as a colour. Two of the
 * four status colours sit below the 3:1 contrast threshold on the light surface
 * by design, so colour is never allowed to be the only channel — and a reader
 * with a colour-vision deficiency, a monochrome print or a forced-colors mode
 * loses nothing.
 */
export interface StatusStyle {
  label: string;
  short: string;
  mark: string;
  color: string;
  tint: string;
  description: string;
}

export const STATUS_STYLES: Record<VerdictStatus, StatusStyle> = {
  pass: {
    label: "Satisfied",
    short: "PASS",
    mark: "✓",
    color: "var(--status-good)",
    tint: "color-mix(in oklab, var(--status-good) 12%, transparent)",
    description: "The documents support this requirement being met.",
  },
  fail: {
    label: "Not satisfied",
    short: "FAIL",
    mark: "✕",
    color: "var(--status-critical)",
    tint: "color-mix(in oklab, var(--status-critical) 12%, transparent)",
    description: "The documents show this requirement is not met.",
  },
  conflicting: {
    label: "Contradictory",
    short: "CONF",
    mark: "≠",
    color: "var(--status-serious)",
    tint: "color-mix(in oklab, var(--status-serious) 16%, transparent)",
    description:
      "The document contradicts itself. The system has not chosen between the statements.",
  },
  "insufficient-evidence": {
    label: "Undetermined",
    short: "N/A",
    mark: "?",
    color: "var(--status-warning)",
    tint: "color-mix(in oklab, var(--status-warning) 16%, transparent)",
    description:
      "The documents do not address this. Absence of evidence, not evidence of absence.",
  },
};
