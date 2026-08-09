/**
 * Public surface of the ranking layer.
 *
 * Application code should import `./server.ts`; CLI scripts import this entry
 * point, since `server-only` throws under plain node.
 */
export type {
  ConditionallyEligibleSupplier,
  CriterionDirection,
  CriterionId,
  DominanceRelation,
  MonteCarloResult,
  NormalizedScores,
  RankedSupplier,
  RankingCriterion,
  RankingReport,
  RankingResult,
  SensitivityReport,
  SignalValue,
  SupplierSignals,
  WeightScenario,
  WeightStabilityInterval,
  Weights,
} from "./types.ts";

export { CRITERIA, LIMITATIONS } from "./types.ts";

export {
  extractSignals,
  RankingSignalsSchema,
  sustainabilityPoints,
} from "./signals.ts";

export { normalizeSignals } from "./normalize.ts";
export {
  defaultWeights,
  normalizeWeights,
  rankSuppliers,
  winnerOf,
} from "./score.ts";
export {
  analyseSensitivity,
  findDominance,
  monteCarlo,
  MONTE_CARLO_SAMPLES,
  MONTE_CARLO_SEED,
  scenarios,
  stabilityInterval,
  SWEEP_STEPS,
} from "./sensitivity.ts";
export { buildRankingReport } from "./report.ts";
