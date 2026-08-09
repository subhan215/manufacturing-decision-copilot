import type { CitationStatus } from "../ingestion/types.ts";

/** Lower is better for cost, lead time and defect rate; higher for sustainability. */
export type CriterionDirection = "lower-better" | "higher-better";

export interface RankingCriterion {
  id: "cost" | "leadTime" | "quality" | "sustainability";
  label: string;
  direction: CriterionDirection;
  defaultWeight: number;
  unit: string;
  /** Where the value came from — shown beside the score so it can be checked. */
  provenance: "eligibility-screen" | "ranking-extraction";
}

/**
 * The brief's §3 ranking priorities. Weights are defaults; the whole point of
 * this piece is that they are adjustable and that we show what changes when
 * they are adjusted.
 */
export const CRITERIA: RankingCriterion[] = [
  {
    id: "cost",
    label: "Unit manufacturing cost",
    direction: "lower-better",
    defaultWeight: 0.35,
    unit: "USD/unit",
    provenance: "ranking-extraction",
  },
  {
    id: "leadTime",
    label: "Manufacturing lead time",
    direction: "lower-better",
    defaultWeight: 0.25,
    unit: "days",
    provenance: "eligibility-screen",
  },
  {
    id: "quality",
    label: "Quality track record (inverse of fail rate)",
    direction: "lower-better",
    defaultWeight: 0.25,
    unit: "% fail rate",
    provenance: "eligibility-screen",
  },
  {
    id: "sustainability",
    label: "Sustainability score",
    direction: "higher-better",
    defaultWeight: 0.15,
    unit: "points",
    provenance: "ranking-extraction",
  },
];

export type CriterionId = RankingCriterion["id"];

export type Weights = Record<CriterionId, number>;

export interface SignalValue {
  value: number;
  /** Verbatim text the value came from, for display beside the number. */
  citationQuote: string | null;
  citationChunkId: string | null;
  citationStatus: CitationStatus | null;
  citationLocator: string | null;
  verified: boolean;
  note: string | null;
}

export interface SupplierSignals {
  supplierId: string;
  supplierName: string;
  cost: SignalValue;
  leadTime: SignalValue;
  quality: SignalValue;
  sustainability: SignalValue;
  /** Kept for display: what the sustainability points are made of. */
  crueltyFreeDeclaration: boolean;
  thirdPartyCertifications: string[];
}

export interface NormalizedScores {
  supplierId: string;
  raw: Record<CriterionId, number>;
  normalized: Record<CriterionId, number>;
}

export interface RankedSupplier {
  rank: number;
  supplierId: string;
  supplierName: string;
  totalScore: number;
  /** Per-criterion contribution to the total, so the sum is inspectable. */
  contributions: Record<CriterionId, number>;
  normalized: Record<CriterionId, number>;
  raw: Record<CriterionId, number>;
}

export interface RankingResult {
  weights: Weights;
  ranked: RankedSupplier[];
  /** Set when a criterion had zero spread and could not discriminate. */
  degenerateCriteria: CriterionId[];
}

export interface DominanceRelation {
  dominatedId: string;
  dominatedBy: string;
  /**
   * True when the dominator is strictly better on every criterion. False means
   * at least one criterion was equal — still dominance, but weaker.
   */
  strict: boolean;
  explanation: string;
}

export interface WeightScenario {
  id: string;
  label: string;
  description: string;
  weights: Weights;
}

/**
 * The range over which one criterion's weight can move without changing the
 * winner. The established term for this in the MCDA literature is a weight
 * stability interval; reporting it is what turns "the result is sensitive to
 * cost" into a statement a buyer can act on.
 */
export interface WeightStabilityInterval {
  criterion: CriterionId;
  /** Winner at the default weight for this criterion. */
  baselineWinner: string;
  /** Weight range in which the baseline winner stays on top. */
  stableFrom: number;
  stableTo: number;
  /** Weight at which the winner first changes, if it ever does. */
  crossoverWeight: number | null;
  crossoverTo: string | null;
  /** True when no weighting of this criterion alone changes the winner. */
  alwaysStable: boolean;
}

export interface MonteCarloResult {
  samples: number;
  seed: number;
  /** Fraction of sampled weight vectors in which each supplier ranked first. */
  winProbability: Record<string, number>;
  /** Mean rank across all samples — a tiebreaker view of robustness. */
  meanRank: Record<string, number>;
}

export interface ConditionallyEligibleSupplier {
  supplierId: string;
  supplierName: string;
  /** Requirements blocked only by missing evidence, not by a hard failure. */
  unresolvedRequirements: string[];
  /** What to request in order to make a decision possible. */
  dataGaps: string[];
}

export interface SensitivityReport {
  scenarios: Array<{ scenario: WeightScenario; ranked: RankedSupplier[] }>;
  stabilityIntervals: WeightStabilityInterval[];
  monteCarlo: MonteCarloResult;
  dominance: DominanceRelation[];
}

export interface RankingReport {
  generatedAt: string;
  asOfDate: string;
  model: string;
  signals: SupplierSignals[];
  baseline: RankingResult;
  sensitivity: SensitivityReport;
  conditionallyEligible: ConditionallyEligibleSupplier[];
  /** Shown with the results, not buried in documentation. */
  limitations: string[];
}

export const LIMITATIONS: string[] = [
  "Scores are relative to the suppliers in this comparison, not absolute quality measures. The best performer on each criterion is scored 1.0 by construction, so the gaps between suppliers carry the meaning, not the endpoints.",
  "Adding or removing a supplier can change the relative scores of the others, and may reorder them. This is a known property of min-max normalisation.",
  "Soft criteria are compensatory: a strong cost score can offset a weaker sustainability score. This is safe only because all mandatory requirements were enforced beforehand, where no compensation is possible.",
  "Cost figures are stated averages across comparable products, not quotations for this product. They are indicative, not a verified price for this order.",
  "Sustainability is scored by counting documented commitments and third-party certifications. It does not measure environmental impact.",
];
