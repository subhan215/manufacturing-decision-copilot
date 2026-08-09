import type {
  EligibilityScreen,
  ExtractedFinding,
  Requirement,
  VerdictStatus,
} from "../eligibility/types.ts";
import { evaluateFinding } from "../eligibility/evaluate.ts";
import { defaultWeights, rankSuppliers } from "../ranking/score.ts";
import type { SupplierSignals } from "../ranking/types.ts";
import type { ScenarioOutcome } from "./types.ts";

/**
 * Disruptions: what happens when the plan stops holding.
 *
 * A recommendation that only works while nothing goes wrong is not a sourcing
 * plan. Both scenarios below are computed from data already extracted, so they
 * cost nothing to replay.
 */

function rankIds(signals: SupplierSignals[]): string[] {
  if (signals.length === 0) return [];
  return rankSuppliers(signals, defaultWeights()).ranked.map(
    (r) => r.supplierId,
  );
}

/**
 * The recommended supplier becomes unavailable.
 *
 * Note what this exposes: removing a supplier does not simply delete a row.
 * Scores are normalised across the candidate pool, so the survivors' numbers
 * change too. That is a real property of the scoring method and is surfaced
 * rather than hidden.
 */
export function supplierUnavailable(params: {
  screen: EligibilityScreen;
  signals: SupplierSignals[];
  supplierId: string;
}): ScenarioOutcome {
  const { screen, signals, supplierId } = params;

  const before = screen.suppliers
    .filter((s) => s.eligible)
    .map((s) => s.supplierId);
  const after = before.filter((id) => id !== supplierId);

  const rankingBefore = rankIds(signals);
  const remaining = signals.filter((s) => s.supplierId !== supplierId);
  const rankingAfter = rankIds(remaining);

  const nameOf = (id: string) =>
    signals.find((s) => s.supplierId === id)?.supplierName ?? id;

  const successor = rankingAfter[0];

  return {
    id: `unavailable-${supplierId}`,
    kind: "supplier-unavailable",
    label: `${nameOf(supplierId)} unavailable`,
    description: `If the recommended supplier could not take the order — capacity, a failed audit, or a commercial breakdown.`,
    eligibleBefore: before,
    eligibleAfter: after,
    entered: [],
    exited: [supplierId],
    rankingBefore,
    rankingAfter,
    winnerChanged: rankingBefore[0] !== rankingAfter[0],
    // No requirement changed, so every surviving verdict is unchanged. Recorded
    // explicitly so the scenario still shows a constraint re-check was run.
    constraintChecks: screen.suppliers
      .filter((s) => after.includes(s.supplierId))
      .flatMap((s) =>
        s.verdicts.map((v) => ({
          supplierId: s.supplierId,
          requirementId: v.requirementId,
          before: v.status,
          after: v.status,
        })),
      ),
    impact: successor
      ? `${nameOf(successor)} becomes the recommendation. It already satisfies every mandatory requirement, so no re-qualification is needed.`
      : `No qualified alternative remains. The order cannot be placed without relaxing a requirement or sourcing outside the current set.`,
    caveats: [
      "Scores are relative to the suppliers in the comparison, so removing one changes the others' numbers as well as the order. The figures in this scenario are not directly comparable with the baseline.",
      "This assumes the alternative can absorb the full order at its stated terms. Capacity at short notice is not something the supplied documents establish.",
    ],
  };
}

/**
 * Lead times slip across the board.
 *
 * A single supplier missing a date is one problem; an industry-wide slip is a
 * different one, and it is the case where a plan built on suppliers clustered
 * near the limit fails all at once.
 */
export function leadTimeSlip(params: {
  screen: EligibilityScreen;
  signals: SupplierSignals[];
  requirement: Requirement;
  slipFactor: number;
  asOfDate: string;
}): ScenarioOutcome {
  const { screen, signals, requirement, slipFactor, asOfDate } = params;

  const before = screen.suppliers
    .filter((s) => s.eligible)
    .map((s) => s.supplierId);
  const constraintChecks: ScenarioOutcome["constraintChecks"] = [];
  const after: string[] = [];

  for (const supplier of screen.suppliers) {
    let allPass = true;

    for (const verdict of supplier.verdicts) {
      let status: VerdictStatus = verdict.status;

      if (verdict.requirementId === requirement.id) {
        const m = /^(-?[\d.]+)/.exec(verdict.comparison ?? "");
        const base = m ? Number(m[1]) : null;
        const slipped = base === null ? null : base * slipFactor;

        const finding: ExtractedFinding = {
          requirementId: requirement.id,
          judgement: null,
          numericValue: slipped,
          numericUnit: requirement.unit,
          certificatePresent: null,
          certificateExpiry: null,
          marketingClaimOnly: null,
          categoricalValue: null,
          evidenceAbsent: slipped === null,
          conflictNote: null,
          modelConfidence: verdict.modelConfidence,
          citationChunkId: verdict.citationChunkId,
          citationQuote: verdict.citationQuote,
          reasoning: verdict.reasoning,
        };
        status = evaluateFinding(requirement, finding, asOfDate).status;

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

  const exited = before.filter((id) => !after.includes(id));
  const survivingSignals = signals.filter((s) => after.includes(s.supplierId));
  const nameOf = (id: string) =>
    signals.find((s) => s.supplierId === id)?.supplierName ?? id;

  const pct = Math.round((slipFactor - 1) * 100);

  return {
    id: `lead-time-slip-${pct}`,
    kind: "lead-time-slip",
    label: `Lead times slip ${pct}%`,
    description: `If every supplier's manufacturing lead time ran ${pct}% longer than quoted.`,
    eligibleBefore: before,
    eligibleAfter: after,
    entered: [],
    exited,
    rankingBefore: rankIds(signals),
    rankingAfter: rankIds(survivingSignals),
    winnerChanged: false,
    constraintChecks,
    impact:
      exited.length === 0
        ? `Every supplier still meets the deadline with ${pct}% slack absorbed.`
        : `${exited.map(nameOf).join(", ")} would miss the launch window, leaving ${after.length} qualified supplier${after.length === 1 ? "" : "s"}. Suppliers quoting close to the limit have no room for slippage.`,
    caveats: [
      "A uniform slip is a simplification. Real delays hit suppliers unevenly, and a shared cause — a material shortage, a shipping disruption — would not respect the percentages used here.",
      "This tests the stated manufacturing lead time only. It does not model freight, customs or the time to qualify a replacement.",
    ],
  };
}
