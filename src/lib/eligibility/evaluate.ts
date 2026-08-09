import type {
  ComparisonOperator,
  ExtractedFinding,
  Requirement,
  VerdictEvidence,
  VerdictStatus,
} from "./types.ts";

/**
 * Evidence placeholder for a verdict that carries no structured reading.
 *
 * Used where a verdict genuinely has nothing behind it — an errored supplier —
 * and by the rule-based baseline, which produces a status and a quote but never
 * a structured finding. Filling these fields with plausible-looking values to
 * make the shapes match would misrepresent what the baseline actually did.
 */
export const NO_EVIDENCE: VerdictEvidence = {
  judgement: null,
  numericValue: null,
  numericUnit: null,
  certificatePresent: null,
  certificateExpiry: null,
  marketingClaimOnly: null,
  categoricalValue: null,
  evidenceAbsent: true,
};

/**
 * Deterministic verdict derivation.
 *
 * This module contains no model calls by design. The model's job upstream is to
 * read the document and report what it says; deciding whether a reported value
 * satisfies a threshold is arithmetic, and arithmetic belongs in code. Doing
 * the comparison here rather than in the prompt is what keeps a supplier that
 * sits exactly on a limit (MOQ of 5,000 against a 5,000 ceiling) from being
 * decided by a coin flip.
 */

const OPERATOR_SYMBOL: Record<ComparisonOperator, string> = {
  lte: "≤",
  gte: "≥",
  lt: "<",
  gt: ">",
  eq: "=",
};

function compare(
  value: number,
  operator: ComparisonOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case "lte":
      return value <= threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "gt":
      return value > threshold;
    case "eq":
      return value === threshold;
  }
}

export interface EvaluationOutcome {
  status: VerdictStatus;
  /** Human-readable arithmetic for the UI, e.g. "5000 units ≤ 5000 units". */
  comparison: string | null;
}

/** Parse a date written in the document. Returns null if unusable. */
function parseDate(text: string): Date | null {
  const trimmed = text.trim();
  // Prefer an explicit ISO date; fall back to Date parsing for other formats.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluateFinding(
  requirement: Requirement,
  finding: ExtractedFinding,
  asOfDate: string,
): EvaluationOutcome {
  // A self-contradicting document is neither a pass nor a fail. The brief asks
  // for conflicting information to be exposed, not resolved — picking a side
  // here would hide exactly the thing a human needs to arbitrate.
  if (finding.conflictNote && finding.conflictNote.trim().length > 0) {
    return { status: "conflicting", comparison: null };
  }

  if (finding.evidenceAbsent) {
    return { status: "insufficient-evidence", comparison: null };
  }

  switch (requirement.kind) {
    case "numeric-threshold": {
      if (
        finding.numericValue === null ||
        requirement.threshold === null ||
        requirement.operator === null
      ) {
        return { status: "insufficient-evidence", comparison: null };
      }
      const unit = requirement.unit ?? finding.numericUnit ?? "";
      const symbol = OPERATOR_SYMBOL[requirement.operator];
      const comparison =
        `${finding.numericValue}${unit ? ` ${unit}` : ""} ${symbol} ` +
        `${requirement.threshold}${unit ? ` ${unit}` : ""}`;
      const ok = compare(
        finding.numericValue,
        requirement.operator,
        requirement.threshold,
      );
      return { status: ok ? "pass" : "fail", comparison };
    }

    case "certification": {
      // A marketing claim is not a certification record. Treating "we are
      // GMP-compliant" in a brochure as equivalent to a certificate number is
      // precisely the inference the brief forbids presenting as verified. This
      // is a genuine fail: we have positive evidence that what was offered is
      // not a certificate.
      if (finding.marketingClaimOnly === true) {
        return {
          status: "fail",
          comparison: `${requirement.certificationName ?? "certificate"}: unverified marketing claim, no certificate record`,
        };
      }
      // No certificate record in the documentation is absence of evidence, not
      // evidence of absence — the supplier may well hold the certification and
      // simply not have supplied it. Asserting a fail here would be the same
      // unsupported inference as asserting a pass, in the opposite direction.
      // It still blocks eligibility, but a reviewer is told to go and ask.
      if (finding.certificatePresent !== true) {
        return {
          status: "insufficient-evidence",
          comparison: `${requirement.certificationName ?? "certificate"}: no certificate record in the supplied documentation`,
        };
      }
      if (!finding.certificateExpiry) {
        return {
          status: "insufficient-evidence",
          comparison: `${requirement.certificationName ?? "certificate"}: no expiry date stated`,
        };
      }
      const expiry = parseDate(finding.certificateExpiry);
      const asOf = parseDate(asOfDate);
      if (!expiry || !asOf) {
        return {
          status: "insufficient-evidence",
          comparison: `unparseable date: "${finding.certificateExpiry}"`,
        };
      }
      const current = expiry.getTime() >= asOf.getTime();
      return {
        status: current ? "pass" : "fail",
        comparison: `expires ${finding.certificateExpiry} ${current ? "≥" : "<"} as-of ${asOfDate}`,
      };
    }

    case "categorical-match": {
      if (!finding.categoricalValue || !requirement.expectedValue) {
        return { status: "insufficient-evidence", comparison: null };
      }
      const actual = finding.categoricalValue.trim();
      const expected = requirement.expectedValue.trim();
      // Substring match in either direction, so "Ho Chi Minh City, Vietnam"
      // and "Mumbai, Maharashtra, India" both resolve against a country name.
      const ok =
        normalizeCategory(actual).includes(normalizeCategory(expected)) ||
        normalizeCategory(expected).includes(normalizeCategory(actual));
      return {
        status: ok ? "pass" : "fail",
        comparison: `"${actual}" ${ok ? "matches" : "does not match"} "${expected}"`,
      };
    }

    case "qualitative": {
      if (finding.judgement === "satisfied") {
        return { status: "pass", comparison: null };
      }
      if (finding.judgement === "not-satisfied") {
        return { status: "fail", comparison: null };
      }
      return { status: "insufficient-evidence", comparison: null };
    }
  }
}
