import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../lib/paths.ts";
import { defaultWeights, rankSuppliers } from "../lib/ranking/score.ts";
import type { SupplierSignals } from "../lib/ranking/types.ts";

export const REFERENCE_RELPATH = "data/derived/reference-values.json";

export interface ReferenceValue {
  supplierId: string;
  cost: { value: number; unit: string; quote: string };
  leadTime: {
    min: number;
    max: number;
    unit: string;
    quote: string;
    ambiguity?: string;
  };
  failRate: { value: number; unit: string; quote: string };
  sustainabilityPoints: { value: number; basis: string };
}

export interface ReferenceFile {
  note: string;
  asOfDate: string;
  values: ReferenceValue[];
}

export async function loadReferenceValues(): Promise<ReferenceFile> {
  const file = path.join(resolveProjectRoot(), REFERENCE_RELPATH);
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as ReferenceFile;
}

export interface FieldError {
  supplierId: string;
  field: "cost" | "leadTime" | "failRate" | "sustainability";
  extracted: number;
  reference: string;
  absoluteError: number;
  relativeError: number;
  withinReference: boolean;
  note: string | null;
}

export interface ExtractionMetrics {
  errors: FieldError[];
  fieldsChecked: number;
  fieldsExact: number;
  fieldsWithinRange: number;
  meanAbsoluteError: Record<string, number>;
  worstRelativeError: number;
}

/**
 * Compare AI-extracted values against the document-stated reference values.
 *
 * Where a document states a range, any value inside it counts as correct and
 * the absolute error is measured to the nearest bound. Picking one number out
 * of a stated range and calling the others wrong would measure our preference
 * rather than the system's accuracy.
 */
export function measureExtraction(
  signals: SupplierSignals[],
  reference: ReferenceFile,
): ExtractionMetrics {
  const errors: FieldError[] = [];

  for (const s of signals) {
    const ref = reference.values.find((r) => r.supplierId === s.supplierId);
    if (!ref) continue;

    const record = (
      field: FieldError["field"],
      extracted: number,
      min: number,
      max: number,
      quote: string,
      note: string | null,
    ) => {
      const within = extracted >= min - 1e-9 && extracted <= max + 1e-9;
      const nearest = within ? extracted : extracted < min ? min : max;
      const absoluteError = Math.abs(extracted - nearest);
      errors.push({
        supplierId: s.supplierId,
        field,
        extracted,
        reference: min === max ? String(min) : `${min}-${max}`,
        absoluteError,
        relativeError: nearest === 0 ? 0 : absoluteError / Math.abs(nearest),
        withinReference: within,
        note,
      });
    };

    record("cost", s.cost.value, ref.cost.value, ref.cost.value, ref.cost.quote, null);
    record(
      "leadTime",
      s.leadTime.value,
      ref.leadTime.min,
      ref.leadTime.max,
      ref.leadTime.quote,
      ref.leadTime.ambiguity ?? null,
    );
    record(
      "failRate",
      s.quality.value,
      ref.failRate.value,
      ref.failRate.value,
      ref.failRate.quote,
      null,
    );
    record(
      "sustainability",
      s.sustainability.value,
      ref.sustainabilityPoints.value,
      ref.sustainabilityPoints.value,
      ref.sustainabilityPoints.basis,
      null,
    );
  }

  const meanAbsoluteError: Record<string, number> = {};
  for (const field of ["cost", "leadTime", "failRate", "sustainability"]) {
    const forField = errors.filter((e) => e.field === field);
    meanAbsoluteError[field] =
      forField.length === 0
        ? 0
        : forField.reduce((sum, e) => sum + e.absoluteError, 0) / forField.length;
  }

  return {
    errors,
    fieldsChecked: errors.length,
    fieldsExact: errors.filter((e) => e.absoluteError === 0).length,
    fieldsWithinRange: errors.filter((e) => e.withinReference).length,
    meanAbsoluteError,
    worstRelativeError: errors.reduce(
      (worst, e) => Math.max(worst, e.relativeError),
      0,
    ),
  };
}

export interface RankingAgreement {
  aiOrder: string[];
  referenceOrder: string[];
  exactMatch: boolean;
  winnerMatch: boolean;
  /** Score gaps between adjacent ranks in the AI ranking. */
  margins: Array<{ above: string; below: string; margin: number }>;
  smallestMargin: number;
  sampleSizeCaveat: string;
}

/**
 * Does extraction error change the recommendation?
 *
 * Reported as exact-ordering match plus the score margin between adjacent
 * ranks, which says how much error the ordering could absorb before flipping.
 * A rank-correlation coefficient is deliberately not reported: with three
 * alternatives there are six possible orderings and three pairs, so a
 * coefficient of 1.0 would carry almost no information while sounding strong.
 */
export function measureRankingAgreement(
  aiSignals: SupplierSignals[],
  reference: ReferenceFile,
): RankingAgreement {
  const referenceSignals: SupplierSignals[] = aiSignals.map((s) => {
    const ref = reference.values.find((r) => r.supplierId === s.supplierId);
    if (!ref) return s;
    return {
      ...s,
      cost: { ...s.cost, value: ref.cost.value },
      // Use the conservative upper bound where a range is stated, matching the
      // rule the system itself applies.
      leadTime: { ...s.leadTime, value: ref.leadTime.max },
      quality: { ...s.quality, value: ref.failRate.value },
      sustainability: {
        ...s.sustainability,
        value: ref.sustainabilityPoints.value,
      },
    };
  });

  const weights = defaultWeights();
  const aiRanked = rankSuppliers(aiSignals, weights).ranked;
  const refRanked = rankSuppliers(referenceSignals, weights).ranked;

  const margins = aiRanked.slice(0, -1).map((r, i) => ({
    above: r.supplierId,
    below: aiRanked[i + 1].supplierId,
    margin: r.totalScore - aiRanked[i + 1].totalScore,
  }));

  const aiOrder = aiRanked.map((r) => r.supplierId);
  const referenceOrder = refRanked.map((r) => r.supplierId);

  return {
    aiOrder,
    referenceOrder,
    exactMatch: aiOrder.join("|") === referenceOrder.join("|"),
    winnerMatch: aiOrder[0] === referenceOrder[0],
    margins,
    smallestMargin: margins.reduce(
      (min, m) => Math.min(min, m.margin),
      Number.POSITIVE_INFINITY,
    ),
    // Derived, because the sentence states a probability. A hardcoded figure
    // here went stale the moment a fourth supplier became eligible, and a
    // wrong number in a caveat about rigour is worse than no caveat.
    sampleSizeCaveat: (() => {
      const n = aiSignals.length;
      const orderings = Array.from({ length: n }, (_, i) => i + 1).reduce(
        (a, b) => a * b,
        1,
      );
      return (
        `${n} eligible suppliers give ${orderings} possible orderings, so a chance match would occur about ` +
        `${((1 / orderings) * 100).toFixed(0)}% of the time. Ordering agreement is reported with score margins ` +
        `rather than a rank-correlation coefficient, which carries almost no information at this sample size.`
      );
    })(),
  };
}
