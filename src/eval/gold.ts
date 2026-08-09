import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../lib/paths.ts";
import type { VerdictStatus } from "../lib/eligibility/types.ts";

export const GOLD_RELPATH = "data/derived/gold-labels.json";

export type LabelProvenance = "pre-registered" | "post-hoc";

export interface GoldLabel {
  supplierId: string;
  requirementId: string;
  expected: VerdictStatus;
  /**
   * Verdicts a competent reviewer could also defend. Present only where the
   * document is genuinely ambiguous — forcing one answer there would penalise
   * correct reasoning rather than measure it.
   */
  alsoAcceptable: VerdictStatus[];
  /**
   * `pre-registered` labels correspond to outcomes recorded during corpus
   * construction, before any AI system existed, and are therefore free of
   * anchoring. `post-hoc` labels were authored after the system had run and
   * carry a disclosed risk that the author was influenced by its output.
   */
  provenance: LabelProvenance;
  rationale: string;
}

export interface GoldLabelFile {
  asOfDate: string;
  authoredAt: string;
  method: string;
  limitations: string[];
  labels: GoldLabel[];
}

let cached: GoldLabelFile | null = null;

export async function loadGoldLabels(opts?: {
  force?: boolean;
}): Promise<GoldLabelFile> {
  if (cached && !opts?.force) return cached;

  const file = path.join(resolveProjectRoot(), GOLD_RELPATH);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(
      `Gold labels not found at ${GOLD_RELPATH}. They are hand-authored and committed, not generated.`,
    );
  }

  cached = JSON.parse(raw) as GoldLabelFile;
  return cached;
}

export function goldKey(supplierId: string, requirementId: string): string {
  return `${supplierId}::${requirementId}`;
}

export function indexGold(file: GoldLabelFile): Map<string, GoldLabel> {
  const map = new Map<string, GoldLabel>();
  for (const label of file.labels) {
    map.set(goldKey(label.supplierId, label.requirementId), label);
  }
  return map;
}

/** A verdict is correct if it matches the expected label or a stated alternative. */
export function isAcceptable(label: GoldLabel, actual: VerdictStatus): boolean {
  return label.expected === actual || label.alsoAcceptable.includes(actual);
}
