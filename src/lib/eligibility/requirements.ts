import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { resolveProjectRoot } from "../paths.ts";
import { sha256 } from "../ingestion/text.ts";
import type { Requirement, RequirementsFile } from "./types.ts";

export const REQUIREMENTS_RELPATH = "data/derived/requirements.json";

/**
 * Extraction schema.
 *
 * Kept flat — root object holding one array of objects with primitive leaves —
 * because deeper shapes can fail structured-output generation silently,
 * returning success with no data at all.
 */
export const RequirementExtractionSchema = z.object({
  requirements: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      rationale: z.string(),
      kind: z.enum([
        "numeric-threshold",
        "certification",
        "categorical-match",
        "qualitative",
      ]),
      operator: z.enum(["lte", "gte", "lt", "gt", "eq"]).nullable(),
      threshold: z.number().nullable(),
      unit: z.string().nullable(),
      expectedValue: z.string().nullable(),
      certificationName: z.string().nullable(),
    }),
  ),
});

export type RequirementExtraction = z.infer<typeof RequirementExtractionSchema>;

export const REQUIREMENT_EXTRACTION_PROMPT = `Read the mandatory-requirements section of the product brief below and convert
each requirement into a structured record.

For each requirement decide how it should be evaluated, and set "kind":

- "numeric-threshold" — the requirement is a numeric comparison against a limit
  (for example a maximum order quantity, a maximum rate, a maximum duration).
  Set operator ("lte" for "at most / no more than / <=", "gte" for "at least"),
  threshold (the number alone), and unit (for example "units", "percent",
  "calendar days").
- "certification" — the requirement is that a named certification is held and
  current. Set certificationName.
- "categorical-match" — the requirement is that a stated attribute equals a
  specific value (for example a country). Set expectedValue.
- "qualitative" — the requirement needs human-style judgement about capability
  or documentation quality and cannot be reduced to a comparison.

Leave fields that do not apply to the chosen kind as null. Use the requirement
identifiers exactly as written in the brief.`;

let cached: RequirementsFile | null = null;

export function requirementsPath(): string {
  return path.join(resolveProjectRoot(), REQUIREMENTS_RELPATH);
}

export async function loadRequirements(opts?: {
  force?: boolean;
}): Promise<RequirementsFile> {
  if (cached && !opts?.force) return cached;

  let raw: string;
  try {
    raw = await readFile(requirementsPath(), "utf8");
  } catch {
    throw new Error(
      `Requirements have not been extracted yet. Run \`npm run extract:requirements\` ` +
        `to generate ${REQUIREMENTS_RELPATH}.`,
    );
  }

  const parsed = JSON.parse(raw) as RequirementsFile;
  cached = parsed;
  return parsed;
}

export function clearRequirementsCache(): void {
  cached = null;
}

/**
 * Version stamp for a screening run.
 *
 * Recorded on every EligibilityScreen so a screen produced against an older set
 * of requirements is detectable rather than silently stale.
 */
export function requirementsVersion(file: RequirementsFile): string {
  return sha256(JSON.stringify(file.requirements)).slice(0, 16);
}

export function requirementById(
  file: RequirementsFile,
  id: string,
): Requirement | undefined {
  return file.requirements.find((r) => r.id === id);
}
