/**
 * Public surface of the non-AI baseline.
 *
 * Application code should import `./server.ts`; CLI scripts import this entry
 * point, since `server-only` throws under plain node.
 */
export {
  affirmedTerms,
  isNegated,
  DEFAULT_WINDOW_CHARS,
  POST_NEGATION_TRIGGERS,
  PRE_NEGATION_TRIGGERS,
  PSEUDO_TRIGGERS,
  SCOPE_TERMINATORS,
} from "./negation.ts";

export {
  ABSENCE_PATTERNS,
  findDate,
  findLabelledNumber,
  parseNumber,
  ruleCertification,
  ruleCrueltyFree,
  ruleFailRate,
  ruleLiquidCapability,
  ruleLocation,
  ruleNumericThreshold,
  statesAbsence,
  type RuleOutcome,
} from "./rules.ts";

export { baselineScreen } from "./screen.ts";
