import type { EligibilityScreen } from "../lib/eligibility/types.ts";
import type { RankingReport } from "../lib/ranking/types.ts";

/**
 * Separation of facts, assumptions, and model-generated output.
 *
 * The brief requires evaluation to distinguish "facts extracted from sources,
 * assumptions introduced by the team, and model-generated recommendations."
 * Collapsing the three is how a decision-support tool quietly launders a
 * project decision into something that looks like evidence, so the register is
 * generated from the actual run rather than written by hand.
 */

export interface ExtractedFact {
  supplierId: string;
  requirementId: string;
  claim: string;
  quote: string;
  locator: string;
  verified: boolean;
}

export interface TeamAssumption {
  id: string;
  statement: string;
  rationale: string;
  /** What would change if this assumption were different. */
  affects: string;
}

export interface ModelOutput {
  supplierId: string;
  requirementId: string;
  status: string;
  reasoning: string;
}

export interface ProvenanceRegister {
  facts: ExtractedFact[];
  assumptions: TeamAssumption[];
  modelOutputs: ModelOutput[];
  counts: { facts: number; assumptions: number; modelOutputs: number };
}

/**
 * Choices we made that are not in any source document. Each one is a decision a
 * reviewer could reasonably disagree with, so each is stated with what it
 * changes.
 */
export const TEAM_ASSUMPTIONS: TeamAssumption[] = [
  {
    id: "as-of-date",
    statement: "Certificate validity is judged against an as-of date of 2026-08-09.",
    rationale:
      "The system prompt replaces the CLI preset, so the model cannot be assumed to know the current date. Passing it explicitly and comparing in code makes expiry deterministic and reproducible from cache months later.",
    affects:
      "MR-2 verdicts for every supplier whose certificate expires near this date.",
  },
  {
    id: "lead-time-range",
    statement:
      "Where a document states a lead-time range, the upper bound is used.",
    rationale:
      "The requirement is a maximum, so the conservative reading is the worst case. Taking the lower bound would pass suppliers on their best day.",
    affects:
      "supplier-01, whose document states 12-14 days alongside an audited mean of 12.6.",
  },
  {
    id: "sustainability-scoring",
    statement:
      "Sustainability scores one point for a documented cruelty-free declaration plus one per named third-party certification.",
    rationale:
      "The brief asks for a sustainability score but does not define one. Counting documented commitments is auditable; weighting them by perceived stringency would not be.",
    affects:
      "The sustainability criterion in the ranking, worth 15% of the default weighting.",
  },
  {
    id: "min-max-normalisation",
    statement:
      "Criteria are normalised min-max across the eligible pool before weighting.",
    rationale:
      "Selected for stability and comparatively low sensitivity to small perturbations. Scores are therefore relative to the candidate pool, not absolute quality.",
    affects:
      "All ranking scores; adding or removing a supplier can reorder the others.",
  },
  {
    id: "marketing-claim-not-certificate",
    statement:
      "A promotional compliance claim with no certificate record is treated as a failure, whereas a missing certificate section is treated as insufficient evidence.",
    rationale:
      "A marketing claim offered in place of a certificate is positive evidence that no certificate was supplied. Silence is not: the supplier may hold one and simply not have sent it.",
    affects: "MR-2 for supplier-11 (fail) versus supplier-13 (abstain).",
  },
  {
    id: "manual-review-estimate",
    statement:
      "Manual review is estimated at roughly 10 minutes per supplier to read a profile and check seven requirements.",
    rationale:
      "Stated for comparison only. It is an estimate, not a measurement, and is labelled as such wherever it appears.",
    affects:
      "The time-saving comparison narrative only; no computed metric depends on it.",
  },
  {
    id: "thresholds-from-brief",
    statement:
      "Mandatory thresholds (MOQ 5,000; fail rate 30%; lead time 20 days) and ranking weights (35/25/25/15) are taken from the product brief as given.",
    rationale:
      "These are the buyer's stated requirements, not our judgement. They are extracted from the brief by the model and frozen to a reviewed file.",
    affects:
      "Every eligibility verdict and the default ranking. The sensitivity analysis exists to show what changes when the weights move.",
  },
];

export function buildProvenanceRegister(
  screen: EligibilityScreen,
  ranking: RankingReport | null,
): ProvenanceRegister {
  const facts: ExtractedFact[] = [];
  const modelOutputs: ModelOutput[] = [];

  for (const supplier of screen.suppliers) {
    for (const verdict of supplier.verdicts) {
      if (verdict.citationQuote) {
        facts.push({
          supplierId: supplier.supplierId,
          requirementId: verdict.requirementId,
          claim: verdict.comparison ?? verdict.requirementTitle,
          quote: verdict.citationQuote,
          locator: verdict.citationLocator ?? "(unresolved)",
          verified: !verdict.citationUnverified,
        });
      }
      modelOutputs.push({
        supplierId: supplier.supplierId,
        requirementId: verdict.requirementId,
        status: verdict.status,
        reasoning: verdict.reasoning,
      });
    }
  }

  if (ranking) {
    for (const s of ranking.signals) {
      for (const [field, signal] of [
        ["cost", s.cost],
        ["sustainability", s.sustainability],
      ] as const) {
        if (signal.citationQuote) {
          facts.push({
            supplierId: s.supplierId,
            requirementId: `ranking:${field}`,
            claim: `${field} = ${signal.value}`,
            quote: signal.citationQuote,
            locator: signal.citationLocator ?? "(unresolved)",
            verified: signal.verified,
          });
        }
      }
    }
  }

  return {
    facts,
    assumptions: TEAM_ASSUMPTIONS,
    modelOutputs,
    counts: {
      facts: facts.length,
      assumptions: TEAM_ASSUMPTIONS.length,
      modelOutputs: modelOutputs.length,
    },
  };
}
