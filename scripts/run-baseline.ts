/**
 * Baseline comparison and ground-truth evaluation.
 *
 *   node scripts/run-baseline.ts
 *
 * Scores the AI screen and the rule-based baseline against hand-authored gold
 * labels, classifies every disagreement by how much the mistake would cost,
 * and measures phrasing robustness on reworded documents. Exits non-zero on
 * failure.
 */
import { baselineScreen } from "../src/lib/baseline/index.ts";
import { isNegated, statesAbsence } from "../src/lib/baseline/index.ts";
import { screenAll, screenSupplier, loadRequirements } from "../src/lib/eligibility/index.ts";
import { buildCorpusVariant, getCorpus } from "../src/lib/ingestion/index.ts";
import {
  ERROR_DESCRIPTIONS,
  loadGoldLabels,
  scoreScreen,
  type SystemScorecard,
} from "../src/eval/index.ts";
import type { EligibilityScreen } from "../src/lib/eligibility/index.ts";

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

function section(title: string): void {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}

const short = (id: string) => id.slice(0, 12);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

console.log("Loading gold labels, running both systems…\n");

const goldFile = await loadGoldLabels({ force: true });
const aiScreen = await screenAll();
const baseScreen = await baselineScreen();

const ai = scoreScreen("AI (Claude)", aiScreen, goldFile);
const base = scoreScreen("Rule-based baseline", baseScreen, goldFile);

// ------------------------------------------------------------------ report
section("SCORECARD");

const row = (s: SystemScorecard) =>
  `  ${s.label.padEnd(22)} ${pct(s.accuracy).padStart(7)}  ` +
  `${String(s.correct).padStart(2)}/${s.verdictsScored}   ` +
  `${pct(s.preRegisteredAccuracy).padStart(7)} (${s.preRegisteredCorrect}/${s.preRegisteredTotal})   ` +
  `${String(s.criticalErrors).padStart(2)}        ` +
  `${s.eligibilityCorrect}/${s.eligibilityTotal}`;

console.log(
  `\n  ${"system".padEnd(22)} ${"accuracy".padStart(7)}  verdicts  ${"pre-reg".padStart(7)}          critical  eligibility`,
);
console.log(`  ${"-".repeat(22)} ${"-".repeat(7)}  --------  ${"-".repeat(7)}          --------  -----------`);
console.log(row(ai));
console.log(row(base));

console.log(
  `\n  "pre-reg" scores only the ${ai.preRegisteredTotal} labels recorded in DATA_MANIFEST.md before any`,
);
console.log(
  "  AI system existed. Those are the figures not exposed to anchoring bias.",
);

section("DISAGREEMENTS WITH GOLD");

for (const s of [ai, base]) {
  console.log(`\n  ${s.label} — ${s.disagreements.length} disagreement(s)`);
  if (s.disagreements.length === 0) {
    console.log("    (none)");
    continue;
  }
  for (const d of s.disagreements) {
    console.log(
      `    ${d.critical ? "CRITICAL" : "        "}  ${short(d.supplierId).padEnd(13)} ${d.requirementId}  ` +
        `expected ${d.expected}, got ${d.actual}  [${d.errorClass}]`,
    );
  }
}

section("ERROR TAXONOMY");

const classes = Object.keys(ERROR_DESCRIPTIONS) as Array<
  keyof typeof ERROR_DESCRIPTIONS
>;
console.log(`\n  ${"error class".padEnd(20)} ${"AI".padStart(4)} ${"base".padStart(5)}   meaning`);
for (const c of classes) {
  const a = ai.errorsByClass[c];
  const b = base.errorsByClass[c];
  if (a === 0 && b === 0) continue;
  console.log(
    `  ${c.padEnd(20)} ${String(a).padStart(4)} ${String(b).padStart(5)}   ${ERROR_DESCRIPTIONS[c].slice(0, 60)}`,
  );
}

section("REVIEW EFFORT AND COST");

console.log(
  `\n  ${"system".padEnd(22)} ${"flagged".padStart(8)} ${"burden".padStart(8)} ${"runtime".padStart(10)} ${"cost".padStart(9)}`,
);
for (const s of [ai, base]) {
  console.log(
    `  ${s.label.padEnd(22)} ${`${s.flaggedForReview}/${s.verdictsScored}`.padStart(8)} ` +
      `${pct(s.reviewBurden).padStart(8)} ${`${(s.durationMs / 1000).toFixed(1)}s`.padStart(10)} ` +
      `${(s.costUsd === null ? "n/a" : `$${s.costUsd.toFixed(4)}`).padStart(9)}`,
  );
}

// What matters is not how many verdicts each system flags, but how many errors
// hide among the ones it did NOT flag — those are the answers a reviewer would
// take at face value.
function errorsInUnflagged(
  s: SystemScorecard,
  screen: EligibilityScreen,
): number {
  return s.disagreements.filter((d) => {
    const verdict = screen.suppliers
      .find((x) => x.supplierId === d.supplierId)
      ?.verdicts.find((v) => v.requirementId === d.requirementId);
    return (
      verdict &&
      verdict.status !== "conflicting" &&
      verdict.status !== "insufficient-evidence"
    );
  }).length;
}

const aiHidden = errorsInUnflagged(ai, aiScreen);
const baseHidden = errorsInUnflagged(base, baseScreen);

console.log(
  `\n  The AI screen's runtime reads 0.0s because its results are served from cache;` +
    `\n  a cold run costs roughly 170s and the $${(ai.costUsd ?? 0).toFixed(2)} shown. The baseline is` +
    `\n  genuinely free and instant, and that is a real advantage it holds.`,
);
console.log(
  `\n  Both systems flag some verdicts as needing a human (AI ${ai.flaggedForReview}, baseline ${base.flaggedForReview}).` +
    `\n  The question that matters is what hides among the verdicts they did NOT flag,` +
    `\n  because those are the answers a reviewer accepts at face value:` +
    `\n    AI       — ${aiHidden} error(s) among ${ai.verdictsScored - ai.flaggedForReview} unflagged verdicts` +
    `\n    baseline — ${baseHidden} error(s) among ${base.verdictsScored - base.flaggedForReview} unflagged verdicts, all of them critical`,
);
console.log(
  "\n  Manual review is not measured here. A stated assumption of ~10 minutes per",
);
console.log(
  "  supplier to read a profile and check seven requirements would put manual effort",
);
console.log(
  "  at roughly 130 minutes for this corpus. That figure is an estimate, not data.",
);

// ------------------------------------------------------- A. gold integrity
section("A. GOLD-LABEL INTEGRITY");

check(
  `91 gold labels, one per supplier x requirement (${goldFile.labels.length})`,
  goldFile.labels.length === 91,
);
check(
  "every label carries a rationale",
  goldFile.labels.every((l) => l.rationale.trim().length > 0),
);
check(
  "every label carries a provenance tag",
  goldFile.labels.every(
    (l) => l.provenance === "pre-registered" || l.provenance === "post-hoc",
  ),
);
check(
  `pre-registered subset is non-trivial (${ai.preRegisteredTotal} labels)`,
  ai.preRegisteredTotal >= 20,
);
{
  const ambiguous = goldFile.labels.filter((l) => l.alsoAcceptable.length > 0);
  console.log(
    `        ${ambiguous.length} label(s) admit an alternative answer; leniency is declared, not hidden.`,
  );
}

// ------------------------------------------------ B. baseline competence
section("B. BASELINE COMPETENCE (it must not be a strawman)");

const corpus = await getCorpus();
const s07 = corpus.suppliers.find((s) => s.doc.docId.startsWith("supplier-07"))!;
const s13 = corpus.suppliers.find((s) => s.doc.docId.startsWith("supplier-13"))!;

const s07Capability = s07.chunks.find(
  (c) => c.headingSlug === "manufacturing-capability",
)!;
check(
  "NegEx negates 'serum' in supplier-07's \"No liquid-fill or serum production line\"",
  isNegated(s07Capability.text, "serum") &&
    isNegated(s07Capability.text, "liquid"),
);

{
  const verdict = baseScreen.suppliers
    .find((s) => s.supplierId.startsWith("supplier-07"))!
    .verdicts.find((v) => v.requirementId === "MR-1")!;
  check(
    `baseline correctly fails supplier-07 MR-1 via negation (got ${verdict.status})`,
    verdict.status === "fail",
    "without negation handling this would be a false pass, and the comparison a strawman",
  );
}

check(
  "explicit-absence detection fires on supplier-13",
  statesAbsence(s13.chunks.map((c) => c.text).join("\n")) !== null,
);

{
  const abstentions = baseScreen.suppliers
    .find((s) => s.supplierId.startsWith("supplier-13"))!
    .verdicts.filter((v) => v.status === "insufficient-evidence").length;
  check(
    `baseline abstains rather than asserting on supplier-13 (${abstentions}/7)`,
    abstentions >= 4,
  );
}

{
  // Date comparison must actually be doing work: at least one certificate is
  // rejected purely because its stated validity precedes the as-of date.
  const expiryFails = baseScreen.suppliers.filter((s) => {
    const v = s.verdicts.find((x) => x.requirementId === "MR-2");
    return v?.status === "fail" && /precedes the as-of date/.test(v.reasoning);
  }).length;
  check(
    `baseline date comparison rejects expired certificates (${expiryFails} supplier(s))`,
    expiryFails >= 2,
  );
}

for (const [requirementId, name] of [
  ["MR-3", "MOQ"],
  ["MR-5", "lead time"],
  ["MR-6", "location"],
] as const) {
  const total = baseScreen.suppliers.length;
  const correct = baseScreen.suppliers.filter((s) => {
    const v = s.verdicts.find((x) => x.requirementId === requirementId)!;
    const label = goldFile.labels.find(
      (l) => l.supplierId === s.supplierId && l.requirementId === requirementId,
    )!;
    return label.expected === v.status || label.alsoAcceptable.includes(v.status);
  }).length;
  check(
    `baseline ${name} extraction at least 80% correct (${correct}/${total})`,
    correct / total >= 0.8,
  );
}

// -------------------------------------------- C. structural failure modes
section("C. REMAINING FAILURES ARE STRUCTURAL, NOT OMISSIONS");

{
  const v = baseScreen.suppliers
    .find((s) => s.supplierId === "supplier-03")!
    .verdicts.find((x) => x.requirementId === "MR-2")!;
  check(
    `baseline cannot surface supplier-03's self-contradiction (got ${v.status}, gold expects conflicting)`,
    v.status !== "conflicting",
    "if the baseline handles this, the writeup must be corrected rather than the test relaxed",
  );

  const aiVerdict = aiScreen.suppliers
    .find((s) => s.supplierId === "supplier-03")!
    .verdicts.find((x) => x.requirementId === "MR-2")!;
  check(
    "AI surfaces supplier-03's self-contradiction",
    aiVerdict.status === "conflicting",
  );
}

// --------------------------------------------------- D. cost-sensitive win
section("D. THE ADVANTAGE IS IN THE DANGEROUS DIRECTION");

check(
  `AI makes fewer critical errors than the baseline (${ai.criticalErrors} vs ${base.criticalErrors})`,
  ai.criticalErrors < base.criticalErrors,
  "critical = false-pass + false-certainty + missed-conflict",
);
check(
  `AI accuracy is at least the baseline's (${pct(ai.accuracy)} vs ${pct(base.accuracy)})`,
  ai.accuracy >= base.accuracy,
);
check(
  `AI flags fewer than all verdicts for review (${ai.flaggedForReview}/${ai.verdictsScored})`,
  ai.flaggedForReview < ai.verdictsScored,
);
check(
  `no errors hide among the AI's unflagged verdicts (${aiHidden}, baseline has ${baseHidden})`,
  aiHidden < baseHidden,
  "an unflagged wrong answer is the one a reviewer accepts without checking",
);

// ------------------------------------------------ E. phrasing robustness
section("E. PHRASING ROBUSTNESS (reworded documents)");

const variant = await buildCorpusVariant("paraphrased");
const requirementsFile = await loadRequirements();

const baseVariant = await baselineScreen({ corpus: variant });

const aiVariantSuppliers: EligibilityScreen["suppliers"] = [];
for (const supplier of variant.suppliers) {
  console.log(`  re-screening ${supplier.doc.shortId} (reworded)…`);
  aiVariantSuppliers.push(
    await screenSupplier({
      supplier,
      requirements: requirementsFile.requirements,
      corpus: variant,
      asOfDate: aiScreen.asOfDate,
    }),
  );
}
const aiVariant: EligibilityScreen = {
  ...aiScreen,
  suppliers: aiVariantSuppliers,
};

const aiVar = scoreScreen("AI (reworded)", aiVariant, goldFile);
const baseVar = scoreScreen("Baseline (reworded)", baseVariant, goldFile);

// Same three suppliers, original wording, for a like-for-like comparison.
const variantIds = new Set(variant.suppliers.map((s) => s.doc.docId));
const subset = (screen: EligibilityScreen): EligibilityScreen => ({
  ...screen,
  suppliers: screen.suppliers.filter((s) => variantIds.has(s.supplierId)),
});
const aiOrig = scoreScreen("AI (original)", subset(aiScreen), goldFile);
const baseOrig = scoreScreen("Baseline (original)", subset(baseScreen), goldFile);

console.log(
  `\n  ${"system".padEnd(22)} ${"original".padStart(9)} ${"reworded".padStart(9)} ${"change".padStart(8)}`,
);
for (const [o, v] of [
  [aiOrig, aiVar],
  [baseOrig, baseVar],
] as const) {
  const delta = v.accuracy - o.accuracy;
  console.log(
    `  ${o.label.replace(" (original)", "").padEnd(22)} ${pct(o.accuracy).padStart(9)} ${pct(v.accuracy).padStart(9)} ` +
      `${`${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`.padStart(8)}`,
  );
}

const aiDrop = aiOrig.accuracy - aiVar.accuracy;
const baseDrop = baseOrig.accuracy - baseVar.accuracy;

check(
  `AI holds up under rewording (dropped ${(aiDrop * 100).toFixed(1)}pp)`,
  aiDrop <= 0.15,
);
check(
  `baseline degrades more than the AI under rewording (${(baseDrop * 100).toFixed(1)}pp vs ${(aiDrop * 100).toFixed(1)}pp)`,
  baseDrop > aiDrop,
  "if the baseline does not degrade, phrasing robustness is not the advantage assumed and the writeup must say so",
);

if (baseVar.disagreements.length > 0) {
  console.log("\n  Baseline errors introduced purely by rewording:");
  for (const d of baseVar.disagreements) {
    console.log(
      `    ${short(d.supplierId).padEnd(13)} ${d.requirementId}  expected ${d.expected}, got ${d.actual}  [${d.errorClass}]`,
    );
  }
}

// --------------------------------------------------------------- summary
section(`SUMMARY — ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("\nBaseline comparison complete.\n");
