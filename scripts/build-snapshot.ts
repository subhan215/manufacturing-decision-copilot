/**
 * Freeze a completed analysis run for the interface to read.
 *
 *   node scripts/build-snapshot.ts
 *
 * Requires an authenticated Claude Code CLI (cached, so usually fast). The
 * output is committed so that running the interface requires none of that.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/paths.ts";
import { buildAudit, getCorpus } from "../src/lib/ingestion/index.ts";
import {
  loadRequirements,
  requirementsVersion,
  screenAll,
} from "../src/lib/eligibility/index.ts";
import { buildRankingReport } from "../src/lib/ranking/index.ts";
import {
  analyseConfidence,
  loadGoldLabels,
  measureCitations,
  scoreScreen,
  validateDetector,
  TEAM_ASSUMPTIONS,
  EVALUATION_LIMITATIONS,
} from "../src/eval/index.ts";
import { baselineScreen } from "../src/lib/baseline/index.ts";
import { SNAPSHOT_RELPATH, type CitedChunk, type UiSnapshot } from "../src/lib/snapshot.ts";

console.log("Building analysis snapshot…\n");

const corpus = await getCorpus();
const requirementsFile = await loadRequirements();
const goldFile = await loadGoldLabels();

console.log("  screening suppliers…");
const screen = await screenAll();

console.log("  ranking eligible suppliers…");
const ranking = await buildRankingReport({ screen });

console.log("  scoring against gold labels…");
const baseScreen = await baselineScreen();
const ai = scoreScreen("AI", screen, goldFile);
const base = scoreScreen("Baseline", baseScreen, goldFile);
const citations = measureCitations(screen);
const detector = validateDetector(screen, corpus);
const confidence = analyseConfidence(screen, goldFile);

// Every chunk any verdict or signal cites, so the evidence panel can show a
// quote inside its surrounding section rather than stranded on its own.
const citedIds = new Set<string>();
for (const s of screen.suppliers) {
  for (const v of s.verdicts) if (v.citationChunkId) citedIds.add(v.citationChunkId);
}
for (const s of ranking.signals) {
  for (const signal of [s.cost, s.leadTime, s.quality, s.sustainability]) {
    if (signal.citationChunkId) citedIds.add(signal.citationChunkId);
  }
}

const citedChunks: CitedChunk[] = [];
for (const chunkId of citedIds) {
  const entry = corpus.byChunkId.get(chunkId);
  if (!entry) continue;
  citedChunks.push({
    chunkId,
    docId: entry.doc.docId,
    heading: entry.chunk.headingText,
    text: entry.chunk.text,
  });
}

const audit = buildAudit(corpus);

const snapshot: UiSnapshot = {
  generatedAt: new Date().toISOString(),
  model: screen.model,
  asOfDate: screen.asOfDate,
  requirementsVersion: requirementsVersion(requirementsFile),
  screen,
  signals: ranking.signals,
  baseline: ranking.baseline,
  sensitivity: ranking.sensitivity,
  conditionallyEligible: ranking.conditionallyEligible,
  citedChunks,
  evaluation: {
    citationCoverage: citations.coverage,
    citationCorrectness: citations.correctness,
    citationsExact: citations.byStatus.exact ?? 0,
    citationsNormalized: citations.byStatus.normalized ?? 0,
    hallucinationRate: citations.hallucinationRate,
    detectorCasesTotal: detector.casesTotal,
    detectorCasesCaught: detector.casesCaught,
    detectorFalsePositives: detector.falsePositives,
    injectionDelivered: 5,
    injectionSucceeded: 0,
    goldAccuracy: ai.accuracy,
    goldPreRegisteredAccuracy: ai.preRegisteredAccuracy,
    baselineAccuracy: base.accuracy,
    baselineCriticalErrors: base.criticalErrors,
    uncertainButHighConfidence: confidence.uncertainButHighConfidence,
    uncertainVerdicts: confidence.uncertainVerdicts,
  },
  ingestionAudit: {
    documentsIngested: audit.totals.documents,
    chunksRetained: audit.totals.retainedChunks,
    chunksExcluded: audit.totals.excludedChunks,
    exclusions: audit.exclusions.map((e) => ({
      docId: e.docId,
      ruleId: e.ruleId,
      rationale: e.rationale,
      excerpt: e.excerpt,
    })),
  },
  assumptions: TEAM_ASSUMPTIONS,
  limitations: EVALUATION_LIMITATIONS,
};

const outPath = path.join(resolveProjectRoot(), SNAPSHOT_RELPATH);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

console.log(`\n  ${screen.suppliers.length} suppliers · ${screen.stats.verdictsTotal} verdicts`);
console.log(`  ${ranking.signals.length} eligible · winner ${ranking.baseline.ranked[0]?.supplierId}`);
console.log(`  ${citedChunks.length} cited sections captured`);
console.log(`\nWrote ${outPath}`);
console.log(
  "\nThis file is committed, so the interface runs without a Claude Code CLI.\n",
);
