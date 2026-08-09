import { getCorpus } from "../ingestion/loader.ts";
import { resolveModel } from "../llm/config.ts";
import { screenAll, DEFAULT_AS_OF_DATE } from "../eligibility/screen.ts";
import type { EligibilityScreen } from "../eligibility/types.ts";
import { extractSignals } from "./signals.ts";
import { defaultWeights, rankSuppliers } from "./score.ts";
import { analyseSensitivity } from "./sensitivity.ts";
import {
  LIMITATIONS,
  type ConditionallyEligibleSupplier,
  type RankingReport,
  type SupplierSignals,
} from "./types.ts";

const GAP_HINTS: Record<string, string> = {
  "MR-1": "documented liquid/serum manufacturing capability",
  "MR-2": "ISO 22716 certificate number, issuing body and validity date",
  "MR-3": "minimum order quantity for a first order",
  "MR-4": "audited quality inspection history",
  "MR-5": "stated manufacturing lead time",
  "MR-6": "facility address",
  "MR-7": "cruelty-free manufacturing declaration",
};

/**
 * Suppliers blocked only by missing evidence, never by a hard failure.
 *
 * These are not rejected — they are undocumented, which is a different problem
 * with a different remedy. Listing what to ask for turns a dead end into an
 * action. They are deliberately not ranked: scoring a supplier on absent data
 * would be exactly the guesswork the rest of the system refuses to do.
 */
function conditionallyEligible(
  screen: EligibilityScreen,
): ConditionallyEligibleSupplier[] {
  return screen.suppliers
    .filter((s) => {
      if (s.eligible || s.error) return false;
      const blocking = s.verdicts.filter((v) => v.status !== "pass");
      return (
        blocking.length > 0 &&
        blocking.every((v) => v.status === "insufficient-evidence")
      );
    })
    .map((s) => {
      const unresolved = s.verdicts
        .filter((v) => v.status === "insufficient-evidence")
        .map((v) => v.requirementId);
      return {
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        unresolvedRequirements: unresolved,
        dataGaps: unresolved.map(
          (id) => GAP_HINTS[id] ?? `evidence for ${id}`,
        ),
      };
    });
}

export async function buildRankingReport(opts?: {
  asOfDate?: string;
  screen?: EligibilityScreen;
  onProgress?: (supplierId: string) => void;
}): Promise<RankingReport> {
  const asOfDate = opts?.asOfDate ?? DEFAULT_AS_OF_DATE;
  const corpus = await getCorpus();
  const screen = opts?.screen ?? (await screenAll({ asOfDate }));

  const eligible = screen.suppliers.filter((s) => s.eligible);

  const signals: SupplierSignals[] = [];
  for (const supplierScreen of eligible) {
    const doc = corpus.suppliers.find(
      (d) => d.doc.docId === supplierScreen.supplierId,
    );
    if (!doc) continue;
    opts?.onProgress?.(doc.doc.shortId);
    signals.push(
      await extractSignals({ supplier: doc, screen: supplierScreen, corpus }),
    );
  }

  const baseline = rankSuppliers(signals, defaultWeights());

  // Sensitivity analysis needs at least two alternatives to say anything: with
  // one candidate every weighting trivially produces the same winner.
  const sensitivity =
    signals.length >= 2
      ? analyseSensitivity(signals)
      : {
          scenarios: [],
          stabilityIntervals: [],
          monteCarlo: {
            samples: 0,
            seed: 0,
            winProbability: {},
            meanRank: {},
          },
          dominance: [],
        };

  const limitations = [...LIMITATIONS];
  if (signals.length < 2) {
    limitations.push(
      "Fewer than two suppliers passed the eligibility screen, so no sensitivity analysis was performed: with a single candidate the ranking is the same under every set of weights.",
    );
  }
  if (baseline.degenerateCriteria.length > 0) {
    limitations.push(
      `These criteria were identical across all eligible suppliers and therefore could not discriminate between them: ${baseline.degenerateCriteria.join(", ")}.`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    model: resolveModel(),
    signals,
    baseline,
    sensitivity,
    conditionallyEligible: conditionallyEligible(screen),
    limitations,
  };
}
