import type {
  EligibilityScreen,
  VerdictStatus,
} from "../lib/eligibility/types.ts";
import {
  goldKey,
  indexGold,
  isAcceptable,
  type GoldLabel,
  type GoldLabelFile,
} from "./gold.ts";

/**
 * Error classes, ordered by how much the mistake costs a real buyer.
 *
 * Plain accuracy assumes every misclassification is equally bad. That is wrong
 * for supplier screening: waving through an uncertified factory is not the same
 * kind of mistake as discarding a viable one, and reporting a single accuracy
 * figure would hide the difference entirely.
 */
export type ErrorClass =
  | "false-pass"
  | "false-fail"
  | "false-certainty"
  | "over-abstention"
  | "missed-conflict"
  | "other";

export const CRITICAL_ERRORS: ErrorClass[] = [
  "false-pass",
  "false-certainty",
  "missed-conflict",
];

export const ERROR_DESCRIPTIONS: Record<ErrorClass, string> = {
  "false-pass":
    "Passed a supplier the evidence disqualifies — an unqualified supplier reaches a human decision.",
  "false-fail": "Rejected a supplier the evidence supports — a viable option is lost.",
  "false-certainty":
    "Asserted a determination where the document supports none — a guess presented as an answer.",
  "over-abstention":
    "Abstained where the document supports a verdict — conservative; costs review time, not correctness.",
  "missed-conflict":
    "Resolved a self-contradicting document instead of surfacing it — hides the thing a human must arbitrate.",
  other: "Disagreement not covered by the classes above.",
};

export function classifyError(
  expected: VerdictStatus,
  actual: VerdictStatus,
): ErrorClass {
  if (expected === "conflicting" && actual !== "conflicting") {
    return "missed-conflict";
  }
  if (
    expected === "insufficient-evidence" &&
    (actual === "pass" || actual === "fail")
  ) {
    return "false-certainty";
  }
  if (actual === "insufficient-evidence" && expected !== "insufficient-evidence") {
    return "over-abstention";
  }
  if (actual === "pass" && (expected === "fail" || expected === "conflicting")) {
    return "false-pass";
  }
  if (actual === "fail" && expected === "pass") {
    return "false-fail";
  }
  return "other";
}

export interface Disagreement {
  supplierId: string;
  requirementId: string;
  expected: VerdictStatus;
  actual: VerdictStatus;
  errorClass: ErrorClass;
  critical: boolean;
  rationale: string;
}

export interface SystemScorecard {
  label: string;
  verdictsScored: number;
  correct: number;
  accuracy: number;
  /** Accuracy over labels written before any system existed. */
  preRegisteredCorrect: number;
  preRegisteredTotal: number;
  preRegisteredAccuracy: number;
  errorsByClass: Record<ErrorClass, number>;
  criticalErrors: number;
  disagreements: Disagreement[];
  eligibilityCorrect: number;
  eligibilityTotal: number;
  /**
   * Verdicts the system itself marks as needing a human — conflicting or
   * insufficient-evidence. A system that cannot flag anything implicitly asks
   * the reviewer to re-check everything.
   */
  flaggedForReview: number;
  reviewBurden: number;
  durationMs: number;
  costUsd: number | null;
}

function eligibilityFromGold(
  supplierId: string,
  gold: Map<string, GoldLabel>,
  requirementIds: string[],
): boolean {
  return requirementIds.every((id) => {
    const label = gold.get(goldKey(supplierId, id));
    return label?.expected === "pass";
  });
}

export function scoreScreen(
  label: string,
  screen: EligibilityScreen,
  goldFile: GoldLabelFile,
): SystemScorecard {
  const gold = indexGold(goldFile);

  const errorsByClass: Record<ErrorClass, number> = {
    "false-pass": 0,
    "false-fail": 0,
    "false-certainty": 0,
    "over-abstention": 0,
    "missed-conflict": 0,
    other: 0,
  };

  const disagreements: Disagreement[] = [];
  let correct = 0;
  let scored = 0;
  let preRegisteredCorrect = 0;
  let preRegisteredTotal = 0;
  let flagged = 0;

  const requirementIds = screen.suppliers[0]?.verdicts.map(
    (v) => v.requirementId,
  ) ?? [];

  for (const supplier of screen.suppliers) {
    for (const verdict of supplier.verdicts) {
      const goldLabel = gold.get(
        goldKey(supplier.supplierId, verdict.requirementId),
      );
      if (!goldLabel) continue;

      scored++;
      if (goldLabel.provenance === "pre-registered") preRegisteredTotal++;

      if (
        verdict.status === "conflicting" ||
        verdict.status === "insufficient-evidence"
      ) {
        flagged++;
      }

      if (isAcceptable(goldLabel, verdict.status)) {
        correct++;
        if (goldLabel.provenance === "pre-registered") preRegisteredCorrect++;
        continue;
      }

      const errorClass = classifyError(goldLabel.expected, verdict.status);
      errorsByClass[errorClass]++;
      disagreements.push({
        supplierId: supplier.supplierId,
        requirementId: verdict.requirementId,
        expected: goldLabel.expected,
        actual: verdict.status,
        errorClass,
        critical: CRITICAL_ERRORS.includes(errorClass),
        rationale: goldLabel.rationale,
      });
    }
  }

  let eligibilityCorrect = 0;
  for (const supplier of screen.suppliers) {
    const goldEligible = eligibilityFromGold(
      supplier.supplierId,
      gold,
      requirementIds,
    );
    if (goldEligible === supplier.eligible) eligibilityCorrect++;
  }

  return {
    label,
    verdictsScored: scored,
    correct,
    accuracy: scored === 0 ? 0 : correct / scored,
    preRegisteredCorrect,
    preRegisteredTotal,
    preRegisteredAccuracy:
      preRegisteredTotal === 0 ? 0 : preRegisteredCorrect / preRegisteredTotal,
    errorsByClass,
    criticalErrors: CRITICAL_ERRORS.reduce(
      (sum, c) => sum + errorsByClass[c],
      0,
    ),
    disagreements,
    eligibilityCorrect,
    eligibilityTotal: screen.suppliers.length,
    flaggedForReview: flagged,
    reviewBurden: scored === 0 ? 0 : flagged / scored,
    durationMs: screen.stats.totalDurationMs,
    costUsd: screen.stats.totalCostUsd,
  };
}
