/**
 * Server-side entry point for the ingestion layer.
 *
 * Importing this from a client component is a build error, which keeps the
 * filesystem-backed corpus loader out of the browser bundle. The CLI script and
 * evaluation harness import `./index.ts` directly, because `server-only` throws
 * under plain `node`.
 */
import "server-only";

export * from "./index.ts";
