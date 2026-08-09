import { z } from "zod";

import { resolveCitation } from "../ingestion/citation.ts";
import type { Corpus, IngestedDocument } from "../ingestion/types.ts";
import { askStructured } from "../llm/client.ts";
import { buildSystemPrompt, fenceUntrusted } from "../llm/prompt.ts";
import type { SupplierScreen } from "../eligibility/types.ts";
import type { SignalValue, SupplierSignals } from "./types.ts";

/**
 * Extraction schema for the two signals the eligibility screen does not
 * capture. Flat, per the structured-output constraint established in piece 3.
 */
export const RankingSignalsSchema = z.object({
  costValue: z.number().nullable(),
  costCurrency: z.string().nullable(),
  costUnit: z.string().nullable(),
  costCitationChunkId: z.string().nullable(),
  costCitationQuote: z.string().nullable(),
  crueltyFreeDeclaration: z.boolean(),
  thirdPartyCertifications: z.array(z.string()),
  sustainabilityCitationChunkId: z.string().nullable(),
  sustainabilityCitationQuote: z.string().nullable(),
});

export type RankingSignalsExtraction = z.infer<typeof RankingSignalsSchema>;

const SIGNALS_ROLE =
  "You extract commercial and sustainability facts from supplier documentation for a sourcing analyst.";

function buildSignalsPrompt(supplier: IngestedDocument): string {
  return [
    "Extract two things from the supplier document below.",
    "",
    "1. Unit manufacturing cost.",
    '   Put the number alone in "costValue" (no currency symbol), the currency code in "costCurrency",',
    '   and what the price is per in "costUnit" (for example "unit").',
    "   Report the figure as stated. Do not convert, adjust, or estimate it.",
    "",
    "2. Sustainability commitments.",
    '   Set "crueltyFreeDeclaration" true only if a cruelty-free declaration is documented.',
    '   List any third-party certifications by name in "thirdPartyCertifications"',
    "   (for example Ecocert, COSMOS). An unaccredited self-declaration is not a third-party",
    "   certification, and a certification named only in marketing copy without an issuing body",
    "   should not be listed.",
    "",
    "Cite both with the chunk id shown on the section and text copied verbatim from it.",
    "Use null where the document does not state a value.",
    "",
    "SUPPLIER DOCUMENT",
    ...supplier.chunks.map((c) => fenceUntrusted(c.chunkId, c.text)),
  ].join("\n");
}

function makeSignal(params: {
  value: number;
  chunkId: string | null;
  quote: string | null;
  corpus: Corpus;
  note?: string | null;
}): SignalValue {
  const { value, chunkId, quote, corpus } = params;

  if (!chunkId || !quote) {
    return {
      value,
      citationQuote: quote,
      citationChunkId: chunkId,
      citationStatus: null,
      citationLocator: null,
      verified: false,
      note: params.note ?? null,
    };
  }

  const citation = resolveCitation({ chunkId, quote }, corpus);
  return {
    value,
    citationQuote: quote,
    citationChunkId: citation.actualChunkId ?? chunkId,
    citationStatus: citation.status,
    citationLocator: citation.locator,
    verified: citation.isVerified,
    note: params.note ?? null,
  };
}

/**
 * Reuse a numeric value already extracted and citation-verified during
 * eligibility screening.
 *
 * Re-asking the model for the same number would risk the ranking and the
 * eligibility screen disagreeing about one supplier's lead time — an internal
 * contradiction that would undermine both views.
 */
function signalFromScreen(
  screen: SupplierScreen,
  requirementId: string,
  fallback: number,
  corpus: Corpus,
): SignalValue {
  const verdict = screen.verdicts.find((v) => v.requirementId === requirementId);
  if (!verdict) {
    return {
      value: fallback,
      citationQuote: null,
      citationChunkId: null,
      citationStatus: null,
      citationLocator: null,
      verified: false,
      note: `No ${requirementId} verdict on the eligibility screen.`,
    };
  }

  // The verdict's comparison string carries the extracted value, but parsing
  // prose would be fragile; take the number from the comparison's left side.
  const match = /^(-?[\d.]+)/.exec(verdict.comparison ?? "");
  const value = match ? Number(match[1]) : fallback;

  return makeSignal({
    value,
    chunkId: verdict.citationChunkId,
    quote: verdict.citationQuote,
    corpus,
    note: `Reused from eligibility screen ${requirementId}.`,
  });
}

/**
 * Certifications that are already a mandatory requirement, and therefore cannot
 * also be a sustainability advantage.
 *
 * Every eligible supplier holds ISO 22716 by definition — it is how they became
 * eligible. Counting it again as a third-party sustainability credential
 * double-counts a requirement as a bonus, and awards a point that carries no
 * information because the whole shortlist has it. This was caught by the
 * reference-value check on a supplier whose sustainability score came back a
 * point higher than its document supports.
 */
const MANDATORY_CERTIFICATION = /\biso\s*22716\b|\bcosmetics?\s+gmp\b/i;

export function sustainabilityPoints(
  crueltyFree: boolean,
  certifications: string[],
): number {
  const distinct = certifications.filter(
    (c) => !MANDATORY_CERTIFICATION.test(c),
  );
  return (crueltyFree ? 1 : 0) + distinct.length;
}

export async function extractSignals(params: {
  supplier: IngestedDocument;
  screen: SupplierScreen;
  corpus: Corpus;
}): Promise<SupplierSignals> {
  const { supplier, screen, corpus } = params;

  const { data } = await askStructured({
    schemaName: `ranking-signals:${supplier.doc.docId}`,
    schema: RankingSignalsSchema,
    systemPrompt: buildSystemPrompt(SIGNALS_ROLE),
    prompt: buildSignalsPrompt(supplier),
    timeoutMs: 120_000,
  });

  const points = sustainabilityPoints(
    data.crueltyFreeDeclaration,
    data.thirdPartyCertifications,
  );
  // Shown in the note as well, so a reader can see which credentials counted
  // and which were set aside for being the mandatory certification.
  const countedCertifications = data.thirdPartyCertifications.filter(
    (c) => !MANDATORY_CERTIFICATION.test(c),
  );

  return {
    supplierId: supplier.doc.docId,
    supplierName: supplier.doc.supplierName ?? supplier.doc.docId,
    cost: makeSignal({
      value: data.costValue ?? Number.NaN,
      chunkId: data.costCitationChunkId,
      quote: data.costCitationQuote,
      corpus,
      note:
        data.costCurrency && data.costUnit
          ? `Stated as ${data.costCurrency} per ${data.costUnit}, averaged across comparable products.`
          : "Stated average across comparable products.",
    }),
    leadTime: signalFromScreen(screen, "MR-5", Number.NaN, corpus),
    quality: signalFromScreen(screen, "MR-4", Number.NaN, corpus),
    sustainability: makeSignal({
      value: points,
      chunkId: data.sustainabilityCitationChunkId,
      quote: data.sustainabilityCitationQuote,
      corpus,
      note: `${points} point(s): ${data.crueltyFreeDeclaration ? "cruelty-free declaration" : "no declaration"}${
        countedCertifications.length > 0
          ? ` plus ${countedCertifications.join(", ")}`
          : ""
      }${
        countedCertifications.length < data.thirdPartyCertifications.length
          ? " (the mandatory cosmetics-GMP certification is not counted here; every eligible supplier holds it)"
          : ""
      }.`,
    }),
    crueltyFreeDeclaration: data.crueltyFreeDeclaration,
    thirdPartyCertifications: data.thirdPartyCertifications,
  };
}
