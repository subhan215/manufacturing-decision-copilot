import { normalizeSignals } from "./normalize.ts";
import {
  CRITERIA,
  type CriterionId,
  type NormalizedScores,
  type RankedSupplier,
  type RankingResult,
  type SupplierSignals,
  type Weights,
} from "./types.ts";

export function defaultWeights(): Weights {
  return CRITERIA.reduce((acc, c) => {
    acc[c.id] = c.defaultWeight;
    return acc;
  }, {} as Weights);
}

export function normalizeWeights(weights: Weights): Weights {
  const total = CRITERIA.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0);
  if (total === 0) return defaultWeights();
  return CRITERIA.reduce((acc, c) => {
    acc[c.id] = (weights[c.id] ?? 0) / total;
    return acc;
  }, {} as Weights);
}

/**
 * Weighted sum over normalised criteria.
 *
 * Deliberately simple and hand-checkable: the per-criterion contributions are
 * kept alongside the total so a reviewer can add them up themselves rather than
 * take the score on trust. That is the same reason the eligibility engine
 * reports its comparisons rather than just its verdicts.
 */
export function rankSuppliers(
  signals: SupplierSignals[],
  weights: Weights,
): RankingResult {
  const normalizedWeights = normalizeWeights(weights);
  const { scores, degenerateCriteria } = normalizeSignals(signals);
  const nameById = new Map(signals.map((s) => [s.supplierId, s.supplierName]));

  const scored = scores.map((entry: NormalizedScores) => {
    const contributions = {} as Record<CriterionId, number>;
    let total = 0;
    for (const criterion of CRITERIA) {
      const contribution =
        entry.normalized[criterion.id] * normalizedWeights[criterion.id];
      contributions[criterion.id] = contribution;
      total += contribution;
    }
    return {
      supplierId: entry.supplierId,
      supplierName: nameById.get(entry.supplierId) ?? entry.supplierId,
      totalScore: total,
      contributions,
      normalized: entry.normalized,
      raw: entry.raw,
    };
  });

  // Sort by score, then by id so equal scores produce a stable, reproducible
  // order rather than depending on input sequence.
  scored.sort(
    (a, b) => b.totalScore - a.totalScore || a.supplierId.localeCompare(b.supplierId),
  );

  const ranked: RankedSupplier[] = scored.map((s, i) => ({ rank: i + 1, ...s }));

  return { weights: normalizedWeights, ranked, degenerateCriteria };
}

/** Convenience for sweeps and sampling, where only the winner matters. */
export function winnerOf(signals: SupplierSignals[], weights: Weights): string {
  return rankSuppliers(signals, weights).ranked[0].supplierId;
}
