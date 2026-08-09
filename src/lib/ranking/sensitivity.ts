import { normalizeSignals } from "./normalize.ts";
import { defaultWeights, rankSuppliers, winnerOf } from "./score.ts";
import {
  CRITERIA,
  type CriterionId,
  type DominanceRelation,
  type MonteCarloResult,
  type SensitivityReport,
  type SupplierSignals,
  type WeightScenario,
  type WeightStabilityInterval,
  type Weights,
} from "./types.ts";

export const SWEEP_STEPS = 200; // 0.5% resolution
export const MONTE_CARLO_SAMPLES = 10_000;
export const MONTE_CARLO_SEED = 20260809;

export function scenarios(): WeightScenario[] {
  const emphasise = (id: CriterionId, weight: number): Weights => {
    const others = CRITERIA.filter((c) => c.id !== id);
    const remaining = 1 - weight;
    const otherTotal = others.reduce((sum, c) => sum + c.defaultWeight, 0);
    const w = { [id]: weight } as Weights;
    for (const c of others) {
      w[c.id] = (c.defaultWeight / otherTotal) * remaining;
    }
    return w;
  };

  return [
    {
      id: "brief-default",
      label: "Brief default",
      description:
        "The priority weights stated in the product brief: cost 35%, lead time 25%, quality 25%, sustainability 15%.",
      weights: defaultWeights(),
    },
    {
      id: "cost-first",
      label: "Cost first",
      description: "Launch is price-sensitive; unit cost dominates the decision.",
      weights: emphasise("cost", 0.6),
    },
    {
      id: "quality-first",
      label: "Quality first",
      description:
        "Defect risk on a new retail listing outweighs price and speed.",
      weights: emphasise("quality", 0.6),
    },
    {
      id: "speed-first",
      label: "Speed first",
      description: "The launch window is the binding constraint.",
      weights: emphasise("leadTime", 0.6),
    },
    {
      id: "sustainability-first",
      label: "Sustainability first",
      description:
        "Retail partner or brand commitments make credentials the priority.",
      weights: emphasise("sustainability", 0.6),
    },
  ];
}

/**
 * Vary one criterion's weight across its whole range, redistributing the
 * remainder proportionally, and record where the winner changes.
 *
 * Reporting only a handful of named scenarios is the weaker, older approach:
 * it can only ever show that *those* particular weightings give *those*
 * answers. A sweep finds the actual boundary, which is what lets a buyer see
 * whether their own priorities sit close to a tipping point or comfortably
 * inside a stable region.
 */
export function stabilityInterval(
  signals: SupplierSignals[],
  criterion: CriterionId,
): WeightStabilityInterval {
  const others = CRITERIA.filter((c) => c.id !== criterion);
  const otherTotal = others.reduce((sum, c) => sum + c.defaultWeight, 0);

  const weightsAt = (value: number): Weights => {
    const remaining = 1 - value;
    const w = { [criterion]: value } as Weights;
    for (const c of others) {
      w[c.id] = otherTotal === 0 ? remaining / others.length : (c.defaultWeight / otherTotal) * remaining;
    }
    return w;
  };

  const defaults = defaultWeights();
  const baselineWinner = winnerOf(signals, defaults);
  const baselineWeight = defaults[criterion];

  const winners: Array<{ weight: number; winner: string }> = [];
  for (let i = 0; i <= SWEEP_STEPS; i++) {
    const weight = i / SWEEP_STEPS;
    winners.push({ weight, winner: winnerOf(signals, weightsAt(weight)) });
  }

  // Walk outwards from the default weight to find the contiguous region in
  // which the baseline winner holds.
  const baselineIndex = Math.round(baselineWeight * SWEEP_STEPS);
  let lo = baselineIndex;
  while (lo > 0 && winners[lo - 1].winner === baselineWinner) lo--;
  let hi = baselineIndex;
  while (hi < SWEEP_STEPS && winners[hi + 1].winner === baselineWinner) hi++;

  const alwaysStable = lo === 0 && hi === SWEEP_STEPS;

  let crossoverWeight: number | null = null;
  let crossoverTo: string | null = null;
  if (hi < SWEEP_STEPS) {
    crossoverWeight = winners[hi + 1].weight;
    crossoverTo = winners[hi + 1].winner;
  } else if (lo > 0) {
    crossoverWeight = winners[lo - 1].weight;
    crossoverTo = winners[lo - 1].winner;
  }

  return {
    criterion,
    baselineWinner,
    stableFrom: winners[lo].weight,
    stableTo: winners[hi].weight,
    crossoverWeight,
    crossoverTo,
    alwaysStable,
  };
}

/** Deterministic PRNG so a reviewer re-running this gets identical numbers. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample weight vectors uniformly from the simplex and count wins.
 *
 * Normalised exponential sampling gives a flat Dirichlet, i.e. every valid
 * combination of weights is equally likely. Naively normalising uniform draws
 * would bias towards the centre and quietly understate how often an
 * extreme-priority buyer would pick differently.
 */
export function monteCarlo(
  signals: SupplierSignals[],
  samples: number = MONTE_CARLO_SAMPLES,
  seed: number = MONTE_CARLO_SEED,
): MonteCarloResult {
  const random = mulberry32(seed);
  const wins: Record<string, number> = {};
  const rankSum: Record<string, number> = {};
  for (const s of signals) {
    wins[s.supplierId] = 0;
    rankSum[s.supplierId] = 0;
  }

  for (let i = 0; i < samples; i++) {
    const w = {} as Weights;
    let total = 0;
    for (const c of CRITERIA) {
      // -ln(U) is an Exp(1) draw; normalising a vector of them is Dirichlet(1).
      const e = -Math.log(1 - random());
      w[c.id] = e;
      total += e;
    }
    for (const c of CRITERIA) w[c.id] /= total;

    const ranked = rankSuppliers(signals, w).ranked;
    wins[ranked[0].supplierId]++;
    for (const r of ranked) rankSum[r.supplierId] += r.rank;
  }

  const winProbability: Record<string, number> = {};
  const meanRank: Record<string, number> = {};
  for (const s of signals) {
    winProbability[s.supplierId] = wins[s.supplierId] / samples;
    meanRank[s.supplierId] = rankSum[s.supplierId] / samples;
  }

  return { samples, seed, winProbability, meanRank };
}

/**
 * Pareto dominance: A dominates B when A is at least as good on every
 * criterion and strictly better on at least one.
 *
 * This is worth computing separately from the scores because it is stronger
 * than any score: a dominated supplier cannot be the best choice under *any*
 * weighting, so telling a buyer to stop considering it is safe advice rather
 * than a consequence of the weights we happened to pick.
 */
export function findDominance(signals: SupplierSignals[]): DominanceRelation[] {
  const { scores } = normalizeSignals(signals);
  const nameById = new Map(signals.map((s) => [s.supplierId, s.supplierName]));
  const relations: DominanceRelation[] = [];

  for (const candidate of scores) {
    for (const other of scores) {
      if (candidate.supplierId === other.supplierId) continue;

      const atLeastAsGood = CRITERIA.every(
        (c) => other.normalized[c.id] >= candidate.normalized[c.id] - 1e-12,
      );
      const strictlyBetterSomewhere = CRITERIA.some(
        (c) => other.normalized[c.id] > candidate.normalized[c.id] + 1e-12,
      );
      if (!atLeastAsGood || !strictlyBetterSomewhere) continue;

      const strict = CRITERIA.every(
        (c) => other.normalized[c.id] > candidate.normalized[c.id] + 1e-12,
      );
      const better = CRITERIA.filter(
        (c) => other.normalized[c.id] > candidate.normalized[c.id] + 1e-12,
      ).map((c) => c.label.toLowerCase());

      relations.push({
        dominatedId: candidate.supplierId,
        dominatedBy: other.supplierId,
        strict,
        explanation:
          `${nameById.get(other.supplierId)} is better on ${better.join(", ")} ` +
          `and no worse on the remaining criteria, so ${nameById.get(candidate.supplierId)} ` +
          `cannot rank first under any set of weights.`,
      });
    }
  }

  return relations;
}

export function analyseSensitivity(
  signals: SupplierSignals[],
): SensitivityReport {
  return {
    scenarios: scenarios().map((scenario) => ({
      scenario,
      ranked: rankSuppliers(signals, scenario.weights).ranked,
    })),
    stabilityIntervals: CRITERIA.map((c) => stabilityInterval(signals, c.id)),
    monteCarlo: monteCarlo(signals),
    dominance: findDominance(signals),
  };
}
