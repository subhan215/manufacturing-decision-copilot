import type { EligibilityScreen } from "../lib/eligibility/types.ts";
import { goldKey, indexGold, isAcceptable, type GoldLabelFile } from "./gold.ts";

/**
 * Analysis of the model's self-reported confidence.
 *
 * Accuracy-calibration cannot be measured here: the system makes no errors on
 * this corpus, so there is no variance for confidence to correlate against and
 * Expected Calibration Error is degenerate. Claiming "well calibrated" from a
 * perfect run would be unsupportable.
 *
 * A different question is answerable without errors, and is arguably more
 * useful: does confidence track the system's *own* uncertainty? Where the
 * system declines to decide — returning `conflicting` or
 * `insufficient-evidence` — it has explicitly said it cannot determine the
 * answer. If it simultaneously reports high confidence on those verdicts, the
 * signal is not tracking uncertainty at all. That is measurable, and it is the
 * empirical basis for not showing confidence to users.
 */

export type Confidence = "high" | "medium" | "low";

export interface ConfidenceAnalysis {
  distribution: Record<Confidence, number>;
  accuracyByConfidence: Record<
    Confidence,
    { total: number; correct: number; accuracy: number | null }
  >;
  /** Verdicts where the system declined to decide. */
  uncertainVerdicts: number;
  /** ...of which, how many were nonetheless labelled high confidence. */
  uncertainButHighConfidence: number;
  uncertainHighConfidenceRate: number;
  /** True when accuracy-calibration is unmeasurable (no errors to correlate). */
  calibrationUnmeasurable: boolean;
  interpretation: string;
  examples: Array<{
    supplierId: string;
    requirementId: string;
    status: string;
    confidence: Confidence;
  }>;
}

export function analyseConfidence(
  screen: EligibilityScreen,
  goldFile: GoldLabelFile,
): ConfidenceAnalysis {
  const gold = indexGold(goldFile);
  const verdicts = screen.suppliers.flatMap((s) =>
    s.verdicts.map((v) => ({ supplierId: s.supplierId, verdict: v })),
  );

  const distribution: Record<Confidence, number> = { high: 0, medium: 0, low: 0 };
  const accuracyByConfidence: ConfidenceAnalysis["accuracyByConfidence"] = {
    high: { total: 0, correct: 0, accuracy: null },
    medium: { total: 0, correct: 0, accuracy: null },
    low: { total: 0, correct: 0, accuracy: null },
  };

  let uncertain = 0;
  let uncertainHigh = 0;
  const examples: ConfidenceAnalysis["examples"] = [];

  for (const { supplierId, verdict } of verdicts) {
    const confidence = verdict.modelConfidence as Confidence;
    distribution[confidence]++;
    accuracyByConfidence[confidence].total++;

    const label = gold.get(goldKey(supplierId, verdict.requirementId));
    if (label && isAcceptable(label, verdict.status)) {
      accuracyByConfidence[confidence].correct++;
    }

    const declined =
      verdict.status === "conflicting" ||
      verdict.status === "insufficient-evidence";
    if (declined) {
      uncertain++;
      if (confidence === "high") {
        uncertainHigh++;
        examples.push({
          supplierId,
          requirementId: verdict.requirementId,
          status: verdict.status,
          confidence,
        });
      }
    }
  }

  for (const key of ["high", "medium", "low"] as Confidence[]) {
    const bucket = accuracyByConfidence[key];
    bucket.accuracy = bucket.total === 0 ? null : bucket.correct / bucket.total;
  }

  const totalErrors = Object.values(accuracyByConfidence).reduce(
    (sum, b) => sum + (b.total - b.correct),
    0,
  );
  const calibrationUnmeasurable = totalErrors === 0;

  const rate = uncertain === 0 ? 0 : uncertainHigh / uncertain;

  const interpretation = calibrationUnmeasurable
    ? `The system made no errors on this corpus, so accuracy-calibration cannot be measured: with no incorrect verdicts there is nothing for confidence to correlate against, and the data cannot distinguish a well-calibrated system from a uniformly overconfident one. ` +
      `What is measurable is whether confidence tracks the system's own uncertainty, and it does not: of ${uncertain} verdicts where the system declined to decide, ${uncertainHigh} (${(rate * 100).toFixed(0)}%) still carry high confidence. ` +
      `The system reports "I cannot determine this" and "high confidence" simultaneously. This is why confidence is recorded but never surfaced as a reliability signal, and never used in the decision path.`
    : `Accuracy by confidence level is reported above. Of ${uncertain} verdicts where the system declined to decide, ${uncertainHigh} carry high confidence.`;

  return {
    distribution,
    accuracyByConfidence,
    uncertainVerdicts: uncertain,
    uncertainButHighConfidence: uncertainHigh,
    uncertainHighConfidenceRate: rate,
    calibrationUnmeasurable,
    interpretation,
    examples,
  };
}
