import { getCorpus } from "../ingestion/loader.ts";
import type { Corpus, IngestedDocument } from "../ingestion/types.ts";
import { askStructured, type LlmResult } from "../llm/index.ts";
import { buildSystemPrompt } from "../llm/prompt.ts";
import { resolveModel } from "../llm/config.ts";
import { loadRequirements, requirementsVersion } from "./requirements.ts";
import {
  buildScreeningPrompt,
  FindingsSchema,
  SCREENING_ROLE,
  type Findings,
} from "./prompt.ts";
import { evaluateFinding } from "./evaluate.ts";
import { verifyVerdictCitation } from "./verify.ts";
import type {
  EligibilityScreen,
  ExtractedFinding,
  Requirement,
  RequirementVerdict,
  ScreenStats,
  SupplierScreen,
} from "./types.ts";

export const DEFAULT_AS_OF_DATE = "2026-08-09";

/**
 * Concurrency is capped low on purpose. Each call spawns a Claude Code
 * subprocess, and parallel sessions are reported to hard-fail under rate
 * limiting once a handful are in flight — a 529 surfaces as "rate limited" with
 * no built-in retry. Two keeps most of the speed-up while staying well clear of
 * that threshold.
 */
export const DEFAULT_CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;

function isRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /rate.?limit|overloaded|529|temporarily/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff. Retrying immediately after an overload
 * response adds load to an already-struggling service, so each attempt waits
 * longer than the last.
 */
async function withBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) throw err;
      const waitMs = 1000 * 2 ** (attempt - 1);
      console.warn(
        `  ${label}: attempt ${attempt} hit a rate limit, retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }
  throw lastError;
}

function findingFor(
  findings: Findings["findings"],
  requirementId: string,
): ExtractedFinding | null {
  return (
    (findings.find((f) => f.requirementId === requirementId) as
      | ExtractedFinding
      | undefined) ?? null
  );
}

export async function screenSupplier(params: {
  supplier: IngestedDocument;
  requirements: Requirement[];
  corpus: Corpus;
  asOfDate: string;
}): Promise<SupplierScreen> {
  const { supplier, requirements, corpus, asOfDate } = params;
  const supplierName = supplier.doc.supplierName ?? supplier.doc.docId;

  let result: LlmResult<Findings>;
  try {
    result = await withBackoff(
      () =>
        askStructured({
          schemaName: `screening:${supplier.doc.docId}`,
          schema: FindingsSchema,
          systemPrompt: buildSystemPrompt(SCREENING_ROLE),
          prompt: buildScreeningPrompt({ supplier, requirements, asOfDate }),
          timeoutMs: 180_000,
        }),
      supplier.doc.shortId,
    );
  } catch (err) {
    return {
      supplierId: supplier.doc.docId,
      supplierName,
      verdicts: [],
      eligible: false,
      blockingRequirements: [],
      error: err instanceof Error ? err.message : String(err),
      telemetry: null,
    };
  }

  const verdicts: RequirementVerdict[] = requirements.map((requirement) => {
    const finding = findingFor(result.data.findings, requirement.id);

    if (!finding) {
      return {
        requirementId: requirement.id,
        requirementTitle: requirement.title,
        kind: requirement.kind,
        status: "insufficient-evidence",
        modelClaimedStatus: "insufficient-evidence",
        comparison: null,
        reasoning: "The model returned no finding for this requirement.",
        conflictNote: null,
        modelConfidence: "low",
        citationChunkId: null,
        citationQuote: null,
        citationStatus: null,
        citationLocator: null,
        citationUnverified: true,
      };
    }

    const outcome = evaluateFinding(requirement, finding, asOfDate);

    const draft: RequirementVerdict = {
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      kind: requirement.kind,
      status: outcome.status,
      modelClaimedStatus: outcome.status,
      comparison: outcome.comparison,
      reasoning: finding.reasoning,
      conflictNote: finding.conflictNote,
      modelConfidence: finding.modelConfidence,
      citationChunkId: finding.citationChunkId,
      citationQuote: finding.citationQuote,
      citationStatus: null,
      citationLocator: null,
      citationUnverified: false,
    };

    return verifyVerdictCitation(draft, supplier.doc.docId, corpus);
  });

  const blocking = verdicts
    .filter((v) => v.status !== "pass")
    .map((v) => v.requirementId);

  return {
    supplierId: supplier.doc.docId,
    supplierName,
    verdicts,
    eligible: blocking.length === 0,
    blockingRequirements: blocking,
    error: null,
    telemetry: result.telemetry,
  };
}

async function mapWithConcurrency<In, Out>(
  items: In[],
  limit: number,
  fn: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export async function screenAll(opts?: {
  asOfDate?: string;
  concurrency?: number;
  onProgress?: (done: number, total: number, supplierId: string) => void;
}): Promise<EligibilityScreen> {
  const asOfDate = opts?.asOfDate ?? DEFAULT_AS_OF_DATE;
  const corpus = await getCorpus();
  const requirementsFile = await loadRequirements();
  const requirements = requirementsFile.requirements;

  const startedAt = Date.now();
  let done = 0;

  const suppliers = await mapWithConcurrency(
    corpus.suppliers,
    opts?.concurrency ?? DEFAULT_CONCURRENCY,
    async (supplier) => {
      const screen = await screenSupplier({
        supplier,
        requirements,
        corpus,
        asOfDate,
      });
      done++;
      opts?.onProgress?.(done, corpus.suppliers.length, supplier.doc.shortId);
      return screen;
    },
  );

  const allVerdicts = suppliers.flatMap((s) => s.verdicts);
  const stats: ScreenStats = {
    suppliersScreened: suppliers.filter((s) => s.error === null).length,
    suppliersErrored: suppliers.filter((s) => s.error !== null).length,
    verdictsTotal: allVerdicts.length,
    citationsVerified: allVerdicts.filter(
      (v) => !v.citationUnverified && v.citationStatus !== null,
    ).length,
    citationsUnverified: allVerdicts.filter((v) => v.citationUnverified).length,
    downgradedByVerification: allVerdicts.filter(
      (v) => v.status !== v.modelClaimedStatus,
    ).length,
    deterministicVerdicts: allVerdicts.filter((v) => v.kind !== "qualitative")
      .length,
    qualitativeVerdicts: allVerdicts.filter((v) => v.kind === "qualitative")
      .length,
    totalDurationMs: Date.now() - startedAt,
    totalCostUsd: suppliers.reduce<number | null>((sum, s) => {
      const cost = s.telemetry?.costUsd ?? null;
      if (sum === null || cost === null) return sum ?? cost;
      return sum + cost;
    }, null),
  };

  return {
    asOfDate,
    model: resolveModel(),
    generatedAt: new Date().toISOString(),
    requirementsVersion: requirementsVersion(requirementsFile),
    suppliers,
    stats,
  };
}
