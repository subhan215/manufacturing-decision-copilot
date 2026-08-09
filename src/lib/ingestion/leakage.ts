import type { Corpus, DocumentKind } from "./types.ts";

/**
 * Label-leakage controls.
 *
 * The corpus was authored for this project, and authoring notes have a way of
 * stating the answer ("designed to fail the MOQ requirement"). If that text
 * reaches the model it reads the verdict off the page instead of reasoning from
 * evidence, and every accuracy / citation / hallucination number becomes a
 * measurement of nothing.
 *
 * Two severities, deliberately:
 *  - `hard` excludes the chunk. Reserved for phrases with essentially no
 *    legitimate meaning in a real supplier document.
 *  - `soft` only warns. A real supplier profile could reasonably say "synthetic
 *    fragrance" or "intentionally matte finish", and silently deleting a
 *    judge's held-out evidence would be a worse failure than the leak.
 */
export interface LeakageRule {
  id: string;
  severity: "hard" | "soft";
  /** Source is recompiled per scan; do not rely on lastIndex. */
  pattern: RegExp;
  appliesTo: DocumentKind[] | "all";
  rationale: string;
}

export const LEAKAGE_RULES: LeakageRule[] = [
  {
    id: "leak/requirement-id",
    severity: "hard",
    pattern: /\bMR-\d\b/,
    // Legitimate — indeed essential — in the product brief, which is where
    // MR-1..MR-7 are defined. In a supplier profile it can only have come from
    // the buyer's internal numbering, which a supplier would never possess.
    appliesTo: ["supplier-profile"],
    rationale:
      "References the buyer's internal mandatory-requirement identifier, which no genuine supplier document would contain.",
  },
  {
    id: "leak/mandatory-req",
    severity: "hard",
    pattern: /\bmandatory requirement\b/,
    appliesTo: ["supplier-profile"],
    rationale:
      "Names the buyer's requirement framework inside supplier-supplied evidence.",
  },
  {
    id: "leak/meta-corpus",
    severity: "hard",
    pattern: /\bhackathon\b|\bnot a real company\b|\bcase[- ]pack\b|\bevaluation corpus\b/,
    appliesTo: "all",
    rationale:
      "Meta-commentary about the exercise itself rather than about the product or supplier.",
  },
  {
    id: "leak/gold-label",
    severity: "hard",
    pattern:
      /\bdesigned to (?:fail|pass|test)\b|\bgold (?:label|answer)\b|\bexpected verdict\b|\bcase-to-requirement\b/,
    appliesTo: "all",
    rationale: "States the expected evaluation outcome directly.",
  },
  {
    id: "soft/authoring-intent",
    severity: "soft",
    pattern: /\bintentionally\b|\bengineered\b|\bfictional\b|\bsynthetic\b/,
    appliesTo: "all",
    rationale:
      "Language often used in authoring notes, but with legitimate uses in manufacturing text — flagged for review, not excluded.",
  },
];

export interface LeakageHit {
  rule: LeakageRule;
  match: string;
  index: number;
}

function applies(rule: LeakageRule, kind: DocumentKind): boolean {
  return rule.appliesTo === "all" || rule.appliesTo.includes(kind);
}

export function scanLeakage(text: string, kind: DocumentKind): LeakageHit[] {
  const hits: LeakageHit[] = [];
  for (const rule of LEAKAGE_RULES) {
    if (!applies(rule, kind)) continue;
    const re = new RegExp(rule.pattern.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ rule, match: m[0], index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return hits;
}

export function firstHardHit(
  text: string,
  kind: DocumentKind,
): LeakageHit | null {
  return scanLeakage(text, kind).find((h) => h.rule.severity === "hard") ?? null;
}

/**
 * Fail-closed gate. Runs after the corpus is assembled; throws rather than
 * returning a boolean, so a leak cannot be ignored by a caller that forgets to
 * check a return value.
 */
export function assertNoHardLeakage(corpus: Corpus): void {
  const offenders: string[] = [];
  for (const ingested of [corpus.brief, ...corpus.suppliers]) {
    for (const chunk of ingested.chunks) {
      const hit = firstHardHit(chunk.text, ingested.doc.kind);
      if (hit) {
        offenders.push(
          `${chunk.chunkId} [${hit.rule.id}] matched ${JSON.stringify(hit.match)}`,
        );
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `Hard label leakage survived into model-visible chunks:\n  ${offenders.join("\n  ")}`,
    );
  }
}
