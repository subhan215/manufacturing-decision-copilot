/**
 * Ranking + sensitivity analysis run and regression checks.
 *
 *   node scripts/run-ranking.ts
 *
 * Ranks the eligible suppliers, prints the sensitivity analysis, and asserts
 * the properties the design depends on. Exits non-zero on failure.
 */
import {
  buildRankingReport,
  CRITERIA,
  defaultWeights,
  monteCarlo,
  rankSuppliers,
  scenarios,
  winnerOf,
  MONTE_CARLO_SAMPLES,
} from "../src/lib/ranking/index.ts";
import { screenAll } from "../src/lib/eligibility/index.ts";

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

const short = (id: string) => id.slice(0, 11);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

console.log("Screening, then ranking eligible suppliers…\n");

const screen = await screenAll();
const report = await buildRankingReport({
  screen,
  onProgress: (id) => console.log(`  signals: ${id}`),
});

const { signals, baseline, sensitivity } = report;

// ------------------------------------------------------------------ output
section("SIGNALS");

console.log(
  `\n  ${"supplier".padEnd(12)} ${"cost".padStart(9)} ${"lead".padStart(8)} ${"fail".padStart(8)} ${"sustain".padStart(8)}`,
);
console.log(`  ${"-".repeat(12)} ${"-".repeat(9)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)}`);
for (const s of signals) {
  console.log(
    `  ${short(s.supplierId).padEnd(12)} ${`$${s.cost.value.toFixed(2)}`.padStart(9)} ` +
      `${`${s.leadTime.value}d`.padStart(8)} ${`${s.quality.value}%`.padStart(8)} ` +
      `${`${s.sustainability.value}pt`.padStart(8)}`,
  );
}

section("BASELINE RANKING (brief default weights)");

console.log(
  `\n  ${"#".padEnd(3)} ${"supplier".padEnd(12)} ${"score".padStart(7)}   contributions (cost/lead/quality/sustain)`,
);
for (const r of baseline.ranked) {
  const c = r.contributions;
  console.log(
    `  ${String(r.rank).padEnd(3)} ${short(r.supplierId).padEnd(12)} ${r.totalScore.toFixed(3).padStart(7)}   ` +
      `${c.cost.toFixed(3)} / ${c.leadTime.toFixed(3)} / ${c.quality.toFixed(3)} / ${c.sustainability.toFixed(3)}`,
  );
}

section("SENSITIVITY — (a) NAMED SCENARIOS");

for (const { scenario, ranked } of sensitivity.scenarios) {
  console.log(
    `\n  ${scenario.label.padEnd(22)} winner: ${short(ranked[0].supplierId)}  ` +
      `(${ranked.map((r) => `${short(r.supplierId)} ${r.totalScore.toFixed(3)}`).join(", ")})`,
  );
}

section("SENSITIVITY — (b) WEIGHT STABILITY INTERVALS");

console.log("");
for (const wsi of sensitivity.stabilityIntervals) {
  const label = CRITERIA.find((c) => c.id === wsi.criterion)!.label;
  if (wsi.alwaysStable) {
    console.log(
      `  ${label.padEnd(42)} ${short(wsi.baselineWinner)} wins at every weight 0–100%`,
    );
  } else {
    console.log(
      `  ${label.padEnd(42)} ${short(wsi.baselineWinner)} wins for weight ` +
        `${pct(wsi.stableFrom)}–${pct(wsi.stableTo)}; ` +
        `${short(wsi.crossoverTo ?? "?")} takes over at ${pct(wsi.crossoverWeight ?? 0)}`,
    );
  }
}

section("SENSITIVITY — (c) MONTE CARLO (10,000 random weightings)");

console.log("");
for (const s of signals) {
  const p = sensitivity.monteCarlo.winProbability[s.supplierId];
  const bar = "#".repeat(Math.round(p * 40));
  console.log(
    `  ${short(s.supplierId).padEnd(12)} wins ${pct(p).padStart(6)}  mean rank ${sensitivity.monteCarlo.meanRank[s.supplierId].toFixed(2)}  ${bar}`,
  );
}

section("PARETO DOMINANCE");

if (sensitivity.dominance.length === 0) {
  console.log("\n  No supplier is dominated — every one is best on something.");
} else {
  for (const d of sensitivity.dominance) {
    console.log(`\n  ${short(d.dominatedId)} is dominated by ${short(d.dominatedBy)}`);
    console.log(`    ${d.explanation}`);
  }
}

if (report.conditionallyEligible.length > 0) {
  section("CONDITIONALLY ELIGIBLE (not rejected — undocumented)");
  for (const c of report.conditionallyEligible) {
    console.log(`\n  ${c.supplierName}`);
    console.log(`    unresolved: ${c.unresolvedRequirements.join(", ")}`);
    console.log(`    request: ${c.dataGaps.join("; ")}`);
  }
}

// ---------------------------------------------------------------- assertions
section("A. STRUCTURAL");

check(
  `${signals.length} eligible suppliers ranked`,
  signals.length === screen.suppliers.filter((s) => s.eligible).length,
);
check(
  "every ranked supplier has a finite score",
  baseline.ranked.every((r) => Number.isFinite(r.totalScore)),
);
check(
  "baseline weights sum to 1",
  Math.abs(CRITERIA.reduce((sum, c) => sum + baseline.weights[c.id], 0) - 1) < 1e-9,
);
check(
  "all normalised values lie within [0, 1]",
  baseline.ranked.every((r) =>
    CRITERIA.every(
      (c) => r.normalized[c.id] >= -1e-9 && r.normalized[c.id] <= 1 + 1e-9,
    ),
  ),
);
check(
  "every signal carries a verified citation",
  signals.every(
    (s) =>
      s.cost.verified &&
      s.leadTime.verified &&
      s.quality.verified &&
      s.sustainability.verified,
  ),
  signals
    .flatMap((s) =>
      CRITERIA.filter((c) => !s[c.id].verified).map(
        (c) => `${short(s.supplierId)} ${c.id}: ${s[c.id].citationStatus ?? "no citation"}`,
      ),
    )
    .join("\n        "),
);

section("B. DIRECTION CORRECTNESS");

{
  const cheapest = [...signals].sort((a, b) => a.cost.value - b.cost.value)[0];
  const fastest = [...signals].sort(
    (a, b) => a.leadTime.value - b.leadTime.value,
  )[0];
  const bestQuality = [...signals].sort(
    (a, b) => a.quality.value - b.quality.value,
  )[0];

  const scoreOf = (id: string) =>
    baseline.ranked.find((r) => r.supplierId === id)!;

  check(
    `cheapest supplier (${short(cheapest.supplierId)}) scores 1.0 on cost`,
    Math.abs(scoreOf(cheapest.supplierId).normalized.cost - 1) < 1e-9,
    "an inverted direction would silently produce a confidently wrong recommendation",
  );
  check(
    `fastest supplier (${short(fastest.supplierId)}) scores 1.0 on lead time`,
    Math.abs(scoreOf(fastest.supplierId).normalized.leadTime - 1) < 1e-9,
  );
  check(
    `lowest fail rate (${short(bestQuality.supplierId)}) scores 1.0 on quality`,
    Math.abs(scoreOf(bestQuality.supplierId).normalized.quality - 1) < 1e-9,
  );
}

section("C. REUSE CONSISTENCY WITH THE ELIGIBILITY SCREEN");

{
  let consistent = true;
  const details: string[] = [];
  for (const s of signals) {
    const supplierScreen = screen.suppliers.find(
      (x) => x.supplierId === s.supplierId,
    )!;
    for (const [requirementId, signalValue, name] of [
      ["MR-5", s.leadTime.value, "lead time"],
      ["MR-4", s.quality.value, "fail rate"],
    ] as const) {
      const verdict = supplierScreen.verdicts.find(
        (v) => v.requirementId === requirementId,
      )!;
      const fromScreen = Number(/^(-?[\d.]+)/.exec(verdict.comparison ?? "")?.[1]);
      if (Math.abs(fromScreen - signalValue) > 1e-9) {
        consistent = false;
        details.push(
          `${short(s.supplierId)} ${name}: ranking ${signalValue} vs screen ${fromScreen}`,
        );
      }
    }
  }
  check(
    "ranking uses exactly the values the eligibility screen extracted",
    consistent,
    details.join("\n        "),
  );
}

section("D. DOMINANCE AND COMPENSATION BOUNDS");

{
  const dominatedIds = new Set(sensitivity.dominance.map((d) => d.dominatedId));
  check(
    `dominance detected (${dominatedIds.size} supplier(s))`,
    dominatedIds.size > 0,
    "expected supplier-12 to be dominated by supplier-01 on this corpus",
  );

  for (const id of dominatedIds) {
    const wonScenario = sensitivity.scenarios.some(
      (s) => s.ranked[0].supplierId === id,
    );
    check(
      `${short(id)} never wins a named scenario`,
      !wonScenario,
    );

    const wonSweep = sensitivity.stabilityIntervals.some(
      (w) => w.baselineWinner === id || w.crossoverTo === id,
    );
    check(`${short(id)} never wins anywhere in a weight sweep`, !wonSweep);

    check(
      `${short(id)} wins 0 of ${MONTE_CARLO_SAMPLES.toLocaleString()} Monte Carlo draws`,
      sensitivity.monteCarlo.winProbability[id] === 0,
      `won ${pct(sensitivity.monteCarlo.winProbability[id])} — dominance or scoring is broken`,
    );
  }
}

{
  const eligibleIds = new Set(
    screen.suppliers.filter((s) => s.eligible).map((s) => s.supplierId),
  );
  const rankedIds = new Set(baseline.ranked.map((r) => r.supplierId));
  const intruder = [...rankedIds].find((id) => !eligibleIds.has(id));
  check(
    "no ineligible supplier appears in the ranking under any weighting",
    intruder === undefined,
    intruder
      ? `${intruder} was ranked despite failing the eligibility screen`
      : undefined,
  );
}

section("E. THE ANALYSIS IS NON-VACUOUS");

{
  const flipping = sensitivity.stabilityIntervals.filter((w) => !w.alwaysStable);
  check(
    `at least one criterion changes the winner when swept (${flipping.length}/${CRITERIA.length})`,
    flipping.length > 0,
    "if no weighting ever changes the answer, the sensitivity analysis proves nothing",
  );

  const winners = new Set(
    sensitivity.scenarios.map((s) => s.ranked[0].supplierId),
  );
  check(
    `named scenarios produce more than one winner (${winners.size})`,
    winners.size > 1,
    [...winners].join(", "),
  );
}

section("F. DETERMINISM");

{
  const a = monteCarlo(signals, 500, 1234);
  const b = monteCarlo(signals, 500, 1234);
  check(
    "same seed produces identical win probabilities",
    JSON.stringify(a.winProbability) === JSON.stringify(b.winProbability),
  );
  const c = monteCarlo(signals, 500, 9999);
  check(
    "a different seed is actually sampling differently",
    JSON.stringify(a.winProbability) !== JSON.stringify(c.winProbability) ||
      sensitivity.dominance.length === signals.length - 1,
  );
}

section("G. DEFAULT OUTCOME");

{
  const winner = winnerOf(signals, defaultWeights());
  check(
    `brief-default weights produce a stable, reproducible winner (${short(winner)})`,
    winner === rankSuppliers(signals, defaultWeights()).ranked[0].supplierId,
  );
  check(
    "every named scenario weight vector sums to 1",
    scenarios().every(
      (s) =>
        Math.abs(CRITERIA.reduce((sum, c) => sum + s.weights[c.id], 0) - 1) <
        1e-9,
    ),
  );
}

section(`SUMMARY — ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("\nRanking and sensitivity analysis are working.\n");
