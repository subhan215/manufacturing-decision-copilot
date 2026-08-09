import type { EligibilityScreen, Requirement } from "../eligibility/types.ts";
import { defaultWeights, rankSuppliers } from "../ranking/score.ts";
import type { SupplierSignals } from "../ranking/types.ts";
import { relaxByDropping, relaxByThreshold } from "./relax.ts";
import { supplierUnavailable, leadTimeSlip } from "./disrupt.ts";
import { analyseAllQuantities, concentration, type MoqLookup } from "./split.ts";
import {
  ORDER_QUANTITIES,
  type ScenarioOutcome,
  type ScenarioReport,
} from "./types.ts";

export * from "./types.ts";
export { concentration, analyseSplits, analyseAllQuantities } from "./split.ts";
export { relaxByDropping, relaxByThreshold } from "./relax.ts";
export { supplierUnavailable, leadTimeSlip } from "./disrupt.ts";

/**
 * Extra caveats attached to specific relaxations, where the consequence is not
 * the one the headline number implies.
 */
const RELAXATION_CAVEATS: Record<string, string[]> = {
  "MR-6": [
    "Each overseas option states that export shipping, customs clearance and inbound freight are additional and are not included in its quoted lead time. Any unit-price saving shown is therefore not a landed saving, and the supplied documents do not contain enough to compute one.",
  ],
  "MR-2": [
    "This is a regulatory exposure rather than a cost trade-off. The supplier waiting on this requirement offers a promotional compliance claim with no certificate record, so relaxing it means accepting an unverified claim, not accepting a known risk.",
  ],
  "MR-4": [
    "A higher accepted defect rate converts into rework, scrap and returns downstream. Those costs are real and are not modelled here.",
  ],
  "MR-5": [
    "The lead-time limit exists to hit a launch date, which the supplied documents do not give. Moving it is a decision about the launch, not about the supplier — and the supplier this admits is the most expensive option in the set, so it buys no cost relief either.",
  ],
  "MR-1": [
    "Capability is not a threshold that can be negotiated. A facility without a liquid-fill line cannot produce this product at any price.",
  ],
};

/** Extract each supplier's MOQ from the deterministic evaluator's own output. */
export function moqsFromScreen(screen: EligibilityScreen): MoqLookup[] {
  return screen.suppliers.flatMap((s) => {
    const moq = s.verdicts.find((v) => v.requirementId === "MR-3")?.evidence
      .numericValue;
    if (moq === null || moq === undefined) return [];
    return [{ supplierId: s.supplierId, moq }];
  });
}

export function runAllScenarios(params: {
  screen: EligibilityScreen;
  signals: SupplierSignals[];
  requirements: Requirement[];
  asOfDate: string;
}): ScenarioReport {
  const { screen, signals, requirements, asOfDate } = params;

  const moqs = moqsFromScreen(screen);
  const splits = analyseAllQuantities({ signals, moqs });

  // Baseline: the current recommendation, described as what it actually is —
  // a single-supplier plan, concentration 1.0.
  const ranked = signals.length > 0
    ? rankSuppliers(signals, defaultWeights()).ranked
    : [];
  const top = ranked[0];
  const topSignals = signals.find((s) => s.supplierId === top?.supplierId);

  const baseline = topSignals
    ? {
        orderQuantity: ORDER_QUANTITIES.launch,
        supplierId: topSignals.supplierId,
        supplierName: topSignals.supplierName,
        unitCost: topSignals.cost.value,
        totalCost: topSignals.cost.value * ORDER_QUANTITIES.launch,
        leadTimeDays: topSignals.leadTime.value,
        concentration: concentration([1]),
        description:
          `Place the full ${ORDER_QUANTITIES.launch.toLocaleString()}-unit launch order with ${topSignals.supplierName}. ` +
          `This is a sole-source plan: the entire order depends on one supplier, and the concentration measure is 1.0 by definition.`,
      }
    : null;

  const scenarios: ScenarioOutcome[] = [];

  // Which requirements are worth relaxing: those blocking a supplier that would
  // otherwise qualify. Anything else changes nothing and is not worth showing.
  const nearMissRequirements = new Set(
    screen.suppliers
      .filter((s) => !s.eligible && s.blockingRequirements.length === 1)
      .map((s) => s.blockingRequirements[0]),
  );

  for (const requirement of requirements) {
    if (!nearMissRequirements.has(requirement.id)) continue;

    if (requirement.kind === "numeric-threshold" && requirement.threshold !== null) {
      // Relax to whatever the blocked supplier actually offers, so the scenario
      // answers "what would it take?" rather than picking a round number.
      const blocked = screen.suppliers.find(
        (s) =>
          !s.eligible &&
          s.blockingRequirements.length === 1 &&
          s.blockingRequirements[0] === requirement.id,
      );
      const verdict = blocked?.verdicts.find(
        (v) => v.requirementId === requirement.id,
      );
      const needed = verdict?.evidence.numericValue ?? requirement.threshold;

      scenarios.push(
        relaxByThreshold({
          screen,
          requirement,
          newThreshold: needed,
          asOfDate,
          caveats: RELAXATION_CAVEATS[requirement.id],
        }),
      );
    } else {
      scenarios.push(
        relaxByDropping({
          screen,
          requirement,
          caveats: RELAXATION_CAVEATS[requirement.id],
        }),
      );
    }
  }

  if (top) {
    scenarios.push(
      supplierUnavailable({ screen, signals, supplierId: top.supplierId }),
    );
  }

  const leadTimeRequirement = requirements.find((r) => r.id === "MR-5");
  if (leadTimeRequirement) {
    scenarios.push(
      leadTimeSlip({
        screen,
        signals,
        requirement: leadTimeRequirement,
        slipFactor: 1.25,
        asOfDate,
      }),
    );
  }

  const disruptionCount = scenarios.filter(
    (s) => s.kind === "supplier-unavailable" || s.kind === "lead-time-slip",
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    baseline,
    scenarios,
    splits,
    trackEvidence: {
      hasBaselinePlan: baseline !== null,
      disruptionScenarioCount: disruptionCount,
      everyScenarioHasConstraintChecks: scenarios.every(
        (s) => s.constraintChecks.length > 0,
      ),
      tradeoffsCovered: {
        cost: splits.some((s) => s.options.some((o) => o.totalCost > 0)),
        timing: splits.some((s) => s.options.some((o) => o.leadTimeDays > 0)),
        quality: splits.some((s) => s.options.some((o) => o.blendedFailRate > 0)),
        concentration: splits.some((s) =>
          s.options.some((o) => o.concentration.effectiveSuppliers > 1),
        ),
      },
    },
  };
}
