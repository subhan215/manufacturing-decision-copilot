/**
 * Server-side entry point for the LLM layer.
 *
 * Importing this from a client component is a build error, which keeps the
 * Claude Code subprocess driver out of the browser bundle.
 */
import "server-only";

export * from "./index.ts";
