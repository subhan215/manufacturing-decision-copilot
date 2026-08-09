/**
 * Supply-risk scenario checks.
 *
 *   node scripts/run-scenarios.ts
 *
 * Verifies the concentration maths against published worked examples, the
 * split-allocation feasibility findings against hand-computed arithmetic, the
 * disruption outcomes, and the honesty rules the scenarios are built under —
 * chiefly that no upside is ever reported without its caveat. Exits non-zero
 * on failure.
 *
 * Everything here is deterministic, so this suite needs no model access.
 */
import { screenAll, loadRequirements } from "../src/lib/eligibility/index.ts";
import { buildRankingReport } from "../src/lib/ranking/index.ts";
import {
  analyseSplits,
  concentration,
  moqsFromScreen,
  runAllScenarios,
  ORDER_QUANTITIES,
  SECONDARY_VIABILITY_FLOOR,
} from "../src/lib/scenarios/index.ts";
import type { SplitAnalysis } from "../src/lib/scenarios/index.ts";
import { loadSnapshot } from "../src/lib/snapshot.ts";

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

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;
const short = (id: string) => id.slice(0, 12);

console.log("Running screen and ranking, then replaying scenarios…\n");

const screen = await screenAll();
const requirementsFile = await loadRequirements();
const ranking = await buildRankingReport({ screen });
const snapshot = await loadSnapshot();
const moqs = moqsFromScreen(screen);

const report = runAllScenarios({
  screen,
  signals: ranking.signals,
  requirements: requirementsFile.requirements,
  asOfDate: screen.asOfDate,
});

const launch = report.splits.find(
  (s) => s.orderQuantity === ORDER_QUANTITIES.launch,
) as SplitAnalysis;
const scale = report.splits.find(
  (s) => s.orderQuantity === ORDER_QUANTITIES.scaleUp,
) as SplitAnalysis;

// ------------------------------------------------------- concentration maths
section("A. CONCENTRATION MATHS");

// Worked examples from the published definition of the index. If our
// implementation disagrees with these, it is not HHI.
check(
  "a 70/30 split gives HHI 0.58",
  close(concentration([0.7, 0.3]).hhi, 0.58, 1e-12),
  `got ${concentration([0.7, 0.3]).hhi}`,
);
check(
  "four suppliers at 25% each give HHI 0.25",
  close(concentration([0.25, 0.25, 0.25, 0.25]).hhi, 0.25, 1e-12),
);
check(
  "a single source is HHI 1.0 and 1.0 effective suppliers",
  concentration([1]).hhi === 1 && concentration([1]).effectiveSuppliers === 1,
);
check(
  "a 50/50 split is HHI 0.5 and 2.0 effective suppliers",
  close(concentration([0.5, 0.5]).hhi, 0.5) &&
    close(concentration([0.5, 0.5]).effectiveSuppliers, 2),
);
check(
  "an empty allocation reports 0 effective suppliers rather than dividing by zero",
  concentration([]).effectiveSuppliers === 0,
);

// -------------------------------------------------------- split feasibility
section("B. SPLIT FEASIBILITY — THE HEADLINE FINDING");

console.log("  Minimum order quantities in play:");
for (const m of moqs) {
  const eligible = screen.suppliers.find(
    (s) => s.supplierId === m.supplierId,
  )?.eligible;
  if (eligible) console.log(`    ${short(m.supplierId).padEnd(13)} ${m.moq}`);
}
console.log();

// The finding the write-up leads with: at launch volume the ratios procurement
// teams actually use are unavailable, because the secondary allocation lands
// below every eligible supplier's minimum.
for (const ratio of [0.2, 0.3]) {
  const units = ratio * ORDER_QUANTITIES.launch;
  check(
    `at ${ORDER_QUANTITIES.launch.toLocaleString()} units, a ${100 - ratio * 100}/${ratio * 100} split is blocked by minimum order quantities (secondary would get ${units.toLocaleString()})`,
    launch.ratiosBlockedByMoq.some((r) => close(r, ratio)),
  );
}
check(
  "no 80/20 or 70/30 option is feasible at launch volume",
  launch.options
    .filter((o) => o.secondary.share <= 0.3)
    .every((o) => !o.feasible),
);
check(
  "every blocked option names the minimum order quantity as the reason",
  launch.options
    .filter((o) => !o.feasible && o.secondary.share <= 0.3)
    .every((o) => /minimum/.test(o.infeasibleReason ?? "")),
  "infeasibility must be explained, not merely asserted",
);
check(
  "the launch headline says dual sourcing is possible but not at standard ratios",
  /not at the ratios normally used/.test(launch.headline),
  launch.headline,
);

{
  // 60/40 at 8,000 puts 3,200 units with the secondary — reachable only by a
  // supplier whose minimum is at or below that.
  const canTake3200 = moqs
    .filter((m) => m.moq <= 3200)
    .filter((m) =>
      screen.suppliers.some((s) => s.supplierId === m.supplierId && s.eligible),
    );
  check(
    `exactly one eligible supplier can take the 60/40 secondary share (${canTake3200.map((m) => short(m.supplierId)).join(", ") || "none"})`,
    canTake3200.length === 1,
  );
  check(
    "the feasible 60/40 option is the one with that supplier as secondary",
    launch.options
      .filter((o) => close(o.secondary.share, 0.4) && o.feasible)
      .every((o) => o.secondary.supplierId === canTake3200[0]?.supplierId),
  );
}

{
  // Supplier 12's 5,000 minimum is 62.5% of the launch order, so it can only
  // ever be the primary — and only at exactly that boundary.
  const s12 = moqs.find((m) => m.moq === 5000);
  const boundary = s12 ? s12.moq / ORDER_QUANTITIES.launch : null;
  check(
    "the 5,000-unit minimum equals 62.5% of the launch order",
    boundary !== null && close(boundary, 0.625),
    `got ${boundary}`,
  );
  const withS12 = launch.options.filter(
    (o) =>
      o.feasible &&
      (o.primary.supplierId === s12?.supplierId ||
        o.secondary.supplierId === s12?.supplierId),
  );
  check(
    "that supplier appears in no feasible launch split as the secondary",
    withS12.every((o) => o.secondary.supplierId !== s12?.supplierId),
  );
  check(
    "where it does appear, it holds exactly the boundary share and both legs sit on their minimum",
    withS12.length === 0 ||
      withS12.every(
        (o) =>
          close(o.primary.share, 0.625) &&
          o.primary.units === o.primary.moq &&
          o.derivedFromMoq,
      ),
    withS12
      .map((o) => `${o.primary.share} ${o.primary.units}/${o.primary.moq}`)
      .join(" · "),
  );
}

check(
  `at ${ORDER_QUANTITIES.scaleUp.toLocaleString()} units no standard ratio is blocked`,
  scale.ratiosBlockedByMoq.length === 0,
  `blocked: ${scale.ratiosBlockedByMoq.join(", ")}`,
);
check(
  "scale-up volume has strictly more feasible arrangements than launch volume",
  scale.feasibleCount > launch.feasibleCount,
  `${scale.feasibleCount} vs ${launch.feasibleCount}`,
);

// --------------------------------------------------------- viability floor
section("C. SECONDARY VIABILITY FLOOR");

{
  // Force the floor to bite on its own, with minimums low enough that MOQ is
  // not the binding constraint. A 10% allocation must still be rejected.
  const tiny = analyseSplits({
    signals: ranking.signals,
    moqs: ranking.signals.map((s) => ({ supplierId: s.supplierId, moq: 1 })),
    orderQuantity: 1_000_000,
  });
  const belowFloor = tiny.options.filter(
    (o) => o.secondary.share < SECONDARY_VIABILITY_FLOOR,
  );
  check(
    "a split allocating under the floor is never counted as feasible, even when both minimums are met",
    belowFloor.every((o) => !o.feasible && o.primary.meetsMoq && o.secondary.meetsMoq),
  );
  check(
    "the floor is explained where it is applied, not left as a bare number",
    belowFloor.every((o) =>
      /commercially engaged/.test(o.infeasibleReason ?? ""),
    ),
    belowFloor[0]?.infeasibleReason ?? "no option fell below the floor",
  );
}

// ------------------------------------------------------- blended arithmetic
section("D. BLENDED ARITHMETIC");

{
  const option = launch.options.find(
    (o) => o.feasible && close(o.secondary.share, 0.5),
  );
  if (!option) {
    check("a 50/50 launch option exists to check arithmetic against", false);
  } else {
    const p = ranking.signals.find(
      (s) => s.supplierId === option.primary.supplierId,
    )!;
    const q = ranking.signals.find(
      (s) => s.supplierId === option.secondary.supplierId,
    )!;
    const expectedUnit = 0.5 * p.cost.value + 0.5 * q.cost.value;

    console.log(
      `  ${short(p.supplierId)} $${p.cost.value}/${p.leadTime.value}d/${p.quality.value}%  +  ${short(q.supplierId)} $${q.cost.value}/${q.leadTime.value}d/${q.quality.value}%`,
    );

    check(
      `blended unit cost is the share-weighted average ($${expectedUnit.toFixed(2)})`,
      close(option.blendedUnitCost, expectedUnit, 1e-9),
      `got ${option.blendedUnitCost}`,
    );
    check(
      `total is the blended unit cost across the order ($${(expectedUnit * ORDER_QUANTITIES.launch).toLocaleString()})`,
      close(option.totalCost, expectedUnit * ORDER_QUANTITIES.launch, 1e-6),
    );
    check(
      `lead time is the slower of the two (${Math.max(p.leadTime.value, q.leadTime.value)} days)`,
      option.leadTimeDays === Math.max(p.leadTime.value, q.leadTime.value),
    );
    check(
      "defect exposure is share-weighted",
      close(
        option.blendedFailRate,
        0.5 * p.quality.value + 0.5 * q.quality.value,
        1e-9,
      ),
    );
    check(
      "splitting costs more than the cheapest sole source, and the delta says so",
      option.costDeltaVsSoleSource > 0 &&
        close(
          option.costDeltaVsSoleSource,
          (option.blendedUnitCost - launch.soleSourceBest!.unitCost) *
            ORDER_QUANTITIES.launch,
          1e-6,
        ),
    );
  }
}

check(
  "the blended cost carries its volume-pricing caveat",
  launch.caveats.some((c) => /premium/.test(c) && /volume/.test(c)),
  "a modelled saving that assumes price is independent of volume must say so",
);

// -------------------------------------------------------------- disruptions
section("E. DISRUPTION OUTCOMES");

{
  const baselineWinner = report.baseline?.supplierId;
  const scenario = report.scenarios.find(
    (s) => s.kind === "supplier-unavailable",
  );
  check("the recommended supplier has an unavailability scenario", !!scenario);
  if (scenario && baselineWinner) {
    check(
      `removing ${short(baselineWinner)} leaves ${scenario.eligibleAfter.length} eligible suppliers`,
      !scenario.eligibleAfter.includes(baselineWinner) &&
        scenario.eligibleAfter.length ===
          scenario.eligibleBefore.length - 1,
    );
    check(
      `the successor is the runner-up from the baseline ranking (${short(scenario.rankingAfter[0] ?? "none")})`,
      scenario.rankingAfter[0] === scenario.rankingBefore[1],
    );
    check(
      "the scenario reports that the winner changed",
      scenario.winnerChanged,
    );
    check(
      "it discloses that scores are re-normalised over a different pool",
      scenario.caveats.some((c) => /not directly comparable/.test(c)),
    );
  }
}

{
  const slip = report.scenarios.find((s) => s.kind === "lead-time-slip");
  check("a lead-time slip scenario exists", !!slip);
  if (slip) {
    const requirement = requirementsFile.requirements.find(
      (r) => r.id === "MR-5",
    )!;
    // Hand-computed: each eligible supplier's quoted lead time × 1.25 against
    // the brief's limit. Asserting the arithmetic, not just the count.
    const survivors = ranking.signals
      .filter((s) => s.leadTime.value * 1.25 <= (requirement.threshold ?? 0))
      .map((s) => s.supplierId);
    check(
      `a 25% slip leaves exactly the suppliers whose quoted time × 1.25 still meets the limit (${survivors.map(short).join(", ") || "none"})`,
      slip.eligibleAfter.length === survivors.length &&
        survivors.every((id) => slip.eligibleAfter.includes(id)),
      `scenario says ${slip.eligibleAfter.map(short).join(", ")}`,
    );
    check(
      "suppliers quoting close to the limit are named as the ones that drop out",
      slip.exited.length > 0 &&
        slip.exited.every((id) => !slip.eligibleAfter.includes(id)),
    );
    // The re-check runs over every supplier, not only the eligible ones, so it
    // catches a supplier that was already blocked elsewhere and would now be
    // blocked on lead time as well. That matters: it is exactly the case where
    // relaxing one requirement no longer helps.
    const shouldFlip = screen.suppliers.filter((s) => {
      const v = s.verdicts.find((x) => x.requirementId === "MR-5");
      const m = /^(-?[\d.]+)/.exec(v?.comparison ?? "");
      return (
        v?.status === "pass" &&
        m !== null &&
        Number(m[1]) * 1.25 > (requirement.threshold ?? 0)
      );
    });
    check(
      `the constraint re-check records every verdict flip, including for already-blocked suppliers (${shouldFlip.map((s) => short(s.supplierId)).join(", ")})`,
      slip.constraintChecks.length === shouldFlip.length &&
        shouldFlip.every((s) =>
          slip.constraintChecks.some(
            (c) => c.supplierId === s.supplierId && c.after === "fail",
          ),
        ),
      `${slip.constraintChecks.length} recorded vs ${shouldFlip.length} expected`,
    );
    check(
      "more verdicts flip than suppliers exit, because some were already blocked elsewhere",
      slip.constraintChecks.length >= slip.exited.length,
    );
  }
}

// ------------------------------------------------------------- relaxations
section("F. REQUIREMENT RELAXATION");

{
  const relaxations = report.scenarios.filter(
    (s) => s.kind === "requirement-relaxed",
  );
  check(
    `every requirement blocking exactly one supplier has a relaxation scenario (${relaxations.length})`,
    relaxations.length ===
      new Set(
        screen.suppliers
          .filter((s) => !s.eligible && s.blockingRequirements.length === 1)
          .map((s) => s.blockingRequirements[0]),
      ).size,
  );
  check(
    "every relaxation admits at least one supplier — a scenario that changes nothing is not shown",
    relaxations.every((s) => s.entered.length > 0),
  );
  check(
    "no relaxation ever removes an already-eligible supplier",
    relaxations.every((s) =>
      s.eligibleBefore.every((id) => s.eligibleAfter.includes(id)),
    ),
  );
  check(
    "every relaxation states that the requirement was set for a reason",
    relaxations.every((s) =>
      s.caveats.some((c) => /not a recommendation to drop it|commercial decision/.test(c)),
    ),
  );

  // The lead-time caveat asserts the supplier it admits brings no cost relief.
  // That is a claim about the data, so it is checked rather than trusted.
  const mr5 = report.scenarios.find((s) => s.id.startsWith("threshold-MR-5"));
  if (mr5 && mr5.entered.length > 0) {
    // Near-miss costs live in the committed snapshot rather than being
    // re-extracted here, so this suite stays free of model access.
    const admitted = snapshot.nearMissSignals.find(
      (s) => s.supplierId === mr5.entered[0],
    );
    const dearest = Math.max(...ranking.signals.map((s) => s.cost.value));
    check(
      "the lead-time caveat's claim that the admitted supplier is the dearest holds against the data",
      admitted === undefined || admitted.cost.value > dearest,
      admitted ? `${admitted.cost.value} vs ${dearest}` : "no signals to check",
    );
  }

  const mr6 = report.scenarios.find((s) => s.id === "relax-MR-6");
  check("the origin requirement has a relaxation scenario", !!mr6);
  if (mr6) {
    check(
      "relaxing it admits exactly one supplier",
      mr6.entered.length === 1,
      mr6.entered.join(", "),
    );
    // This is the scenario carrying the largest apparent saving, so it is the
    // one where an unqualified number would do the most damage.
    check(
      "it names freight or customs alongside the saving",
      mr6.caveats.some((c) => /freight|customs|shipping/.test(c)),
      mr6.caveats.join(" | "),
    );
  }
}

// --------------------------------------------------------------- discipline
section("G. NO UPSIDE WITHOUT ITS CAVEAT");

check(
  "every scenario carries at least one caveat",
  report.scenarios.every((s) => s.caveats.length > 0),
  report.scenarios
    .filter((s) => s.caveats.length === 0)
    .map((s) => s.id)
    .join(", "),
);
check(
  "every scenario that admits a supplier carries at least two caveats",
  report.scenarios
    .filter((s) => s.entered.length > 0)
    .every((s) => s.caveats.length >= 2),
  report.scenarios
    .filter((s) => s.entered.length > 0 && s.caveats.length < 2)
    .map((s) => `${s.id} (${s.caveats.length})`)
    .join(", "),
);
check(
  "every scenario states its impact in words rather than leaving the reader to infer it",
  report.scenarios.every((s) => s.impact.trim().length > 20),
);
check(
  "every split analysis carries its modelling caveats",
  report.splits.every((s) => s.caveats.length >= 3),
);

// -------------------------------------------------- track minimum evidence
section("H. TRACK 3 MINIMUM EVIDENCE");

const evidence = report.trackEvidence;
check("a baseline plan is stated", evidence.hasBaselinePlan);
check(
  "the baseline is described as sole-source with concentration 1.0",
  report.baseline !== null &&
    report.baseline.concentration.hhi === 1 &&
    /sole-source/.test(report.baseline.description),
);
check(
  `at least two disruption scenarios (${evidence.disruptionScenarioCount})`,
  evidence.disruptionScenarioCount >= 2,
);
check(
  "every scenario re-runs constraint checks rather than only re-ranking",
  evidence.everyScenarioHasConstraintChecks,
);
for (const [name, present] of Object.entries(evidence.tradeoffsCovered)) {
  check(`${name} tradeoff is present in the split output`, present);
}

// ------------------------------------------------------------------ summary
section(`SUMMARY — ${checks - failures}/${checks} checks passed`);

console.log(`\n  ${report.baseline?.description ?? "no baseline"}\n`);
for (const s of report.scenarios) {
  console.log(`  ${s.label}`);
  console.log(`    ${s.impact}`);
}
console.log();
for (const s of report.splits) {
  console.log(
    `  ${s.orderQuantity.toLocaleString()} units — ${s.feasibleCount} feasible arrangement(s)`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("\nScenario checks complete.\n");
