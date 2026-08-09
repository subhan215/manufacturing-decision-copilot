import { resolveCitation } from "../ingestion/citation.ts";
import type { Corpus } from "../ingestion/types.ts";
import type { RequirementVerdict } from "./types.ts";

/**
 * Citation verification and the downgrade rules that follow from it.
 *
 * A claim is not accepted because the model asserted it. Every quote is checked
 * against the source text mechanically, and what the check returns decides
 * whether the verdict survives:
 *
 *   exact / normalized  accept — the quote is really there
 *   wrong-chunk         accept, flag, and re-point at the chunk the quote came
 *                       from; the evidence is real, only the pointer was off
 *   wrong-doc           invalidate — evidence attributed from a *different*
 *                       supplier is cross-contamination, not a typo
 *   unknown-chunk /
 *   not-found           invalidate — the quote does not exist anywhere
 *
 * Invalidating downgrades the verdict to insufficient-evidence but preserves
 * what the model originally claimed, so the evaluation can report how often
 * verification changed the answer. Overwriting the claim would make that
 * number impossible to compute.
 */
export function verifyVerdictCitation(
  verdict: RequirementVerdict,
  supplierDocId: string,
  corpus: Corpus,
): RequirementVerdict {
  // Abstaining without a citation is legitimate — there was nothing to cite.
  if (!verdict.citationChunkId || !verdict.citationQuote) {
    return {
      ...verdict,
      citationStatus: null,
      citationLocator: null,
      citationUnverified: verdict.status !== "insufficient-evidence",
      status:
        verdict.status === "insufficient-evidence" ||
        verdict.status === "conflicting"
          ? verdict.status
          : "insufficient-evidence",
    };
  }

  const citation = resolveCitation(
    { chunkId: verdict.citationChunkId, quote: verdict.citationQuote },
    corpus,
  );

  const base: RequirementVerdict = {
    ...verdict,
    citationStatus: citation.status,
    citationLocator: citation.locator,
  };

  if (citation.status === "exact" || citation.status === "normalized") {
    return { ...base, citationUnverified: false };
  }

  if (citation.status === "wrong-chunk") {
    // Real evidence, wrong pointer: keep the verdict and correct the reference.
    return {
      ...base,
      citationChunkId: citation.actualChunkId ?? verdict.citationChunkId,
      citationUnverified: false,
    };
  }

  // wrong-doc: the quote belongs to a different supplier's document. That is
  // not a citation error, it is reasoning over the wrong evidence.
  const crossContaminated =
    citation.status === "wrong-doc" && citation.docId !== supplierDocId;

  return {
    ...base,
    status: "insufficient-evidence",
    citationUnverified: true,
    reasoning:
      verdict.reasoning +
      (crossContaminated
        ? ` [Downgraded: the cited quote belongs to ${citation.docId}, not this supplier.]`
        : ` [Downgraded: the cited quote could not be located in the source document.]`),
  };
}

export function summarizeVerification(verdicts: RequirementVerdict[]): {
  verified: number;
  unverified: number;
  downgraded: number;
} {
  let verified = 0;
  let unverified = 0;
  let downgraded = 0;
  for (const v of verdicts) {
    if (v.citationUnverified) unverified++;
    else if (v.citationStatus) verified++;
    if (v.status !== v.modelClaimedStatus) downgraded++;
  }
  return { verified, unverified, downgraded };
}
