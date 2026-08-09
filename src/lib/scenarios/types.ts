import type { VerdictStatus } from "../eligibility/types.ts";

/**
 * Supply-risk scenario planning.
 *
 * Everything here is arithmetic over verdicts and signals already produced —
 * no model calls — which is what makes replaying a scenario instant. The
 * module is kept free of Node APIs so the interface can recompute in the
 * browser, the same constraint the ranking module works under.
 */

export type ScenarioKind =
  | "requirement-relaxed"
  | "supplier-unavailable"
  | "lead-time-slip";

/** The two order quantities the product brief states. */
export const ORDER_QUANTITIES = {
  launch: 8000,
  scaleUp: 40000,
} as const;

/**
 * Minimum share of an order a second supplier must hold for the arrangement to
 * be real dual sourcing.
 *
 * Procurement practice puts this at 20–30%: a supplier holding a token
 * allocation will not prioritise you in a shortage, they will serve the
 * customers who represent serious volume. Below this floor a "split" buys the
 * appearance of resilience without the substance.
 */
export const SECONDARY_VIABILITY_FLOOR = 0.2;

/**
 * Candidate allocations, ordered as practitioners consider them.
 *
 * 80/20 and 70/30 are the common defaults because they keep volume
 * concentrated with the primary while keeping a challenger warm. Even splits
 * come last: they maximise resilience but forfeit the volume concentration
 * that earns the better unit price.
 */
export const SPLIT_CANDIDATES = [0.2, 0.3, 0.4, 0.5] as const;

export interface ConcentrationMetric {
  /** Herfindahl-Hirschman Index: the sum of squared shares. 1.0 = sole source. */
  hhi: number;
  /**
   * Effective number of suppliers, 1/HHI. Reported alongside the index because
   * "the equivalent of 1.9 independent suppliers" means something to a buyer in
   * a way that "0.53" does not.
   */
  effectiveSuppliers: number;
}

export interface AllocationLeg {
  supplierId: string;
  supplierName: string;
  share: number;
  units: number;
  moq: number;
  meetsMoq: boolean;
  unitCost: number;
}

export interface SplitOption {
  orderQuantity: number;
  primary: AllocationLeg;
  secondary: AllocationLeg;
  feasible: boolean;
  /** Why not, when infeasible. Shown rather than filtered away. */
  infeasibleReason: string | null;
  /**
   * True when this ratio is not one of the standard candidates but the exact
   * boundary a supplier's minimum order quantity forces. Those arrangements are
   * worth showing and worth flagging: a split sitting exactly on a minimum has
   * no room to move.
   */
  derivedFromMoq: boolean;
  /** Share-weighted unit cost, and the total across the order. */
  blendedUnitCost: number;
  totalCost: number;
  /** Worst case: both suppliers must deliver before the order is complete. */
  leadTimeDays: number;
  /** Share-weighted expected defect exposure. */
  blendedFailRate: number;
  blendedSustainability: number;
  concentration: ConcentrationMetric;
  /** Cost of this split against sole-sourcing with the cheapest single option. */
  costDeltaVsSoleSource: number;
}

export interface SplitAnalysis {
  orderQuantity: number;
  soleSourceBest: {
    supplierId: string;
    supplierName: string;
    unitCost: number;
    totalCost: number;
    leadTimeDays: number;
    concentration: ConcentrationMetric;
  } | null;
  options: SplitOption[];
  feasibleCount: number;
  /** Ratios where no supplier can take the secondary share at this quantity. */
  ratiosBlockedByMoq: number[];
  headline: string;
  caveats: string[];
}

export interface ScenarioOutcome {
  id: string;
  kind: ScenarioKind;
  label: string;
  description: string;
  eligibleBefore: string[];
  eligibleAfter: string[];
  /** Suppliers that became eligible under the scenario. */
  entered: string[];
  /** Suppliers that lost eligibility under the scenario. */
  exited: string[];
  rankingBefore: string[];
  rankingAfter: string[];
  winnerChanged: boolean;
  /** Per-supplier verdict changes, so the constraint re-check is visible. */
  constraintChecks: Array<{
    supplierId: string;
    requirementId: string;
    before: VerdictStatus;
    after: VerdictStatus;
  }>;
  impact: string;
  /** Never empty. A scenario reporting an upside without a caveat is a bug. */
  caveats: string[];
}

export interface ScenarioReport {
  generatedAt: string;
  baseline: {
    orderQuantity: number;
    supplierId: string;
    supplierName: string;
    unitCost: number;
    totalCost: number;
    leadTimeDays: number;
    concentration: ConcentrationMetric;
    description: string;
  } | null;
  scenarios: ScenarioOutcome[];
  splits: SplitAnalysis[];
  /** Named so the write-up and the interface cannot drift from the code. */
  trackEvidence: {
    hasBaselinePlan: boolean;
    disruptionScenarioCount: number;
    everyScenarioHasConstraintChecks: boolean;
    tradeoffsCovered: {
      cost: boolean;
      timing: boolean;
      quality: boolean;
      concentration: boolean;
    };
  };
}
