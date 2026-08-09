import { z } from "zod";

import { fenceUntrusted } from "../llm/prompt.ts";
import type { IngestedDocument } from "../ingestion/types.ts";
import type { Requirement } from "./types.ts";

/**
 * Extraction schema. Flat by construction — root object, one array, primitive
 * leaves — because deeper shapes can fail structured-output generation silently.
 */
export const FindingsSchema = z.object({
  findings: z.array(
    z.object({
      requirementId: z.string(),
      judgement: z.enum(["satisfied", "not-satisfied", "unclear"]).nullable(),
      numericValue: z.number().nullable(),
      numericUnit: z.string().nullable(),
      certificatePresent: z.boolean().nullable(),
      certificateExpiry: z.string().nullable(),
      marketingClaimOnly: z.boolean().nullable(),
      categoricalValue: z.string().nullable(),
      evidenceAbsent: z.boolean(),
      conflictNote: z.string().nullable(),
      modelConfidence: z.enum(["high", "medium", "low"]),
      citationChunkId: z.string().nullable(),
      citationQuote: z.string().nullable(),
      reasoning: z.string(),
    }),
  ),
});

export type Findings = z.infer<typeof FindingsSchema>;

function describeRequirement(r: Requirement): string {
  const lines = [`${r.id} — ${r.title}`, `  ${r.description}`];
  switch (r.kind) {
    case "numeric-threshold":
      lines.push(
        `  Report the stated value as a number in "numericValue" and its unit in "numericUnit" (expected unit: ${r.unit ?? "unspecified"}).`,
        `  Do NOT decide whether it passes. Report the number only.`,
      );
      break;
    case "certification":
      lines.push(
        `  Certification: ${r.certificationName ?? "unspecified"}.`,
        `  Set "certificatePresent" true only if an actual certificate record is shown (an identifier, issuing body, or validity date).`,
        `  Put the stated expiry/validity date in "certificateExpiry" exactly as written.`,
        `  Set "marketingClaimOnly" true if the document only makes a promotional compliance claim with no certificate record.`,
        `  Do NOT judge whether the certificate is still current. Report the date only.`,
      );
      break;
    case "categorical-match":
      lines.push(
        `  Report the stated value in "categoricalValue" (for example the facility's country, exactly as stated).`,
        `  Do NOT decide whether it matches. Report the value only.`,
      );
      break;
    case "qualitative":
      lines.push(
        `  This one needs judgement. Set "judgement" to "satisfied", "not-satisfied", or "unclear".`,
      );
      break;
  }
  return lines.join("\n");
}

export const SCREENING_ROLE =
  "You extract evidence from supplier documentation so a sourcing analyst can screen suppliers against mandatory requirements.";

/**
 * Build the per-supplier screening prompt.
 *
 * The instructions repeatedly tell the model NOT to decide numeric or date
 * comparisons. That is deliberate: those decisions are made downstream in code,
 * where they are exact, auditable, and cheap to re-run under different
 * thresholds. Asking the model to also judge them would invite it to contradict
 * the deterministic result.
 */
export function buildScreeningPrompt(params: {
  supplier: IngestedDocument;
  requirements: Requirement[];
  asOfDate: string;
}): string {
  const { supplier, requirements, asOfDate } = params;

  return [
    `Today's date for this assessment is ${asOfDate}. Use it only if a document`,
    `refers to a relative time; do not compute whether dates have passed.`,
    "",
    "Extract evidence for each requirement below from the supplier document that follows.",
    "Return exactly one finding per requirement, in order.",
    "",
    "Rules:",
    '- If the document does not address a requirement at all, set "evidenceAbsent" to true.',
    '- If the document contradicts itself about a requirement, describe both statements in "conflictNote". Do not choose between them.',
    '- Cite evidence with "citationChunkId" (the id shown on the document section) and "citationQuote" (text copied verbatim from it).',
    "- Quote exactly. Do not paraphrase inside a quote.",
    '- When a requirement is unaddressed, still cite the text that shows it is unaddressed if such text exists (for example a line reading "not stated").',
    "",
    "REQUIREMENTS",
    ...requirements.map(describeRequirement),
    "",
    "SUPPLIER DOCUMENT",
    ...supplier.chunks.map((c) => fenceUntrusted(c.chunkId, c.text)),
  ].join("\n");
}
