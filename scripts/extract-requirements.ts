/**
 * Extract the mandatory requirements from the product brief and freeze them.
 *
 *   node scripts/extract-requirements.ts
 *
 * Writes data/derived/requirements.json, which is committed and reviewed by
 * hand. Freezing the output keeps screening deterministic, and the reviewed
 * file is the human-approval artifact for the requirement definitions that
 * every downstream decision depends on.
 *
 * data/derived/ sits outside the ingestion allowlist, so this generated file
 * can never re-enter the evidence corpus.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getCorpus } from "../src/lib/ingestion/index.ts";
import {
  askStructured,
  buildSystemPrompt,
  fenceUntrusted,
  resolveModel,
} from "../src/lib/llm/index.ts";
import {
  REQUIREMENT_EXTRACTION_PROMPT,
  RequirementExtractionSchema,
  requirementsPath,
} from "../src/lib/eligibility/requirements.ts";
import type { RequirementsFile } from "../src/lib/eligibility/types.ts";

const corpus = await getCorpus({ force: true });
const brief = corpus.brief;
const section = brief.chunks.find(
  (c) => c.headingSlug === "mandatory-requirements",
);

if (!section) {
  console.error("Could not find the mandatory-requirements section in the brief.");
  process.exit(1);
}

console.log(`Extracting requirements from ${brief.doc.relPath} …`);

const { data, telemetry } = await askStructured({
  schemaName: "requirement-extraction",
  schema: RequirementExtractionSchema,
  systemPrompt: buildSystemPrompt(
    "You convert procurement requirement documents into structured records for a sourcing system.",
  ),
  prompt: [
    REQUIREMENT_EXTRACTION_PROMPT,
    "",
    fenceUntrusted(section.chunkId, section.text),
  ].join("\n"),
});

const file: RequirementsFile = {
  sourceDocumentId: brief.doc.docId,
  sourceSha256: brief.doc.sha256,
  extractedAt: new Date().toISOString(),
  model: resolveModel(),
  requirements: data.requirements,
};

const outPath = requirementsPath();
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(file, null, 2) + "\n", "utf8");

console.log(
  `\nExtracted ${data.requirements.length} requirements in ${telemetry.durationMs}ms` +
    `${telemetry.cacheHit ? " (cached)" : ""}\n`,
);

for (const r of data.requirements) {
  const rule =
    r.kind === "numeric-threshold"
      ? `${r.operator} ${r.threshold} ${r.unit ?? ""}`.trim()
      : r.kind === "categorical-match"
        ? `= ${r.expectedValue}`
        : r.kind === "certification"
          ? `${r.certificationName}, current`
          : "model judgement";
  console.log(`  ${r.id.padEnd(6)} ${r.kind.padEnd(18)} ${rule}`);
  console.log(`         ${r.title}`);
}

console.log(`\nWrote ${outPath}`);
console.log(
  "Review this file by hand before relying on it — it defines every downstream decision.\n",
);
