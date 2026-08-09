/**
 * LLM layer contracts.
 *
 * Failure modes get distinct error classes on purpose. "The CLI is not
 * installed", "the model could not satisfy the schema", and "the SDK reported
 * success but returned nothing" have completely different fixes, and collapsing
 * them into one generic error would make our own evaluation metrics
 * uninterpretable — a tooling problem would show up as a model failure.
 */

export interface LlmTelemetry {
  model: string;
  cacheHit: boolean;
  /** Wall-clock time in this process, including cache lookup and spawn. */
  durationMs: number;
  /** Time the SDK attributes to the API itself, when reported. */
  apiDurationMs: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  numTurns: number | null;
}

export interface LlmResult<T> {
  data: T;
  telemetry: LlmTelemetry;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The Claude Code CLI is missing, or is not authenticated. */
export class LlmUnavailableError extends LlmError {}

/** The call exceeded its timeout and was aborted. */
export class LlmTimeoutError extends LlmError {}

/** The run ended with an error subtype (or died before producing a result). */
export class LlmExecutionError extends LlmError {
  // Explicit fields rather than constructor parameter properties: Node's
  // strip-only TypeScript support cannot transform parameter properties, and
  // these modules must run under plain `node` for the CLI scripts.
  subtype: string | null;
  terminalReason: string | null;

  constructor(
    message: string,
    subtype: string | null,
    terminalReason: string | null,
  ) {
    super(message);
    this.subtype = subtype;
    this.terminalReason = terminalReason;
  }
}

/**
 * The SDK reported `subtype: "success"` but no `structured_output`.
 *
 * This is its own class because the fix is "simplify the schema", not "retry"
 * or "reword the prompt" — it is the known signature of a schema the SDK could
 * not handle (anthropics/claude-agent-sdk-typescript#277). The raw assistant
 * text is captured because the correct JSON is often sitting in it unparsed,
 * which makes diagnosis immediate.
 */
export class LlmNoStructuredOutputError extends LlmError {
  rawText: string | null;

  constructor(message: string, rawText: string | null) {
    super(message);
    this.rawText = rawText;
  }
}

/** Structured output was returned, but failed our Zod schema. */
export class LlmSchemaError extends LlmError {
  issues: unknown;
  received: unknown;

  constructor(message: string, issues: unknown, received: unknown) {
    super(message);
    this.issues = issues;
    this.received = received;
  }
}
