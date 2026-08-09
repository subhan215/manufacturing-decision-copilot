import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cacheDir } from "./config.ts";
import type { LlmTelemetry } from "./types.ts";

/**
 * Content-addressed response cache.
 *
 * Two jobs. During development, each call spawns the CLI and takes seconds, so
 * a 13-supplier run is painful to iterate on uncached. For submission, a frozen
 * cache makes the demo and the reported evaluation numbers reproducible —
 * potentially reproducible by a reviewer with no Claude Code login at all.
 *
 * The key covers everything that can change the answer, so a prompt or schema
 * edit is automatically a cache miss rather than a stale hit.
 */
export interface CacheEntry {
  data: unknown;
  telemetry: LlmTelemetry;
  storedAt: string;
}

export function cacheKey(parts: {
  model: string;
  systemPrompt: string;
  prompt: string;
  schemaJson: string;
  schemaName: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        parts.model,
        parts.systemPrompt,
        parts.prompt,
        parts.schemaJson,
        parts.schemaName,
      ]),
      "utf8",
    )
    .digest("hex");
}

function entryPath(key: string): string {
  return path.join(cacheDir(), `${key}.json`);
}

export async function readCache(key: string): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(entryPath(key), "utf8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    // A missing or corrupt entry is simply a miss — never fail a call because
    // the cache is unreadable.
    return null;
  }
}

export async function writeCache(
  key: string,
  entry: CacheEntry,
): Promise<void> {
  try {
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(entryPath(key), JSON.stringify(entry, null, 2), "utf8");
  } catch {
    // Caching is an optimisation; a write failure must not fail the call.
  }
}
