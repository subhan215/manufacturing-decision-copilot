import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import {
  DEFAULT_TIMEOUT_MS,
  ISOLATION,
  cacheEnabled,
  claudeExecutablePath,
  resolveModel,
} from "./config.ts";
import { cacheKey, readCache, writeCache } from "./cache.ts";
import { assertClaudeCodeAvailable } from "./preflight.ts";
import {
  LlmExecutionError,
  LlmNoStructuredOutputError,
  LlmSchemaError,
  LlmTimeoutError,
  LlmUnavailableError,
  type LlmResult,
  type LlmTelemetry,
} from "./types.ts";

export interface AskStructuredParams<T> {
  prompt: string;
  schema: z.ZodType<T>;
  /** Used in cache keys and error messages. */
  schemaName: string;
  systemPrompt?: string;
  model?: string;
  timeoutMs?: number;
  cache?: boolean;
  /**
   * Strip `additionalProperties: false` from the generated JSON Schema.
   *
   * Zod emits it by default, and it is one of the shapes implicated in
   * structured-output failures where the SDK reports success but returns
   * nothing. Left off by default; flip it if a schema starts coming back empty.
   */
  stripAdditionalProperties?: boolean;
}

/**
 * Convert a Zod schema to the JSON Schema dialect the SDK accepts.
 *
 * `target: "draft-7"` is required, not stylistic: the SDK validates against
 * draft-07 and rejects schemas declaring a newer version, while Zod emits
 * draft 2020-12 by default. Omitting it fails the run at startup.
 */
export function toSdkSchema(
  schema: z.ZodType<unknown>,
  opts?: { stripAdditionalProperties?: boolean },
): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: "draft-7",
  }) as Record<string, unknown>;

  if (opts?.stripAdditionalProperties) {
    stripKeyDeep(json, "additionalProperties");
  }
  return json;
}

function stripKeyDeep(node: unknown, key: string): void {
  if (Array.isArray(node)) {
    for (const item of node) stripKeyDeep(item, key);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    delete obj[key];
    for (const value of Object.values(obj)) stripKeyDeep(value, key);
  }
}

function looksLikeAuthFailure(message: string): boolean {
  return /not logged in|unauthenticated|authentication|invalid api key|please run .?claude|no such file|enoent|spawn/i.test(
    message,
  );
}

function readTelemetry(
  result: SDKResultMessage | null,
  model: string,
  durationMs: number,
  cacheHit: boolean,
): LlmTelemetry {
  const usage = result?.usage as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;
  return {
    model,
    cacheHit,
    durationMs,
    apiDurationMs: result?.duration_api_ms ?? null,
    costUsd: result?.total_cost_usd ?? null,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    numTurns: result?.num_turns ?? null,
  };
}

/**
 * The single entry point for every model call in this application.
 *
 * Centralising it is what makes the isolation settings, the schema dialect, the
 * three-part success test and the telemetry impossible to forget at a call
 * site — none of which would survive being re-implemented in three places.
 */
export async function askStructured<T>(
  params: AskStructuredParams<T>,
): Promise<LlmResult<T>> {
  const model = resolveModel(params.model);
  const systemPrompt = params.systemPrompt ?? "";
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const jsonSchema = toSdkSchema(params.schema as z.ZodType<unknown>, {
    stripAdditionalProperties: params.stripAdditionalProperties,
  });
  const schemaJson = JSON.stringify(jsonSchema);

  const useCache = cacheEnabled(params.cache);
  const key = cacheKey({
    model,
    systemPrompt,
    prompt: params.prompt,
    schemaJson,
    schemaName: params.schemaName,
  });

  if (useCache) {
    const cacheStartedAt = Date.now();
    const hit = await readCache(key);
    if (hit) {
      // Re-validate rather than trusting the cache: a schema edit that did not
      // change the key, or a hand-edited cache file, must not slip through.
      const parsed = params.schema.safeParse(hit.data);
      if (parsed.success) {
        return {
          data: parsed.data,
          telemetry: {
            ...hit.telemetry,
            cacheHit: true,
            // Report what THIS call actually took, not what the original
            // computation took. Replaying the stored duration would inflate
            // any completion-time figure we report by several seconds per call.
            // Cost and token counts are left as stored: they describe the work
            // that produced this data, and `cacheHit` makes that unambiguous.
            durationMs: Date.now() - cacheStartedAt,
          },
        };
      }
    }
  }

  assertClaudeCodeAvailable();

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let result: SDKResultMessage | null = null;
  let thrown: unknown = null;

  try {
    const stream = query({
      prompt: params.prompt,
      options: {
        ...ISOLATION,
        model,
        systemPrompt: systemPrompt || undefined,
        outputFormat: { type: "json_schema", schema: jsonSchema },
        abortController: controller,
        pathToClaudeCodeExecutable: claudeExecutablePath(),
      },
    });

    for await (const message of stream as AsyncIterable<SDKMessage>) {
      if (message.type === "result") result = message;
    }
  } catch (err) {
    // A single-shot query() throws *after* yielding an error result, so a
    // result may already be captured above. Connection and process failures
    // yield no result message at all, which is why this catch exists.
    thrown = err;
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startedAt;

  if (controller.signal.aborted) {
    throw new LlmTimeoutError(
      `${params.schemaName}: model call exceeded ${timeoutMs}ms and was aborted.`,
    );
  }

  if (!result) {
    const detail = thrown instanceof Error ? thrown.message : String(thrown);
    if (looksLikeAuthFailure(detail)) {
      throw new LlmUnavailableError(
        `${params.schemaName}: could not run Claude Code. This app drives your local Claude Code CLI, ` +
          `so it must be installed and authenticated (run \`claude login\`). ` +
          `Set CLAUDE_CODE_EXECUTABLE_PATH if the binary is not on PATH.\nUnderlying error: ${detail}`,
      );
    }
    throw new LlmExecutionError(
      `${params.schemaName}: model call produced no result. ${detail}`,
      null,
      null,
    );
  }

  if (result.subtype !== "success") {
    throw new LlmExecutionError(
      `${params.schemaName}: run ended with subtype "${result.subtype}".`,
      result.subtype,
      result.terminal_reason ?? null,
    );
  }

  // `subtype === "success"` alone is not sufficient. A run can report success
  // with no structured output at all — the documented behaviour, and the
  // reported shape of anthropics/claude-agent-sdk-typescript#277 for schemas
  // the SDK cannot handle. Treat it as a failure with its own error type.
  if (result.structured_output === null || result.structured_output === undefined) {
    throw new LlmNoStructuredOutputError(
      `${params.schemaName}: run reported success but returned no structured output. ` +
        `This usually means the schema is too complex for the SDK — flatten it, or set ` +
        `stripAdditionalProperties. The raw assistant text is attached.`,
      typeof result.result === "string" ? result.result : null,
    );
  }

  const parsed = params.schema.safeParse(result.structured_output);
  if (!parsed.success) {
    throw new LlmSchemaError(
      `${params.schemaName}: structured output failed schema validation.`,
      parsed.error.issues,
      result.structured_output,
    );
  }

  const telemetry = readTelemetry(result, model, durationMs, false);

  if (useCache) {
    await writeCache(key, {
      data: parsed.data,
      telemetry,
      storedAt: new Date().toISOString(),
    });
  }

  return { data: parsed.data, telemetry };
}
