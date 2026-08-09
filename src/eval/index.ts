/**
 * Evaluation surface: gold labels and the scoring comparator.
 *
 * No model is involved in scoring. LLM-as-judge is deliberately avoided here:
 * known failure modes include self-enhancement bias, where a model scores
 * output from its own family too generously — precisely the bias that would
 * matter when grading our own system.
 */
export {
  goldKey,
  indexGold,
  isAcceptable,
  loadGoldLabels,
  GOLD_RELPATH,
  type GoldLabel,
  type GoldLabelFile,
  type LabelProvenance,
} from "./gold.ts";

export {
  classifyError,
  scoreScreen,
  CRITICAL_ERRORS,
  ERROR_DESCRIPTIONS,
  type Disagreement,
  type ErrorClass,
  type SystemScorecard,
} from "./compare.ts";

export {
  buildCorruptionCases,
  measureCitations,
  validateDetector,
  type CitationMetrics,
  type CorruptionCase,
  type CorruptionType,
  type DetectorValidation,
} from "./citations.ts";

export {
  loadReferenceValues,
  measureExtraction,
  measureRankingAgreement,
  REFERENCE_RELPATH,
  type ExtractionMetrics,
  type FieldError,
  type RankingAgreement,
  type ReferenceFile,
  type ReferenceValue,
} from "./extraction.ts";

export {
  analyseConfidence,
  type Confidence,
  type ConfidenceAnalysis,
} from "./confidence.ts";

export {
  buildProvenanceRegister,
  TEAM_ASSUMPTIONS,
  type ExtractedFact,
  type ModelOutput,
  type ProvenanceRegister,
  type TeamAssumption,
} from "./provenance.ts";

export {
  INJECTION_PAYLOADS,
  testEvidenceRemoval,
  testPromptInjection,
  testThresholdShift,
  type AttackCategory,
  type EvidenceRemovalCase,
  type InjectionOutcome,
  type InjectionPayload,
  type InjectionReport,
  type InjectionResult,
  type ThresholdShiftCase,
} from "./robustness.ts";

export {
  buildRankingRecord,
  buildVerdictRecords,
  renderScorecard,
  writeBundle,
  EVALUATION_LIMITATIONS,
  RESULTS_DIR,
  type EvaluationBundle,
} from "./report.ts";
