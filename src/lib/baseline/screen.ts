import { getCorpus } from "../ingestion/loader.ts";
import { resolveCitation } from "../ingestion/citation.ts";
import type { Corpus, IngestedDocument } from "../ingestion/types.ts";
import { loadRequirements } from "../eligibility/requirements.ts";
import { DEFAULT_AS_OF_DATE } from "../eligibility/screen.ts";
import type {
  EligibilityScreen,
  Requirement,
  RequirementVerdict,
  ScreenStats,
  SupplierScreen,
} from "../eligibility/types.ts";
import { NO_EVIDENCE } from "../eligibility/evaluate.ts";
import {
  ruleCertification,
  ruleCrueltyFree,
  ruleFailRate,
  ruleLiquidCapability,
  ruleLocation,
  ruleNumericThreshold,
  type RuleOutcome,
} from "./rules.ts";

/**
 * Non-AI baseline screener.
 *
 * Returns the same `SupplierScreen` shape as the AI pipeline on purpose: the
 * comparator then treats both identically and neither can be given favourable
 * handling by accident. Runs in milliseconds with no model, no network and no
 * Claude Code installation, so a reviewer can reproduce it unconditionally.
 *
 * Which rule applies to which requirement is driven by the requirement's own
 * `kind`, exactly as the AI path is, so the two systems are answering the same
 * question rather than subtly different ones.
 */

/** Sections a rule reads, by requirement. Mirrors where a human would look. */
const SECTION_HINTS: Record<string, string[]> = {
  "MR-1": ["manufacturing-capability"],
  "MR-2": ["certifications"],
  "MR-3": ["order-terms"],
  "MR-4": ["quality-history"],
  "MR-5": ["order-terms"],
  "MR-6": ["_titleblock", "location-note"],
  "MR-7": ["sustainability"],
};

function sectionText(
  supplier: IngestedDocument,
  requirementId: string,
): { text: string; chunkId: string | null } {
  const slugs = SECTION_HINTS[requirementId] ?? [];
  const chunks = supplier.chunks.filter((c) => slugs.includes(c.headingSlug));
  if (chunks.length > 0) {
    return {
      text: chunks.map((c) => c.text).join("\n"),
      chunkId: chunks[0].chunkId,
    };
  }
  // No hinted section present: fall back to the whole document rather than
  // reporting a spurious absence.
  return {
    text: supplier.chunks.map((c) => c.text).join("\n"),
    chunkId: supplier.chunks[0]?.chunkId ?? null,
  };
}

function applyRule(
  requirement: Requirement,
  text: string,
  asOfDate: string,
): RuleOutcome {
  switch (requirement.id) {
    case "MR-1":
      return ruleLiquidCapability(text);
    case "MR-2":
      return ruleCertification(
        text,
        requirement.certificationName?.replace(/\s*\(.*\)\s*/, "") ?? "ISO 22716",
        asOfDate,
      );
    case "MR-3":
      return ruleNumericThreshold(
        text,
        /minimum order quantity/i,
        requirement.threshold ?? 5000,
        requirement.unit ?? "units",
      );
    case "MR-4":
      return ruleFailRate(text, requirement.threshold ?? 30);
    case "MR-5":
      return ruleNumericThreshold(
        text,
        /lead time/i,
        requirement.threshold ?? 20,
        requirement.unit ?? "days",
      );
    case "MR-6":
      return ruleLocation(text, requirement.expectedValue ?? "India");
    case "MR-7":
      return ruleCrueltyFree(text);
    default:
      return {
        status: "insufficient-evidence",
        evidence: null,
        explanation: `No baseline rule defined for ${requirement.id}.`,
      };
  }
}

function screenOne(
  supplier: IngestedDocument,
  requirements: Requirement[],
  corpus: Corpus,
  asOfDate: string,
): SupplierScreen {
  const verdicts: RequirementVerdict[] = requirements.map((requirement) => {
    const { text, chunkId } = sectionText(supplier, requirement.id);
    const outcome = applyRule(requirement, text, asOfDate);

    // The baseline can cite: a regex match has a position. Resolving it through
    // the same verifier the AI path uses keeps citation coverage comparable, so
    // any difference the comparison reports is about citation quality rather
    // than one system simply not being asked for evidence.
    let citationStatus = null;
    let citationLocator = null;
    let citationChunkId = chunkId;

    if (outcome.evidence && chunkId) {
      const citation = resolveCitation(
        { chunkId, quote: outcome.evidence },
        corpus,
      );
      citationStatus = citation.status;
      citationLocator = citation.locator;
      citationChunkId = citation.actualChunkId ?? chunkId;
    }

    return {
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      kind: requirement.kind,
      status: outcome.status,
      // The baseline reports a status and a quote, never a structured reading,
      // so threshold exploration is not available for it. Stated rather than
      // faked.
      evidence: NO_EVIDENCE,
      modelClaimedStatus: outcome.status,
      comparison: null,
      reasoning: outcome.explanation,
      conflictNote: null,
      modelConfidence: "medium",
      citationChunkId: outcome.evidence ? citationChunkId : null,
      citationQuote: outcome.evidence,
      citationStatus,
      citationLocator,
      citationUnverified: outcome.evidence === null,
    };
  });

  const blocking = verdicts
    .filter((v) => v.status !== "pass")
    .map((v) => v.requirementId);

  return {
    supplierId: supplier.doc.docId,
    supplierName: supplier.doc.supplierName ?? supplier.doc.docId,
    verdicts,
    eligible: blocking.length === 0,
    blockingRequirements: blocking,
    error: null,
    telemetry: null,
  };
}

export async function baselineScreen(opts?: {
  asOfDate?: string;
  corpus?: Corpus;
}): Promise<EligibilityScreen> {
  const asOfDate = opts?.asOfDate ?? DEFAULT_AS_OF_DATE;
  const corpus = opts?.corpus ?? (await getCorpus());
  const requirementsFile = await loadRequirements();

  const startedAt = Date.now();
  const suppliers = corpus.suppliers.map((s) =>
    screenOne(s, requirementsFile.requirements, corpus, asOfDate),
  );
  const durationMs = Date.now() - startedAt;

  const allVerdicts = suppliers.flatMap((s) => s.verdicts);
  const stats: ScreenStats = {
    suppliersScreened: suppliers.length,
    suppliersErrored: 0,
    verdictsTotal: allVerdicts.length,
    citationsVerified: allVerdicts.filter(
      (v) => v.citationStatus === "exact" || v.citationStatus === "normalized",
    ).length,
    citationsUnverified: allVerdicts.filter((v) => v.citationUnverified).length,
    downgradedByVerification: 0,
    deterministicVerdicts: allVerdicts.length,
    qualitativeVerdicts: 0,
    totalDurationMs: durationMs,
    totalCostUsd: 0,
  };

  return {
    asOfDate,
    model: "rule-based-baseline (no model)",
    generatedAt: new Date().toISOString(),
    requirementsVersion: "baseline",
    suppliers,
    stats,
  };
}
