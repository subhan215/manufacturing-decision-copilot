import type {
  EligibilityScreen,
  ExtractedFinding,
  Requirement,
  VerdictStatus,
} from "../eligibility/types.ts";
import { evaluateFinding } from "../eligibility/evaluate.ts";
import type { ScenarioOutcome } from "./types.ts";

/**
 * What a requirement is costing.
 *
 * Several suppliers fail on exactly one requirement, so the question "what
 * would we gain by relaxing this?" has a concrete answer. The tool reports the
 * cost of a constraint; it does not suggest removing one. Each requirement was
 * set for a reason the documents do not contain.
 */

function eligibleIds(screen: EligibilityScreen): string[] {
  return screen.suppliers.filter((s) => s.eligible).map((s) => s.supplierId);
}

/**
 * Drop a requirement entirely and see who qualifies.
 *
 * Pure set arithmetic over verdicts we already hold: a supplier is eligible
 * without requirement R when every *other* requirement passes. Nothing is
 * re-evaluated, so nothing can be mis-parsed.
 */
export function relaxByDropping(params: {
  screen: EligibilityScreen;
  requirement: Requirement;
  caveats?: string[];
}): ScenarioOutcome {
  const { screen, requirement } = params;

  const before = eligibleIds(screen);
  const after = screen.suppliers
    .filter((s) =>
      s.verdicts
        .filter((v) => v.requirementId !== requirement.id)
        .every((v) => v.status === "pass"),
    )
    .map((s) => s.supplierId);

  const entered = after.filter((id) => !before.includes(id));

  const constraintChecks = screen.suppliers
    .filter((s) => entered.includes(s.supplierId))
    .flatMap((s) =>
      s.verdicts.map((v) => ({
        supplierId: s.supplierId,
        requirementId: v.requirementId,
        before: v.status,
        after: (v.requirementId === requirement.id
          ? "pass"
          : v.status) as VerdictStatus,
      })),
    );

  const enteredNames = screen.suppliers
    .filter((s) => entered.includes(s.supplierId))
    .map((s) => s.supplierName);

  return {
    id: `relax-${requirement.id}`,
    kind: "requirement-relaxed",
    label: `${requirement.id} not required`,
    description: `If "${requirement.title}" were dropped for this sourcing round.`,
    eligibleBefore: before,
    eligibleAfter: after,
    entered,
    exited: [],
    rankingBefore: [],
    rankingAfter: [],
    winnerChanged: false,
    constraintChecks,
    impact:
      entered.length === 0
        ? `No supplier is waiting on this requirement alone — relaxing it changes nothing.`
        : `${enteredNames.join(", ")} would become eligible; every other requirement is already satisfied.`,
    caveats: [
      "This requirement was set by the buyer for a reason the supplied documents do not record. The figure below is what the constraint costs, not a recommendation to drop it.",
      ...(params.caveats ?? []),
    ],
  };
}

/**
 * Move a numeric threshold and re-evaluate.
 *
 * Uses the same reconstruct-and-re-evaluate mechanism the evaluation harness
 * validated against arithmetic predictions, so a shifted threshold produces the
 * same verdicts the engine would have produced had the brief said so.
 */
export function relaxByThreshold(params: {
  screen: EligibilityScreen;
  requirement: Requirement;
  newThreshold: number;
  asOfDate: string;
  caveats?: string[];
}): ScenarioOutcome {
  const { screen, requirement, newThreshold, asOfDate } = params;
  const shifted: Requirement = { ...requirement, threshold: newThreshold };

  const before = eligibleIds(screen);
  const constraintChecks: ScenarioOutcome["constraintChecks"] = [];
  const after: string[] = [];

  for (const supplier of screen.suppliers) {
    let allPass = true;

    for (const verdict of supplier.verdicts) {
      let status = verdict.status;

      if (verdict.requirementId === requirement.id) {
        // Read from the verdict's own evidence rather than re-parsing its
        // display string: a change to how a comparison is formatted must not
        // be able to change a computed result.
        const value = verdict.evidence.numericValue;
        const finding: ExtractedFinding = {
          requirementId: requirement.id,
          judgement: verdict.evidence.judgement,
          numericValue: value,
          numericUnit: verdict.evidence.numericUnit ?? requirement.unit,
          certificatePresent: verdict.evidence.certificatePresent,
          certificateExpiry: verdict.evidence.certificateExpiry,
          marketingClaimOnly: verdict.evidence.marketingClaimOnly,
          categoricalValue: verdict.evidence.categoricalValue,
          evidenceAbsent: verdict.evidence.evidenceAbsent,
          conflictNote: null,
          modelConfidence: verdict.modelConfidence,
          citationChunkId: verdict.citationChunkId,
          citationQuote: verdict.citationQuote,
          reasoning: verdict.reasoning,
        };
        status = evaluateFinding(shifted, finding, asOfDate).status;

        if (status !== verdict.status) {
          constraintChecks.push({
            supplierId: supplier.supplierId,
            requirementId: verdict.requirementId,
            before: verdict.status,
            after: status,
          });
        }
      }

      if (status !== "pass") allPass = false;
    }

    if (allPass) after.push(supplier.supplierId);
  }

  const entered = after.filter((id) => !before.includes(id));
  const exited = before.filter((id) => !after.includes(id));
  const nameOf = (id: string) =>
    screen.suppliers.find((s) => s.supplierId === id)?.supplierName ?? id;

  return {
    id: `threshold-${requirement.id}-${newThreshold}`,
    kind: "requirement-relaxed",
    label: `${requirement.id} limit moved to ${newThreshold}${requirement.unit ? ` ${requirement.unit}` : ""}`,
    description: `If the ${requirement.title.toLowerCase()} limit were ${newThreshold}${requirement.unit ? ` ${requirement.unit}` : ""} instead of ${requirement.threshold}.`,
    eligibleBefore: before,
    eligibleAfter: after,
    entered,
    exited,
    rankingBefore: [],
    rankingAfter: [],
    winnerChanged: false,
    constraintChecks,
    impact:
      entered.length === 0 && exited.length === 0
        ? "No supplier's eligibility changes at this threshold."
        : [
            entered.length > 0
              ? `${entered.map(nameOf).join(", ")} would become eligible`
              : "",
            exited.length > 0
              ? `${exited.map(nameOf).join(", ")} would lose eligibility`
              : "",
          ]
            .filter(Boolean)
            .join("; ") + ".",
    caveats: [
      "This threshold came from the product brief. Changing it is a commercial decision, and the effect shown here is only on eligibility — not on whether the looser limit is acceptable.",
      ...(params.caveats ?? []),
    ],
  };
}
