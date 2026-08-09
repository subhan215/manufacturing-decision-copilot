import { evaluateFinding } from "./evaluate.ts";
import type {
  EligibilityScreen,
  ExtractedFinding,
  Requirement,
  RequirementVerdict,
  SupplierScreen,
} from "./types.ts";

/**
 * Re-decide an entire screen against changed thresholds.
 *
 * This is the payoff of "the model reads, the code decides". Every verdict
 * carries the evidence it was derived from, so moving the MOQ ceiling from
 * 5,000 to 8,000 is a pure recomputation — the same `evaluateFinding` the
 * evaluation was measured against, running in the browser, with no model call
 * and no server round trip. Nothing is re-read, so nothing can drift.
 *
 * Deliberately free of Node APIs so the interface can import it directly.
 */

export type ThresholdOverrides = Record<string, number>;

export function applyOverrides(
  requirements: Requirement[],
  overrides: ThresholdOverrides,
): Requirement[] {
  return requirements.map((r) =>
    r.id in overrides ? { ...r, threshold: overrides[r.id] } : r,
  );
}

/**
 * Rebuild one verdict under a (possibly changed) requirement.
 *
 * Citation, reasoning and confidence are carried through untouched: the
 * evidence did not change, only the rule applied to it. Re-labelling the
 * quote would misrepresent what the model actually said.
 */
export function rescreenVerdict(
  verdict: RequirementVerdict,
  requirement: Requirement,
  asOfDate: string,
): RequirementVerdict {
  const finding: ExtractedFinding = {
    requirementId: requirement.id,
    judgement: verdict.evidence.judgement,
    numericValue: verdict.evidence.numericValue,
    numericUnit: verdict.evidence.numericUnit,
    certificatePresent: verdict.evidence.certificatePresent,
    certificateExpiry: verdict.evidence.certificateExpiry,
    marketingClaimOnly: verdict.evidence.marketingClaimOnly,
    categoricalValue: verdict.evidence.categoricalValue,
    evidenceAbsent: verdict.evidence.evidenceAbsent,
    conflictNote: verdict.conflictNote,
    modelConfidence: verdict.modelConfidence,
    citationChunkId: verdict.citationChunkId,
    citationQuote: verdict.citationQuote,
    reasoning: verdict.reasoning,
  };

  const outcome = evaluateFinding(requirement, finding, asOfDate);

  // An unverifiable citation was downgraded once and stays downgraded. A
  // threshold change cannot restore evidence that failed verification.
  const status = verdict.citationUnverified
    ? verdict.status
    : outcome.status;

  return {
    ...verdict,
    status,
    comparison: outcome.comparison,
  };
}

export function rescreenSupplier(
  supplier: SupplierScreen,
  requirements: Requirement[],
  asOfDate: string,
): SupplierScreen {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const verdicts = supplier.verdicts.map((v) => {
    const requirement = byId.get(v.requirementId);
    return requirement ? rescreenVerdict(v, requirement, asOfDate) : v;
  });
  const blocking = verdicts
    .filter((v) => v.status !== "pass")
    .map((v) => v.requirementId);

  return {
    ...supplier,
    verdicts,
    eligible: supplier.error === null && blocking.length === 0,
    blockingRequirements: blocking,
  };
}

export function rescreen(
  screen: EligibilityScreen,
  requirements: Requirement[],
  overrides: ThresholdOverrides,
): EligibilityScreen {
  if (Object.keys(overrides).length === 0) return screen;
  const applied = applyOverrides(requirements, overrides);
  return {
    ...screen,
    suppliers: screen.suppliers.map((s) =>
      rescreenSupplier(s, applied, screen.asOfDate),
    ),
  };
}

/** Requirements a user can move: numeric ones with a threshold and a unit. */
export function adjustableRequirements(
  requirements: Requirement[],
): Requirement[] {
  return requirements.filter(
    (r) => r.kind === "numeric-threshold" && r.threshold !== null,
  );
}
