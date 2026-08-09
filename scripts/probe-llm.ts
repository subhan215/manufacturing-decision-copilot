/**
 * LLM layer smoke test.
 *
 *   node scripts/probe-llm.ts
 *
 * Makes real calls through the Claude Code CLI. Run it twice: the second run
 * must report cache hits. Exits non-zero on any failed assertion.
 */
import { z } from "zod";

import {
  askStructured,
  buildSystemPrompt,
  fenceUntrusted,
  resolveModel,
  toSdkSchema,
  ISOLATION,
  LlmNoStructuredOutputError,
  LlmUnavailableError,
  CLAUDE_CODE_SETUP_HINT,
} from "../src/lib/llm/index.ts";
import { getCorpus } from "../src/lib/ingestion/index.ts";

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail?: string): void {
  checks++;
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(74)}\n${title}\n${"=".repeat(74)}`);
}

const corpus = await getCorpus({ force: true });
const supplier08 = corpus.suppliers.find((s) =>
  s.doc.docId.startsWith("supplier-08"),
)!;
const titleBlock = supplier08.chunks.find((c) => c.role === "title-block")!;

// ------------------------------------------------- 7. schema conversion
section("SCHEMA CONVERSION (no model call)");

const VerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      requirementId: z.string(),
      status: z.enum(["pass", "fail", "insufficient-evidence"]),
      reasoning: z.string(),
      citationChunkId: z.string().nullable(),
      citationQuote: z.string().nullable(),
    }),
  ),
});

{
  const json = toSdkSchema(VerdictsSchema);
  const serialized = JSON.stringify(json);
  check(
    "generated schema declares draft-07",
    json.$schema === "http://json-schema.org/draft-07/schema#",
    `got ${String(json.$schema)} — the SDK rejects newer dialects`,
  );
  check(
    "generated schema contains no $ref/$defs",
    !serialized.includes("$ref") && !serialized.includes("$defs"),
  );
  const stripped = JSON.stringify(
    toSdkSchema(VerdictsSchema, { stripAdditionalProperties: true }),
  );
  check(
    "stripAdditionalProperties removes every additionalProperties key",
    !stripped.includes("additionalProperties"),
  );
}

// ------------------------------------------------------- 1 & 2. basic call
section("BASIC STRUCTURED CALL");

const FacilitySchema = z.object({
  supplierName: z.string(),
  city: z.string(),
  country: z.string(),
});

const systemPrompt = buildSystemPrompt(
  "You extract facts from supplier documentation for a sourcing analyst.",
);

let firstTelemetry: { durationMs: number; model: string } | null = null;

try {
  const res = await askStructured({
    schemaName: "facility",
    schema: FacilitySchema,
    systemPrompt,
    prompt: [
      "Extract the supplier name and facility location from the document below.",
      "",
      fenceUntrusted(titleBlock.chunkId, titleBlock.text),
    ].join("\n"),
  });

  check("basic schema round-trips and validates", true);
  check(
    `country extracted as Vietnam (got "${res.data.country}")`,
    /vietnam/i.test(res.data.country),
  );
  check(
    `telemetry populated (model=${res.telemetry.model}, ${res.telemetry.durationMs}ms, cacheHit=${res.telemetry.cacheHit})`,
    res.telemetry.model === resolveModel() && res.telemetry.durationMs > 0,
  );
  firstTelemetry = {
    durationMs: res.telemetry.durationMs,
    model: res.telemetry.model,
  };
  console.log(`        -> ${JSON.stringify(res.data)}`);
} catch (err) {
  if (err instanceof LlmUnavailableError) {
    console.error(`\n  Claude Code is not available.\n  ${CLAUDE_CODE_SETUP_HINT}\n`);
    console.error(`  ${err.message}\n`);
    process.exit(2);
  }
  check("basic schema round-trips and validates", false, String(err));
}

// --------------------------------------------------------- 5. cache hit
section("CACHE");

{
  const res = await askStructured({
    schemaName: "facility",
    schema: FacilitySchema,
    systemPrompt,
    prompt: [
      "Extract the supplier name and facility location from the document below.",
      "",
      fenceUntrusted(titleBlock.chunkId, titleBlock.text),
    ].join("\n"),
  });
  check("identical call is served from cache", res.telemetry.cacheHit === true);
  check(
    "cached result still validates against the schema",
    FacilitySchema.safeParse(res.data).success,
  );
  if (firstTelemetry) {
    console.log(
      `        first call ${firstTelemetry.durationMs}ms -> cached ${res.telemetry.durationMs}ms`,
    );
  }
}

// ----------------------------------------------- 3. piece-4-shaped schema
section("PIECE-4-SHAPED SCHEMA (array of flat verdict objects)");

{
  const brief = corpus.brief.chunks.find(
    (c) => c.headingSlug === "mandatory-requirements",
  )!;

  const prompt = [
    "Assess the supplier document against each mandatory requirement in the brief.",
    "Return one verdict per requirement (MR-1 through MR-7).",
    "Use status \"insufficient-evidence\" when the document does not address a requirement.",
    "Set citationChunkId to the id of the document chunk you relied on, and",
    "citationQuote to text copied verbatim from it; use null for both if you had no evidence.",
    "",
    fenceUntrusted(brief.chunkId, brief.text),
    "",
    ...supplier08.chunks.map((c) => fenceUntrusted(c.chunkId, c.text)),
  ].join("\n");

  try {
    const res = await askStructured({
      schemaName: "verdicts-shape-probe",
      schema: VerdictsSchema,
      systemPrompt: buildSystemPrompt(
        "You screen suppliers against mandatory sourcing requirements.",
      ),
      prompt,
      timeoutMs: 180_000,
    });

    check(
      `piece-4-shaped schema round-trips (${res.data.verdicts.length} verdicts)`,
      res.data.verdicts.length > 0,
    );
    check(
      "all seven requirements addressed",
      res.data.verdicts.length === 7,
      `got ${res.data.verdicts.length} — acceptable, but piece 4 should pin this down`,
    );
    const cited = res.data.verdicts.filter((v) => v.citationChunkId !== null);
    check(
      `verdicts carry citations (${cited.length}/${res.data.verdicts.length})`,
      cited.length > 0,
    );
    console.log("");
    for (const v of res.data.verdicts) {
      console.log(
        `        ${v.requirementId.padEnd(6)} ${v.status.padEnd(22)} ${v.citationChunkId ?? "(no citation)"}`,
      );
    }
  } catch (err) {
    if (err instanceof LlmNoStructuredOutputError) {
      check(
        "piece-4-shaped schema round-trips",
        false,
        "SDK returned success with no structured output — the known issue-277 shape. " +
          "Flatten the schema further or set stripAdditionalProperties.",
      );
      console.log(`\n        raw text was:\n${String(err.rawText).slice(0, 400)}`);
    } else {
      check("piece-4-shaped schema round-trips", false, String(err));
    }
  }
}

// ------------------------------------------------------- 6. isolation
section("ISOLATION — the model must not be able to read the answer key");

// Structural check first. This is the property that actually matters and it is
// verifiable without spending a call: `tools` (not `allowedTools`) is what
// removes the built-in toolset, and empty `settingSources` stops the session
// loading this repository's own CLAUDE.md, which documents expected outcomes.
check(
  "ISOLATION removes all built-in tools",
  Array.isArray(ISOLATION.tools) && ISOLATION.tools.length === 0,
);
check(
  "ISOLATION loads no filesystem settings",
  Array.isArray(ISOLATION.settingSources) && ISOLATION.settingSources.length === 0,
);

{
  const IsolationSchema = z.object({
    fileReadingToolNames: z.array(z.string()),
    hasAnyFileAccess: z.boolean(),
  });

  // Ask the model to *inventory* its tools rather than to attempt a read that
  // must fail. An impossible action costs a turn to attempt and another to
  // report on, so under maxTurns: 1 the run dies with error_max_turns and tells
  // us nothing about isolation either way. Inventory is answerable immediately.
  const res = await askStructured({
    schemaName: "isolation-probe-v2",
    schema: IsolationSchema,
    cache: false,
    systemPrompt:
      "You are reporting on your own available capabilities. Answer from what you can currently do; do not attempt to call anything.",
    prompt:
      "List the names of every tool available to you right now that could read a file from " +
      "the local filesystem (for example Read, Bash, Grep, Glob). Put them in " +
      '"fileReadingToolNames" and set "hasAnyFileAccess" accordingly. ' +
      "Return an empty list and false if you have no such tools.",
  });

  check(
    "model reports no filesystem-reading tools available",
    res.data.hasAnyFileAccess === false &&
      res.data.fileReadingToolNames.length === 0,
    `reported: ${JSON.stringify(res.data.fileReadingToolNames)} — if file tools are reachable, every ingestion-level leakage control is void`,
  );
}

// --------------------------------------------------------------- summary
section(`SUMMARY — ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("\nLLM layer is working.\n");
