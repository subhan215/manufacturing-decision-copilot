import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "./paths.ts";
import type { EligibilityScreen } from "./eligibility/types.ts";
import type {
  ConditionallyEligibleSupplier,
  RankingResult,
  SensitivityReport,
  SupplierSignals,
} from "./ranking/types.ts";
import type { TeamAssumption } from "../eval/provenance.ts";
import type { ScenarioReport } from "./scenarios/types.ts";

/**
 * Frozen snapshot of a completed analysis run.
 *
 * The application reads this rather than invoking the pipeline. That is the
 * point: the engine needs an authenticated Claude Code CLI, so without a
 * snapshot nobody could run the interface without our credentials. With one,
 * `npm install && npm run dev` shows the whole system to anyone.
 *
 * Regenerated only by `npm run build:snapshot`, and stamped so a stale snapshot
 * is detectable rather than quietly wrong.
 */
export const SNAPSHOT_RELPATH = "data/derived/ui-snapshot.json";

export interface CitedChunk {
  chunkId: string;
  docId: string;
  heading: string | null;
  /** Full section text, so a quote can be shown in its surrounding context. */
  text: string;
}

export interface EvaluationHighlights {
  citationCoverage: number;
  citationCorrectness: number;
  citationsExact: number;
  citationsNormalized: number;
  hallucinationRate: number;
  detectorCasesTotal: number;
  detectorCasesCaught: number;
  detectorFalsePositives: number;
  injectionDelivered: number;
  injectionSucceeded: number;
  goldAccuracy: number;
  goldPreRegisteredAccuracy: number;
  baselineAccuracy: number;
  baselineCriticalErrors: number;
  /** Verdicts where the system declined to decide yet reported high confidence. */
  uncertainButHighConfidence: number;
  uncertainVerdicts: number;
}

export interface IngestionAuditSummary {
  documentsIngested: number;
  chunksRetained: number;
  chunksExcluded: number;
  exclusions: Array<{
    docId: string;
    ruleId: string;
    rationale: string;
    excerpt: string;
  }>;
}

export interface UiSnapshot {
  generatedAt: string;
  model: string;
  asOfDate: string;
  requirementsVersion: string;
  screen: EligibilityScreen;
  signals: SupplierSignals[];
  /**
   * Cost and sustainability for suppliers blocked by exactly one requirement.
   * Kept separate from `signals` so the baseline ranking is never accidentally
   * computed over a pool that includes ineligible suppliers — they appear only
   * inside the scenario that admits them.
   */
  nearMissSignals: SupplierSignals[];
  baseline: RankingResult;
  sensitivity: SensitivityReport;
  scenarios: ScenarioReport;
  conditionallyEligible: ConditionallyEligibleSupplier[];
  citedChunks: CitedChunk[];
  evaluation: EvaluationHighlights;
  ingestionAudit: IngestionAuditSummary;
  assumptions: TeamAssumption[];
  limitations: string[];
}

export async function loadSnapshot(): Promise<UiSnapshot> {
  const file = path.join(resolveProjectRoot(), SNAPSHOT_RELPATH);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(
      `No analysis snapshot found at ${SNAPSHOT_RELPATH}. Run \`npm run build:snapshot\` to generate one ` +
        `(requires an authenticated Claude Code CLI). A committed snapshot lets the interface run without it.`,
    );
  }
  return JSON.parse(raw) as UiSnapshot;
}
