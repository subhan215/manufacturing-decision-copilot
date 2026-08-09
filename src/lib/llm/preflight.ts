import { existsSync } from "node:fs";

import { claudeExecutablePath } from "./config.ts";
import { LlmUnavailableError } from "./types.ts";

export const CLAUDE_CODE_SETUP_HINT =
  "This application drives your local Claude Code CLI via @anthropic-ai/claude-agent-sdk " +
  "rather than a paid Anthropic API key. Install Claude Code and run `claude login`, " +
  "or set CLAUDE_CODE_EXECUTABLE_PATH to the binary if it is not on PATH.";

/**
 * Cheap pre-call check.
 *
 * Deliberately does NOT probe by making a real call: the SDK ships its own
 * executable, so the only locally verifiable failure is an explicitly
 * configured path that does not exist. Authentication problems surface on the
 * first real call and are translated into LlmUnavailableError there, which
 * avoids burning a round trip on every startup just to say "probably fine".
 */
export function assertClaudeCodeAvailable(): void {
  const explicit = claudeExecutablePath();
  if (explicit && !existsSync(explicit)) {
    throw new LlmUnavailableError(
      `CLAUDE_CODE_EXECUTABLE_PATH is set to "${explicit}" but no file exists there.\n${CLAUDE_CODE_SETUP_HINT}`,
    );
  }
}
