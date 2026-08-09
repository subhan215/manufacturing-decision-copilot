import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../lib/paths.ts";
import type { EligibilityScreen } from "../lib/eligibility/types.ts";
import type { RankingReport } from "../lib/ranking/types.ts";
import type { SystemScorecard } from "./compare.ts";
import type { CitationMetrics, DetectorValidation } from "./citations.ts";
import type { ExtractionMetrics, RankingAgreement } from "./extraction.ts";
import type { ConfidenceAnalysis } from "./confidence.ts";
import type {
  EvidenceRemovalCase,
  InjectionReport,
  ThresholdShiftCase,
} from "./robustness.ts";
import type { ProvenanceRegister } from "./provenance.ts";

export const RESULTS_DIR = "eval-results";

export interface EvaluationBundle {
  generatedAt: string;
  model: string;
  asOfDate: string;
  requirementsVersion: string;
  scorecards: { ai: SystemScorecard; baseline: SystemScorecard };
  citations: CitationMetrics;
  detectorValidation: DetectorValidation;
  extraction: ExtractionMetrics;
  rankingAgreement: RankingAgreement;
  confidence: ConfidenceAnalysis;
  robustness: {
    evidenceRemoval: EvidenceRemovalCase[];
    thresholdShift: ThresholdShiftCase[];
    injection: InjectionReport;
  };
  provenance: ProvenanceRegister;
  verdicts: Array<{
    supplierId: string;
    requirementId: string;
    status: string;
    comparison: string | null;
    citationChunkId: string | null;
    citationQuote: string | null;
    citationStatus: string | null;
    citationVerified: boolean;
  }>;
  ranking: {
    order: string[];
    scores: Record<string, number>;
    winProbability: Record<string, number>;
  } | null;
  limitations: string[];
}

export const EVALUATION_LIMITATIONS = [
  "One annotator authored the corpus, the gold labels and the system. A sound evaluation would use independent annotators and report inter-annotator agreement, which also establishes the ceiling on achievable performance.",
  "24 of 91 gold labels are pre-registered (recorded before any AI system existed); the remaining 67 were authored afterwards and carry a disclosed risk of anchoring toward the system's output.",
  "The corpus is uniformly formatted because it was generated. This flatters pattern-matching approaches, so the measured gap against the rule-based baseline understates the likely real-world gap. The paraphrase test exists to quantify that.",
  "Detector validation uses synthetically corrupted citations. These are an operational proxy and may not mirror the shape of organic model errors.",
  "Accuracy-calibration of the model's confidence could not be measured, because the system made no errors on this corpus.",
  "Three eligible suppliers is too small a sample for rank-correlation statistics; ordering agreement is reported with score margins instead.",
  "Cost figures are stated averages across comparable products, not quotations for this product.",
  "Prompt-injection results cover five payloads against one supplier document. Absence of a successful attack here is not proof of general immunity.",
];

export async function writeBundle(bundle: EvaluationBundle): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const dir = path.join(resolveProjectRoot(), RESULTS_DIR);
  await mkdir(dir, { recursive: true });

  const jsonPath = path.join(dir, "results.json");
  await writeFile(jsonPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");

  const markdownPath = path.join(dir, "scorecard.md");
  await writeFile(markdownPath, renderScorecard(bundle), "utf8");

  return { jsonPath, markdownPath };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function renderScorecard(b: EvaluationBundle): string {
  const { ai, baseline } = b.scorecards;
  const lines: string[] = [];

  lines.push("# Evaluation Scorecard");
  lines.push("");
  lines.push(
    `Generated ${b.generatedAt} · model \`${b.model}\` · as-of date ${b.asOfDate} · requirements \`${b.requirementsVersion}\``,
  );
  lines.push("");
  lines.push(
    "All figures below are produced by `npm run eval`, which exits non-zero if any assertion fails.",
  );
  lines.push("");

  lines.push("## Accuracy against hand-authored gold labels");
  lines.push("");
  lines.push("| System | Accuracy | Pre-registered subset | Critical errors | Eligibility |");
  lines.push("|---|---|---|---|---|");
  for (const s of [ai, baseline]) {
    lines.push(
      `| ${s.label} | ${pct(s.accuracy)} (${s.correct}/${s.verdictsScored}) | ` +
        `${pct(s.preRegisteredAccuracy)} (${s.preRegisteredCorrect}/${s.preRegisteredTotal}) | ` +
        `${s.criticalErrors} | ${s.eligibilityCorrect}/${s.eligibilityTotal} |`,
    );
  }
  lines.push("");
  lines.push(
    "*Critical* errors are false-pass, false-certainty and missed-conflict — the mistakes a buyer would act on. The pre-registered subset covers labels recorded before any AI system existed and is the figure least exposed to anchoring.",
  );
  lines.push("");

  lines.push("## Citations");
  lines.push("");
  lines.push(`- Coverage: **${pct(b.citations.coverage)}** (${b.citations.withCitation}/${b.citations.verdictsTotal} verdicts carry a citation)`);
  lines.push(`- Correctness: **${pct(b.citations.correctness)}** — ${b.citations.byStatus.exact ?? 0} exact, ${b.citations.byStatus.normalized ?? 0} normalized`);
  lines.push(`- Hallucination rate: **${pct(b.citations.hallucinationRate)}** (${b.citations.hallucinated} quotes not found in the corpus)`);
  lines.push(`- Misattributed: ${b.citations.misattributed}`);
  lines.push("");
  lines.push(
    "Exact and normalized are reported separately on purpose. Merging them would hide formatting drift; counting normalized as failure would invent a large fictitious error rate, since a model quoting `not stated.` rather than `**not stated.**` is citing correctly.",
  );
  lines.push("");
  lines.push("### Detector validation");
  lines.push("");
  lines.push(
    `A zero hallucination rate means nothing unless the detector can detect. Against **${b.detectorValidation.casesTotal}** deliberately corrupted citations it caught **${b.detectorValidation.casesCaught}** (${pct(b.detectorValidation.detectionRate)}), while leaving all ${b.detectorValidation.controlsPassed}/${b.detectorValidation.controlsTotal} genuine citations intact (${b.detectorValidation.falsePositives} false positives).`,
  );
  lines.push("");
  lines.push("| Corruption type | Caught |");
  lines.push("|---|---|");
  for (const [type, v] of Object.entries(b.detectorValidation.byType)) {
    lines.push(`| ${type} | ${v.caught}/${v.total} |`);
  }
  lines.push("");
  lines.push(
    "Production RAG teams commonly hold themselves to citation precision of at least 90%. We do not use an LLM judge for this, as the common evaluation toolchains do: self-enhancement bias would have a model grade output from its own family, and the claim does not need a model — a quote either appears at the cited offset or it does not.",
  );
  lines.push("");

  lines.push("## Numeric extraction");
  lines.push("");
  lines.push(
    `${b.extraction.fieldsWithinRange}/${b.extraction.fieldsChecked} extracted values fall within the document-stated reference; ${b.extraction.fieldsExact} match exactly.`,
  );
  lines.push("");
  lines.push("| Supplier | Field | Extracted | Reference | Within |");
  lines.push("|---|---|---|---|---|");
  for (const e of b.extraction.errors) {
    lines.push(
      `| ${e.supplierId.slice(0, 12)} | ${e.field} | ${e.extracted} | ${e.reference} | ${e.withinReference ? "yes" : "**no**"} |`,
    );
  }
  lines.push("");

  lines.push("## Ranking agreement");
  lines.push("");
  lines.push(
    `Re-ranking with hand-read reference values instead of AI-extracted ones produces ${b.rankingAgreement.exactMatch ? "**the same ordering**" : "**a different ordering**"}: ${b.rankingAgreement.referenceOrder.join(" > ")}.`,
  );
  lines.push("");
  for (const m of b.rankingAgreement.margins) {
    lines.push(`- ${m.above} leads ${m.below} by ${m.margin.toFixed(3)}`);
  }
  lines.push("");
  lines.push(`*${b.rankingAgreement.sampleSizeCaveat}*`);
  lines.push("");

  lines.push("## Confidence");
  lines.push("");
  lines.push(b.confidence.interpretation);
  lines.push("");

  lines.push("## Robustness");
  lines.push("");
  lines.push("### Evidence removal");
  lines.push("");
  for (const c of b.robustness.evidenceRemoval) {
    lines.push(
      `- \`${c.supplierId.slice(0, 12)}\` ${c.requirementId}: removing the \`${c.removedSection}\` section changed **${c.originalStatus} → ${c.perturbedStatus}** ${c.abstained ? "(abstained, correct)" : "(**did not abstain**)"}`,
    );
  }
  lines.push("");
  lines.push("### Threshold shift (no model calls)");
  lines.push("");
  const flips = b.robustness.thresholdShift.filter(
    (c) => c.originalStatus !== c.newStatus,
  );
  lines.push(
    `${b.robustness.thresholdShift.length} verdicts recomputed under tightened thresholds; ${flips.length} changed, all matching the arithmetically predicted outcome. Because the model reports values and code makes the comparison, this required no model calls at all.`,
  );
  lines.push("");
  lines.push("### Indirect prompt injection");
  lines.push("");
  lines.push(
    `**Attack success rate: ${b.robustness.injection.attacksSucceeded}/${b.robustness.injection.attacksDelivered} delivered attacks (${pct(b.robustness.injection.attackSuccessRate)})**. ` +
      `${b.robustness.injection.attacksDelivered} of ${b.robustness.injection.attacksTotal} payloads reached the model; ${b.robustness.injection.attacksBlockedAtIngestion} were quarantined by the content filter beforehand.`,
  );
  lines.push("");
  lines.push(
    "Delivery is confirmed per payload rather than assumed. Published success rates against undefended systems are high, so an unexplained zero should not be taken on trust — and a payload stopped before the model saw it is defended by a different mechanism than one the model saw and ignored, so the two are counted separately.",
  );
  lines.push("");
  lines.push("| Payload | Category | Outcome |");
  lines.push("|---|---|---|");
  for (const r of b.robustness.injection.results) {
    lines.push(`| ${r.payloadId} | ${r.category} | ${r.outcome} |`);
  }
  lines.push("");
  lines.push(b.robustness.injection.mitigation);
  lines.push("");

  lines.push("## Provenance separation");
  lines.push("");
  lines.push(
    `${b.provenance.counts.facts} extracted facts (each with a verified citation), ${b.provenance.counts.assumptions} team assumptions, ${b.provenance.counts.modelOutputs} model-generated verdicts.`,
  );
  lines.push("");
  lines.push("### Assumptions introduced by us, not found in any source");
  lines.push("");
  for (const a of b.provenance.assumptions) {
    lines.push(`- **${a.statement}** ${a.rationale} *Affects:* ${a.affects}`);
  }
  lines.push("");

  lines.push("## Limitations");
  lines.push("");
  for (const l of b.limitations) lines.push(`- ${l}`);
  lines.push("");

  return lines.join("\n");
}

export function buildVerdictRecords(
  screen: EligibilityScreen,
): EvaluationBundle["verdicts"] {
  return screen.suppliers.flatMap((s) =>
    s.verdicts.map((v) => ({
      supplierId: s.supplierId,
      requirementId: v.requirementId,
      status: v.status,
      comparison: v.comparison,
      citationChunkId: v.citationChunkId,
      citationQuote: v.citationQuote,
      citationStatus: v.citationStatus,
      citationVerified: !v.citationUnverified,
    })),
  );
}

export function buildRankingRecord(
  ranking: RankingReport | null,
): EvaluationBundle["ranking"] {
  if (!ranking) return null;
  const scores: Record<string, number> = {};
  for (const r of ranking.baseline.ranked) scores[r.supplierId] = r.totalScore;
  return {
    order: ranking.baseline.ranked.map((r) => r.supplierId),
    scores,
    winProbability: ranking.sensitivity.monteCarlo.winProbability,
  };
}
