import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the project root by walking up from this module's own location.
 *
 * `process.cwd()` alone is not reliable: the same modules are imported by the
 * Next server (running from `.next/...`), by CLI scripts, and by the evaluation
 * harness, which may be invoked from any directory.
 */
export function resolveProjectRoot(): string {
  const override = process.env.MDC_PROJECT_ROOT;
  if (override) return override;

  const tried: string[] = [];
  const starts = [path.dirname(fileURLToPath(import.meta.url)), process.cwd()];

  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      tried.push(dir);
      if (
        existsSync(path.join(dir, "package.json")) &&
        existsSync(path.join(dir, "data"))
      ) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  throw new Error(
    `Could not locate the project root (a directory containing both package.json and data/). Tried:\n  ${tried.join("\n  ")}`,
  );
}
