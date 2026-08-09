import {
  CRITERIA,
  type CriterionId,
  type NormalizedScores,
  type SupplierSignals,
} from "./types.ts";

/**
 * Min-max normalisation onto [0, 1], where 1 is always "best".
 *
 * Chosen over vector or sum normalisation because it combines stability with
 * responsiveness and is comparatively insensitive to small perturbations in the
 * inputs. The direction flip for lower-is-better criteria happens here, in one
 * place: doing it at the scoring stage instead would make an inverted criterion
 * very easy to introduce and very hard to notice, since the output would still
 * look like a plausible ranking.
 */
export function normalizeSignals(signals: SupplierSignals[]): {
  scores: NormalizedScores[];
  degenerateCriteria: CriterionId[];
} {
  const degenerate: CriterionId[] = [];

  const rawByCriterion = new Map<CriterionId, number[]>();
  for (const criterion of CRITERIA) {
    rawByCriterion.set(
      criterion.id,
      signals.map((s) => s[criterion.id].value),
    );
  }

  const scores: NormalizedScores[] = signals.map((s) => ({
    supplierId: s.supplierId,
    raw: {} as Record<CriterionId, number>,
    normalized: {} as Record<CriterionId, number>,
  }));

  for (const criterion of CRITERIA) {
    const values = rawByCriterion.get(criterion.id)!;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Every supplier identical on this criterion: it cannot discriminate, so it
    // contributes equally to all rather than dividing by zero. Flagged, because
    // a criterion carrying weight but no information should be visible.
    if (range === 0 || !Number.isFinite(range)) {
      degenerate.push(criterion.id);
      values.forEach((value, i) => {
        scores[i].raw[criterion.id] = value;
        scores[i].normalized[criterion.id] = 0.5;
      });
      continue;
    }

    values.forEach((value, i) => {
      const scaled = (value - min) / range;
      scores[i].raw[criterion.id] = value;
      scores[i].normalized[criterion.id] =
        criterion.direction === "lower-better" ? 1 - scaled : scaled;
    });
  }

  return { scores, degenerateCriteria: degenerate };
}
