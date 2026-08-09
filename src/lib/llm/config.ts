import path from "node:path";

import { resolveProjectRoot } from "../paths.ts";

/**
 * Pinned by default rather than inheriting the CLI's current default model.
 * Reproducibility matters here: a reviewer running this months from now, or on
 * a machine configured differently, must get the same behaviour we reported.
 * The resolved value is recorded on every result so the evaluation report can
 * state exactly which model produced the numbers.
 */
export const DEFAULT_MODEL = "claude-sonnet-5";

export const DEFAULT_TIMEOUT_MS = 120_000;

export function resolveModel(explicit?: string): string {
  return explicit ?? process.env.MDC_MODEL ?? DEFAULT_MODEL;
}

export function cacheDir(): string {
  return path.join(resolveProjectRoot(), ".cache", "llm");
}

export function cacheEnabled(explicit?: boolean): boolean {
  if (process.env.MDC_NO_LLM_CACHE === "1") return false;
  return explicit ?? true;
}

/**
 * Isolation settings applied to every call.
 *
 * These are security controls, not tuning knobs. The ingestion layer goes to
 * some trouble to keep `data/DATA_MANIFEST.md` — which contains the expected
 * outcome for every supplier — out of the model's input. All of that is void if
 * the model can simply read the file at runtime, so the built-in tools are
 * removed entirely rather than merely left un-approved.
 */
export const ISOLATION = {
  /**
   * Disables ALL built-in tools. Note this is `tools`, not `allowedTools`:
   * `allowedTools` only controls which tools skip the permission prompt, so
   * using it here would leave file access fully available.
   */
  tools: [] as string[],
  /**
   * Load no filesystem settings. Without this the session can pick up the
   * user's and project's CLAUDE.md — which, in this repository, documents the
   * expected eligibility outcomes.
   */
  settingSources: [] as [],
  /** One shot. This is extraction and judgement, not agentic work. */
  maxTurns: 1,
  /** Deny anything not pre-approved rather than block on a prompt. */
  permissionMode: "dontAsk" as const,
} as const;

/**
 * Optional explicit path to the Claude Code executable. Normally unset — the
 * SDK ships its own binary and only needs an authenticated login.
 */
export function claudeExecutablePath(): string | undefined {
  return process.env.CLAUDE_CODE_EXECUTABLE_PATH || undefined;
}
