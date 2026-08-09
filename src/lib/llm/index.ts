/**
 * Public surface of the LLM layer.
 *
 * Application code should import `./server.ts`, which adds a client-bundle
 * guard. This entry point stays un-guarded so CLI scripts and the evaluation
 * harness can import it under plain `node`, where `server-only` throws.
 */
export type { LlmResult, LlmTelemetry } from "./types.ts";
export {
  LlmError,
  LlmExecutionError,
  LlmNoStructuredOutputError,
  LlmSchemaError,
  LlmTimeoutError,
  LlmUnavailableError,
} from "./types.ts";

export {
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  ISOLATION,
  cacheDir,
  cacheEnabled,
  claudeExecutablePath,
  resolveModel,
} from "./config.ts";

export { buildSystemPrompt, fenceUntrusted } from "./prompt.ts";

export { cacheKey, readCache, writeCache, type CacheEntry } from "./cache.ts";

export {
  assertClaudeCodeAvailable,
  CLAUDE_CODE_SETUP_HINT,
} from "./preflight.ts";

export {
  askStructured,
  toSdkSchema,
  type AskStructuredParams,
} from "./client.ts";
