/**
 * Cache audit.
 *
 *   node scripts/audit-cache.ts
 *
 * The committed response cache is what lets a reviewer reproduce every reported
 * number without a Claude Code login. That claim is only true if the entries on
 * disk are the ones the pipeline actually asks for — and a prompt or schema edit
 * silently orphans an entry while leaving the file sitting there, so the
 * directory keeps looking healthy while the guarantee quietly rots.
 *
 * This replays every call path in the project and compares what was requested
 * against what is stored. Exits non-zero if any needed entry is missing.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/paths.ts";
import { cacheDir } from "../src/lib/llm/config.ts";
import { requestedKeys } from "../src/lib/llm/index.ts";
import { buildCorpusVariant, getCorpus } from "../src/lib/ingestion/index.ts";
import {
  loadRequirements,
  screenAll,
  screenSupplier,
} from "../src/lib/eligibility/index.ts";
import { buildRankingReport, extractSignals } from "../src/lib/ranking/index.ts";
import {
  testEvidenceRemoval,
  testPromptInjection,
} from "../src/eval/index.ts";

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail?: string): void {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

console.log("Replaying every call path against the cache…\n");

const corpus = await getCorpus();
const requirementsFile = await loadRequirements();

console.log("  screening…");
const screen = await screenAll();

console.log("  ranking signals…");
// Called for the cache keys it requests, not for its result.
await buildRankingReport({ screen });

console.log("  near-miss signals…");
for (const supplierScreen of screen.suppliers.filter(
  (s) => !s.eligible && !s.error && s.blockingRequirements.length === 1,
)) {
  const doc = corpus.suppliers.find(
    (d) => d.doc.docId === supplierScreen.supplierId,
  );
  if (doc) await extractSignals({ supplier: doc, screen: supplierScreen, corpus });
}

console.log("  paraphrase robustness…");
const variant = await buildCorpusVariant("paraphrased");
for (const supplier of variant.suppliers) {
  await screenSupplier({
    supplier,
    requirements: requirementsFile.requirements,
    corpus: variant,
    asOfDate: screen.asOfDate,
  });
}

console.log("  evidence removal…");
await testEvidenceRemoval({
  corpus,
  screen,
  requirements: requirementsFile.requirements,
  asOfDate: screen.asOfDate,
  cases: [
    { supplierIdPrefix: "supplier-01", slug: "certifications", requirementId: "MR-2" },
    { supplierIdPrefix: "supplier-06", slug: "order-terms", requirementId: "MR-3" },
  ],
});

console.log("  prompt injection…");
await testPromptInjection({
  corpus,
  screen,
  requirements: requirementsFile.requirements,
  asOfDate: screen.asOfDate,
  supplierIdPrefix: "supplier-09",
});

// ------------------------------------------------------------- comparison
const dir = cacheDir();
const onDisk = new Set(
  (await readdir(dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, "")),
);
const asked = requestedKeys();

const missing = [...asked].filter((k) => !onDisk.has(k));
const orphaned = [...onDisk].filter((k) => !asked.has(k));

let bytes = 0;
for (const key of onDisk) {
  bytes += (await stat(path.join(dir, `${key}.json`))).size;
}
let orphanBytes = 0;
for (const key of orphaned) {
  orphanBytes += (await stat(path.join(dir, `${key}.json`))).size;
}

console.log(`\n${"=".repeat(78)}\nCACHE AUDIT\n${"=".repeat(78)}\n`);
console.log(`  requested by the pipeline   ${asked.size}`);
console.log(`  present on disk             ${onDisk.size}  (${Math.round(bytes / 1024)} KB)`);
console.log(`  missing (would need a CLI)  ${missing.length}`);
console.log(
  `  orphaned (never requested)  ${orphaned.length}  (${Math.round(orphanBytes / 1024)} KB)`,
);

if (orphaned.length > 0) {
  console.log(`
  Two things produce an entry this replay does not request, and only one of
  them is waste:

    - Call paths outside the replay. \`probe:llm\` and \`extract:requirements\`
      each make calls, and neither is reachable here: the probe checks liveness
      and fails preflight before the cache is consulted, and requirements are
      extracted once, then frozen and committed. Their entries are real.
    - Residue from an edited prompt or schema. The key covers everything that
      can change an answer, so an edit makes the old entry unreachable while
      leaving the file in place.

  Nothing is deleted automatically. Pruning on the strength of one replay would
  eventually remove an entry belonging to a path the replay had stopped
  covering, and the failure would surface as an unreproducible number on a
  reviewer's machine — long after the evidence of what happened was gone.`);
}

check(
  `every call the pipeline makes is served from disk (${asked.size - missing.length}/${asked.size})`,
  missing.length === 0,
  missing.length > 0
    ? `${missing.length} call(s) would spawn the CLI — a reviewer without a login cannot reproduce this`
    : undefined,
);
check(
  `unreferenced entries stay within the known call paths and prompt history (${orphaned.length})`,
  orphaned.length <= 30,
  "an unexplained jump here means a call path has silently stopped being replayed",
);

console.log(`\n${"=".repeat(78)}\nSUMMARY — ${checks - failures}/${checks} checks passed\n${"=".repeat(78)}`);

if (missing.length > 0) {
  console.error("\nThe cache is incomplete.\n");
  process.exit(1);
}
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log(
  `\nEvery call the pipeline makes is served from \`${path.relative(resolveProjectRoot(), dir)}\`. ` +
    `A reviewer with no Claude Code login can reproduce every reported number.\n`,
);
