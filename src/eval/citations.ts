import { resolveCitation } from "../lib/ingestion/citation.ts";
import type { Corpus, CitationStatus } from "../lib/ingestion/types.ts";
import type { EligibilityScreen } from "../lib/eligibility/types.ts";

/**
 * Citation coverage, correctness, and — critically — validation that the
 * detector actually detects.
 *
 * On the real screen every citation resolves. That is either a clean result or
 * a broken checker, and from the outside the two are indistinguishable: a
 * verifier that always returned "exact" would produce exactly the same table.
 * So the headline number is only reported alongside a demonstrated detection
 * rate on deliberately corrupted citations.
 *
 * We do not use an LLM judge for faithfulness, as the common RAG evaluation
 * toolchains do. Self-enhancement bias would have a model grade output from its
 * own family, and the claim does not need a model: a quote either appears at
 * the cited offset or it does not.
 */

export interface CitationMetrics {
  verdictsTotal: number;
  /** Verdicts carrying a citation at all. */
  withCitation: number;
  coverage: number;
  byStatus: Record<string, number>;
  /** exact + normalized, both of which are correct attributions. */
  verified: number;
  correctness: number;
  /** unknown-chunk + not-found: the quote exists nowhere. */
  hallucinated: number;
  hallucinationRate: number;
  /** wrong-chunk + wrong-doc: quote is real but attributed incorrectly. */
  misattributed: number;
}

export function measureCitations(screen: EligibilityScreen): CitationMetrics {
  const verdicts = screen.suppliers.flatMap((s) => s.verdicts);
  const byStatus: Record<string, number> = {};

  let withCitation = 0;
  let verified = 0;
  let hallucinated = 0;
  let misattributed = 0;

  for (const v of verdicts) {
    if (v.citationQuote && v.citationChunkId) withCitation++;
    const status = v.citationStatus ?? "none";
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    if (status === "exact" || status === "normalized") verified++;
    if (status === "unknown-chunk" || status === "not-found") hallucinated++;
    if (status === "wrong-chunk" || status === "wrong-doc") misattributed++;
  }

  const n = verdicts.length || 1;
  return {
    verdictsTotal: verdicts.length,
    withCitation,
    coverage: withCitation / n,
    byStatus,
    verified,
    correctness: withCitation === 0 ? 0 : verified / withCitation,
    hallucinated,
    hallucinationRate: hallucinated / n,
    misattributed,
  };
}

// ------------------------------------------------------ detector validation

export type CorruptionType =
  | "fabricated-quote"
  | "wrong-chunk-same-doc"
  | "wrong-doc"
  | "nonexistent-chunk";

export interface CorruptionCase {
  type: CorruptionType;
  chunkId: string;
  quote: string;
  /** Statuses that count as the detector having caught this corruption. */
  expectedStatuses: CitationStatus[];
}

export interface DetectorValidation {
  /** Uncorrupted citations, which must NOT be flagged. */
  controlsTotal: number;
  controlsPassed: number;
  casesTotal: number;
  casesCaught: number;
  detectionRate: number;
  byType: Record<
    CorruptionType,
    { total: number; caught: number; observed: Record<string, number> }
  >;
  falsePositives: number;
}

/**
 * Build corrupted citations from real ones, one of each type per supplier.
 *
 * Synthetic perturbation is the standard way to validate a detector when no
 * corpus of organic errors exists. It is a proxy: injected corruptions may not
 * mirror the shape of genuine model mistakes, and the report says so.
 */
export function buildCorruptionCases(
  screen: EligibilityScreen,
  corpus: Corpus,
): CorruptionCase[] {
  const cases: CorruptionCase[] = [];
  const suppliers = screen.suppliers.filter((s) => s.verdicts.length > 0);

  suppliers.forEach((supplier, index) => {
    const cited = supplier.verdicts.filter(
      (v) => v.citationQuote && v.citationChunkId,
    );
    if (cited.length === 0) return;

    const source = cited[0];
    const chunkId = source.citationChunkId!;
    const quote = source.citationQuote!;

    // 1. A quote that appears nowhere in the corpus.
    cases.push({
      type: "fabricated-quote",
      chunkId,
      quote:
        "This facility holds a Class IV sterile-fill authorisation valid through 2031 under registry number ZZ-000000.",
      expectedStatuses: ["not-found"],
    });

    // 2. A real quote attributed to a different section of the same document.
    const otherChunk = supplier.verdicts.find(
      (v) => v.citationChunkId && v.citationChunkId !== chunkId,
    )?.citationChunkId;
    if (otherChunk) {
      cases.push({
        type: "wrong-chunk-same-doc",
        chunkId: otherChunk,
        quote,
        expectedStatuses: ["wrong-chunk", "wrong-doc"],
      });
    }

    // 3. A real quote attributed to a different supplier's document — the
    //    cross-contamination case, which matters most: reasoning over another
    //    supplier's evidence produces a confident and entirely wrong verdict.
    const otherSupplier = suppliers[(index + 1) % suppliers.length];
    const foreignChunk = otherSupplier.verdicts.find(
      (v) => v.citationChunkId,
    )?.citationChunkId;
    if (foreignChunk && otherSupplier.supplierId !== supplier.supplierId) {
      cases.push({
        type: "wrong-doc",
        chunkId: foreignChunk,
        quote,
        expectedStatuses: ["wrong-doc", "wrong-chunk"],
      });
    }

    // 4. A chunk id that does not exist at all.
    cases.push({
      type: "nonexistent-chunk",
      chunkId: `${supplier.supplierId}#s99-does-not-exist`,
      quote,
      expectedStatuses: ["unknown-chunk"],
    });
  });

  void corpus;
  return cases;
}

export function validateDetector(
  screen: EligibilityScreen,
  corpus: Corpus,
): DetectorValidation {
  const cases = buildCorruptionCases(screen, corpus);

  const byType = {
    "fabricated-quote": { total: 0, caught: 0, observed: {} },
    "wrong-chunk-same-doc": { total: 0, caught: 0, observed: {} },
    "wrong-doc": { total: 0, caught: 0, observed: {} },
    "nonexistent-chunk": { total: 0, caught: 0, observed: {} },
  } as DetectorValidation["byType"];

  let caught = 0;
  for (const c of cases) {
    const citation = resolveCitation(
      { chunkId: c.chunkId, quote: c.quote },
      corpus,
    );
    const bucket = byType[c.type];
    bucket.total++;
    bucket.observed[citation.status] =
      (bucket.observed[citation.status] ?? 0) + 1;

    // Caught means: not silently accepted as a correct attribution.
    const accepted =
      citation.status === "exact" || citation.status === "normalized";
    if (!accepted) {
      bucket.caught++;
      caught++;
    }
  }

  // Controls: the real, uncorrupted citations must still resolve cleanly. A
  // detector that rejects everything would score 100% on the cases above while
  // being useless, so this half of the test is what rules that out.
  let controlsTotal = 0;
  let controlsPassed = 0;
  for (const supplier of screen.suppliers) {
    for (const v of supplier.verdicts) {
      if (!v.citationQuote || !v.citationChunkId) continue;
      controlsTotal++;
      const citation = resolveCitation(
        { chunkId: v.citationChunkId, quote: v.citationQuote },
        corpus,
      );
      if (citation.status === "exact" || citation.status === "normalized") {
        controlsPassed++;
      }
    }
  }

  return {
    controlsTotal,
    controlsPassed,
    casesTotal: cases.length,
    casesCaught: caught,
    detectionRate: cases.length === 0 ? 0 : caught / cases.length,
    byType,
    falsePositives: controlsTotal - controlsPassed,
  };
}
