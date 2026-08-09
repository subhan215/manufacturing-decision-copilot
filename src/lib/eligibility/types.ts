import type { CitationStatus } from "../ingestion/types.ts";
import type { LlmTelemetry } from "../llm/types.ts";

/**
 * How a requirement is decided.
 *
 * The split is deliberate and is the core architectural decision of this piece:
 * the model reads, and code decides wherever a decision can be computed.
 * Published measurements put LLM numeric-comparison error around 16.9%, falling
 * to ~0.7% when the comparison is done deterministically — and several
 * suppliers in this corpus sit narrowly on the right side of a threshold, which
 * is exactly where that error rate would land.
 *
 * Only `qualitative` requirements are genuinely a judgement call ("is a
 * pressed-powder line a liquid-fill line?"), and only those defer to the model.
 */
export type RequirementKind =
  | "numeric-threshold"
  | "certification"
  | "categorical-match"
  | "qualitative";

export type ComparisonOperator = "lte" | "gte" | "lt" | "gt" | "eq";

export interface Requirement {
  id: string; // "MR-3"
  title: string;
  description: string;
  rationale: string;
  kind: RequirementKind;
  /** numeric-threshold only */
  operator: ComparisonOperator | null;
  threshold: number | null;
  unit: string | null;
  /** categorical-match only */
  expectedValue: string | null;
  /** certification only */
  certificationName: string | null;
}

export interface RequirementsFile {
  sourceDocumentId: string;
  sourceSha256: string;
  extractedAt: string;
  model: string;
  requirements: Requirement[];
}

/** What the model returns per requirement — evidence, not a verdict. */
export interface ExtractedFinding {
  requirementId: string;
  judgement: "satisfied" | "not-satisfied" | "unclear" | null;
  numericValue: number | null;
  numericUnit: string | null;
  certificatePresent: boolean | null;
  certificateExpiry: string | null;
  marketingClaimOnly: boolean | null;
  categoricalValue: string | null;
  evidenceAbsent: boolean;
  conflictNote: string | null;
  /**
   * Captured for later calibration analysis but deliberately NOT surfaced as
   * decision support. Verbalized LLM confidence is not merely noisy: it is
   * driven by a stable internal mechanism that responds largely independently
   * of whether the answer is correct. Showing it to a sourcing analyst would
   * imply a reliability signal that does not exist.
   */
  modelConfidence: "high" | "medium" | "low";
  citationChunkId: string | null;
  citationQuote: string | null;
  reasoning: string;
}

export type VerdictStatus =
  | "pass"
  | "fail"
  | "insufficient-evidence"
  | "conflicting";

/**
 * The extracted evidence a verdict was derived from, carried alongside it.
 *
 * This is what makes a threshold genuinely explorable. Given the evidence and a
 * requirement, `evaluateFinding` reproduces the verdict for any threshold —
 * in the browser, with no model call — so a buyer can ask "what if the MOQ
 * ceiling were 8,000?" and get the real answer rather than an estimate.
 *
 * It also retires a fragility: the scenario engine used to recover these values
 * by regex-parsing the human-readable `comparison` string, which meant a change
 * to a display format could silently change a computed result.
 */
export interface VerdictEvidence {
  judgement: "satisfied" | "not-satisfied" | "unclear" | null;
  numericValue: number | null;
  numericUnit: string | null;
  certificatePresent: boolean | null;
  certificateExpiry: string | null;
  marketingClaimOnly: boolean | null;
  categoricalValue: string | null;
  evidenceAbsent: boolean;
}

export interface RequirementVerdict {
  requirementId: string;
  requirementTitle: string;
  kind: RequirementKind;
  status: VerdictStatus;
  /** What the model read, before any comparison was made. */
  evidence: VerdictEvidence;
  /** What the verdict would have been before citation verification downgraded it. */
  modelClaimedStatus: VerdictStatus;
  /** Human-readable arithmetic, e.g. "5000 units ≤ 5000 units". Null for qualitative. */
  comparison: string | null;
  reasoning: string;
  conflictNote: string | null;
  modelConfidence: "high" | "medium" | "low";
  citationChunkId: string | null;
  citationQuote: string | null;
  citationStatus: CitationStatus | null;
  citationLocator: string | null;
  citationUnverified: boolean;
}

export interface SupplierScreen {
  supplierId: string;
  supplierName: string;
  verdicts: RequirementVerdict[];
  eligible: boolean;
  blockingRequirements: string[];
  error: string | null;
  telemetry: LlmTelemetry | null;
}

export interface ScreenStats {
  suppliersScreened: number;
  suppliersErrored: number;
  verdictsTotal: number;
  citationsVerified: number;
  citationsUnverified: number;
  /** How often mechanical verification overrode the model's claim. */
  downgradedByVerification: number;
  deterministicVerdicts: number;
  qualitativeVerdicts: number;
  totalDurationMs: number;
  totalCostUsd: number | null;
}

export interface EligibilityScreen {
  asOfDate: string;
  model: string;
  generatedAt: string;
  requirementsVersion: string;
  suppliers: SupplierScreen[];
  stats: ScreenStats;
}
