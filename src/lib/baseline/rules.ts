import { affirmedTerms, isNegated } from "./negation.ts";

/**
 * Rule definitions for the non-AI baseline.
 *
 * Every rule is stated here in full so a reviewer can audit exactly what the
 * baseline does. The intent is a competent, good-faith rule-based screener —
 * the kind a team would actually write without an LLM — not a weakened
 * comparison. It is given negation detection, explicit-absence handling, and
 * date arithmetic: every capability available to pattern matching that does not
 * require reading comprehension.
 */

export interface RuleOutcome {
  status: "pass" | "fail" | "insufficient-evidence";
  /** Text the rule matched, used as the baseline's citation. */
  evidence: string | null;
  /** Human-readable account of what the rule did. */
  explanation: string;
}

/** Phrases a document uses to say a field was not supplied at all. */
export const ABSENCE_PATTERNS = [
  "not stated",
  "not provided",
  "not addressed",
  "no audited production batch records",
  "available on request",
  "not applicable",
  "n/a",
];

export function statesAbsence(text: string): string | null {
  const haystack = text.toLowerCase();
  for (const pattern of ABSENCE_PATTERNS) {
    const at = haystack.indexOf(pattern);
    if (at !== -1) {
      const start = Math.max(0, at - 60);
      return text.slice(start, at + pattern.length + 20).trim();
    }
  }
  return null;
}

/** Parse a number that may carry thousands separators: "20,000" -> 20000. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Find a number near a label.
 *
 * Ranges ("12-14 calendar days") resolve to the upper bound: for a maximum
 * threshold the conservative reading is the worst case, and a screener that
 * silently took the lower bound would pass suppliers on their best day.
 */
export function findLabelledNumber(
  text: string,
  labelPattern: RegExp,
): { value: number; evidence: string } | null {
  const label = labelPattern.exec(text);
  if (!label) return null;

  const from = label.index;
  const window = text.slice(from, from + 220);

  const range = /(\d[\d,]*)\s*[–—-]\s*(\d[\d,]*)/.exec(window);
  if (range) {
    const upper = parseNumber(range[2]);
    if (upper !== null) {
      return { value: upper, evidence: window.split("\n")[0].trim() };
    }
  }

  const single = /(\d[\d,]*(?:\.\d+)?)/.exec(window);
  if (!single) return null;
  const value = parseNumber(single[1]);
  if (value === null) return null;

  return { value, evidence: window.split("\n")[0].trim() };
}

export function findDate(text: string): { iso: string; evidence: string } | null {
  const match = /(?:valid until|expires?|expiry|expired)\s*:?\s*(\d{4}-\d{2}-\d{2})/i.exec(
    text,
  );
  if (!match) return null;
  const start = Math.max(0, match.index - 80);
  return {
    iso: match[1],
    evidence: text.slice(start, match.index + match[0].length).trim(),
  };
}

// ---------------------------------------------------------------- MR-1

const LIQUID_TERMS = [
  "liquid",
  "serum",
  "dropper-fill",
  "pump-fill",
  "liquid-fill",
];

export function ruleLiquidCapability(text: string): RuleOutcome {
  const absence = statesAbsence(text);
  if (absence) {
    return {
      status: "insufficient-evidence",
      evidence: absence,
      explanation: "Capability not described in the submitted documentation.",
    };
  }

  const affirmed = affirmedTerms(text, LIQUID_TERMS);
  if (affirmed.length > 0) {
    const term = affirmed[0];
    const at = text.toLowerCase().indexOf(term);
    return {
      status: "pass",
      evidence: text.slice(Math.max(0, at - 60), at + 90).trim(),
      explanation: `Capability terms present and not negated: ${affirmed.join(", ")}.`,
    };
  }

  const mentionedButNegated = LIQUID_TERMS.filter((t) =>
    text.toLowerCase().includes(t),
  );
  if (mentionedButNegated.length > 0) {
    const term = mentionedButNegated[0];
    const at = text.toLowerCase().indexOf(term);
    return {
      status: "fail",
      evidence: text.slice(Math.max(0, at - 80), at + 90).trim(),
      explanation: `Capability terms appear only under negation: ${mentionedButNegated.join(", ")}.`,
    };
  }

  return {
    status: "fail",
    evidence: null,
    explanation: "No liquid or serum capability terms found.",
  };
}

// ---------------------------------------------------------------- MR-2

export function ruleCertification(
  text: string,
  standard: string,
  asOfDate: string,
): RuleOutcome {
  const haystack = text.toLowerCase();
  const needle = standard.toLowerCase();

  if (!haystack.includes(needle)) {
    const absence = statesAbsence(text);
    return {
      status: absence ? "insufficient-evidence" : "fail",
      evidence: absence,
      explanation: absence
        ? "Certification status not supplied."
        : `No mention of ${standard}.`,
    };
  }

  if (isNegated(text, standard)) {
    const at = haystack.indexOf(needle);
    return {
      status: "fail",
      evidence: text.slice(Math.max(0, at - 80), at + 100).trim(),
      explanation: `${standard} appears under negation.`,
    };
  }

  const date = findDate(text);
  if (!date) {
    const at = haystack.indexOf(needle);
    return {
      status: "pass",
      evidence: text.slice(Math.max(0, at - 40), at + 120).trim(),
      explanation: `${standard} present; no validity date found to check.`,
    };
  }

  const current = date.iso >= asOfDate;
  return {
    status: current ? "pass" : "fail",
    evidence: date.evidence,
    explanation: `${standard} present; stated date ${date.iso} ${current ? "is on or after" : "precedes"} the as-of date ${asOfDate}.`,
  };
}

// ---------------------------------------------------------------- numeric

export function ruleNumericThreshold(
  text: string,
  labelPattern: RegExp,
  threshold: number,
  unit: string,
): RuleOutcome {
  const absence = statesAbsence(text);
  const found = findLabelledNumber(text, labelPattern);

  if (!found) {
    return {
      status: "insufficient-evidence",
      evidence: absence,
      explanation: absence
        ? "Value explicitly not stated."
        : "No value found near the expected label.",
    };
  }

  const ok = found.value <= threshold;
  return {
    status: ok ? "pass" : "fail",
    evidence: found.evidence,
    explanation: `Extracted ${found.value} ${unit}; threshold is ${threshold} ${unit}.`,
  };
}

/**
 * Fail rate is written as a percentage inside the quality-history section.
 *
 * Emphasis markers are stripped and the trailing bracket is not required, so
 * "(**28%** — just under the ceiling)" and the singular "1 batch (8%)" both
 * match. A competent rule author would handle both; leaving them broken would
 * have made the baseline look worse than rule-based methods actually are.
 */
export function ruleFailRate(text: string, threshold: number): RuleOutcome {
  const absence = statesAbsence(text);
  const flat = text.replace(/[*_`]/g, "");
  const match = /fail:?\s*\d+\s*batch(?:es)?\s*\(\s*(\d+(?:\.\d+)?)\s*%/i.exec(
    flat,
  );

  if (!match) {
    return {
      status: "insufficient-evidence",
      evidence: absence,
      explanation: absence
        ? "Quality history explicitly not supplied."
        : "No fail-rate percentage found.",
    };
  }

  const value = Number(match[1]);
  const start = Math.max(0, match.index - 40);
  return {
    status: value <= threshold ? "pass" : "fail",
    evidence: flat.slice(start, match.index + match[0].length).trim(),
    explanation: `Extracted ${value}% fail rate; threshold is ${threshold}%.`,
  };
}

// ---------------------------------------------------------------- MR-6

export function ruleLocation(text: string, expected: string): RuleOutcome {
  const haystack = text.toLowerCase();
  const needle = expected.toLowerCase();

  const locationLine = /location:?\s*\**\s*([^\n*]+)/i.exec(text);
  const scope = locationLine ? locationLine[1] : text;

  if (scope.toLowerCase().includes(needle) && !isNegated(scope, expected)) {
    return {
      status: "pass",
      evidence: locationLine ? locationLine[0].trim() : expected,
      explanation: `Stated location contains "${expected}".`,
    };
  }

  if (locationLine) {
    return {
      status: "fail",
      evidence: locationLine[0].trim(),
      explanation: `Stated location does not contain "${expected}".`,
    };
  }

  const absence = statesAbsence(text);
  if (absence) {
    return {
      status: "insufficient-evidence",
      evidence: absence,
      explanation: "Location not supplied.",
    };
  }

  return {
    status: haystack.includes(needle) ? "pass" : "fail",
    evidence: null,
    explanation: `Fell back to whole-document search for "${expected}".`,
  };
}

// ---------------------------------------------------------------- MR-7

const CRUELTY_FREE_TERMS = ["cruelty-free", "cruelty free"];

export function ruleCrueltyFree(text: string): RuleOutcome {
  const absence = statesAbsence(text);
  const affirmed = affirmedTerms(text, CRUELTY_FREE_TERMS);

  if (affirmed.length > 0) {
    const at = text.toLowerCase().indexOf(affirmed[0]);
    return {
      status: "pass",
      evidence: text.slice(Math.max(0, at - 50), at + 110).trim(),
      explanation: "Cruelty-free declaration terms present and not negated.",
    };
  }

  if (absence) {
    return {
      status: "insufficient-evidence",
      evidence: absence,
      explanation: "Sustainability position not supplied.",
    };
  }

  const mentioned = CRUELTY_FREE_TERMS.some((t) =>
    text.toLowerCase().includes(t),
  );
  return {
    status: "fail",
    evidence: null,
    explanation: mentioned
      ? "Cruelty-free terms appear only under negation."
      : "No cruelty-free declaration found.",
  };
}
