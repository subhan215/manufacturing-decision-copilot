/**
 * Public surface of the eligibility layer.
 *
 * Application code should import `./server.ts`; CLI scripts and the evaluation
 * harness import this entry point, since `server-only` throws under plain node.
 */
export type {
  ComparisonOperator,
  EligibilityScreen,
  ExtractedFinding,
  Requirement,
  RequirementKind,
  RequirementVerdict,
  RequirementsFile,
  ScreenStats,
  SupplierScreen,
  VerdictStatus,
} from "./types.ts";

export {
  clearRequirementsCache,
  loadRequirements,
  REQUIREMENT_EXTRACTION_PROMPT,
  REQUIREMENTS_RELPATH,
  RequirementExtractionSchema,
  requirementById,
  requirementsPath,
  requirementsVersion,
} from "./requirements.ts";

export { evaluateFinding, type EvaluationOutcome } from "./evaluate.ts";
export { summarizeVerification, verifyVerdictCitation } from "./verify.ts";
export {
  buildScreeningPrompt,
  FindingsSchema,
  SCREENING_ROLE,
  type Findings,
} from "./prompt.ts";
export {
  DEFAULT_AS_OF_DATE,
  DEFAULT_CONCURRENCY,
  screenAll,
  screenSupplier,
} from "./screen.ts";
