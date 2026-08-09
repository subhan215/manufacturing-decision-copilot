/**
 * Eligibility screening run + regression checks.
 *
 *   node scripts/run-screening.ts
 *
 * Screens all 13 suppliers, prints the eligibility matrix, and asserts the
 * engineered cases the corpus was built to exercise. Exits non-zero on failure.
 */
import { loadRequirements, requirementsVersion, screenAll } from "../src/lib/eligibility/index.ts";
import type {
  EligibilityScreen,
  RequirementVerdict,
  SupplierScreen,
} from "../src/lib/eligibility/index.ts";

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

const SYMBOL: Record<string, string> = {
  pass: "PASS",
  fail: "FAIL",
  "insufficient-evidence": "N/A ",
  conflicting: "CONF",
};

function supplier(screen: EligibilityScreen, prefix: string): SupplierScreen {
  const s = screen.suppliers.find((x) => x.supplierId.startsWith(prefix));
  if (!s) throw new Error(`No supplier matching ${prefix}`);
  return s;
}

function verdict(s: SupplierScreen, requirementId: string): RequirementVerdict {
  const v = s.verdicts.find((x) => x.requirementId === requirementId);
  if (!v) throw new Error(`${s.supplierId} has no verdict for ${requirementId}`);
  return v;
}

/** Corpus size, stated once so a grown corpus cannot pass a stale assertion. */
const SUPPLIER_COUNT = 23;

console.log(`Screening ${SUPPLIER_COUNT} suppliers (cached calls are near-instant)…\n`);

const screen = await screenAll({
  onProgress: (done, total, id) =>
    console.log(`  [${String(done).padStart(2)}/${total}] ${id}`),
});

// ------------------------------------------------------------------ matrix
section("ELIGIBILITY MATRIX");

const reqIds = screen.suppliers[0].verdicts.map((v) => v.requirementId);
console.log(
  `\n  ${"supplier".padEnd(20)} ${reqIds.map((r) => r.padEnd(5)).join(" ")}  eligible`,
);
console.log(`  ${"-".repeat(20)} ${reqIds.map(() => "-----").join(" ")}  --------`);
for (const s of screen.suppliers) {
  const cells = s.verdicts.map((v) => SYMBOL[v.status].padEnd(5)).join(" ");
  console.log(
    `  ${s.supplierId.slice(0, 20).padEnd(20)} ${cells}  ${s.eligible ? "YES" : "no"}`,
  );
}

console.log(
  `\n  as-of ${screen.asOfDate} · model ${screen.model} · requirements ${screen.requirementsVersion}`,
);
console.log(
  `  ${screen.stats.verdictsTotal} verdicts · ${screen.stats.deterministicVerdicts} decided in code, ` +
    `${screen.stats.qualitativeVerdicts} by model judgement`,
);
console.log(
  `  citations: ${screen.stats.citationsVerified} verified, ${screen.stats.citationsUnverified} unverified · ` +
    `${screen.stats.downgradedByVerification} verdicts downgraded by verification`,
);
console.log(`  total ${(screen.stats.totalDurationMs / 1000).toFixed(1)}s`);

// -------------------------------------------------------------- structural
section("A. STRUCTURAL");

check(`${SUPPLIER_COUNT} suppliers screened`, screen.suppliers.length === SUPPLIER_COUNT);
check(
  "no supplier left in an error state",
  screen.stats.suppliersErrored === 0,
  screen.suppliers
    .filter((s) => s.error)
    .map((s) => `${s.supplierId}: ${s.error}`)
    .join("\n        "),
);
check(
  "every supplier has 7 verdicts",
  screen.suppliers.every((s) => s.verdicts.length === 7),
);

{
  const unverified = screen.suppliers.flatMap((s) =>
    s.verdicts
      .filter((v) => v.citationUnverified)
      .map((v) => `${s.supplierId} ${v.requirementId} (${v.citationStatus ?? "no citation"})`),
  );
  check(
    "no unverifiable citations survived into accepted verdicts",
    unverified.length === 0,
    unverified.join("\n        "),
  );
}

{
  const file = await loadRequirements();
  check(
    "screen matches the frozen requirements version",
    screen.requirementsVersion === requirementsVersion(file),
  );
}

// ------------------------------------------------- deterministic path proof
section("B. DETERMINISTIC PATH");

{
  // Only decided verdicts have something to compare. An abstention or a
  // conflict is precisely the case where no comparison was possible, so
  // requiring one there would be asserting the opposite of the design.
  const computed = screen.suppliers.flatMap((s) =>
    s.verdicts.filter(
      (v) =>
        (v.kind === "numeric-threshold" || v.kind === "certification") &&
        (v.status === "pass" || v.status === "fail"),
    ),
  );
  const withComparison = computed.filter(
    (v) => v.comparison !== null && v.comparison.length > 0,
  );
  check(
    `every decided numeric/certification verdict shows its comparison (${withComparison.length}/${computed.length})`,
    withComparison.length === computed.length,
    "a missing comparison string means the verdict did not come from the deterministic path",
  );

  const undecided = screen.suppliers.flatMap((s) =>
    s.verdicts.filter(
      (v) =>
        (v.kind === "numeric-threshold" || v.kind === "certification") &&
        v.status !== "pass" &&
        v.status !== "fail",
    ),
  );
  check(
    `abstained/conflicting numeric verdicts are accounted for (${undecided.length})`,
    undecided.every(
      (v) => v.status === "insufficient-evidence" || v.status === "conflicting",
    ),
  );

  const s12 = supplier(screen, "supplier-12");
  console.log("\n  supplier-12 (passes every threshold narrowly):");
  for (const v of s12.verdicts.filter((x) => x.comparison)) {
    console.log(`    ${v.requirementId}  ${SYMBOL[v.status]}  ${v.comparison}`);
  }
}

// ------------------------------------------------------- engineered cases
section("C. ENGINEERED CASES");

check(
  "supplier-07 does not pass MR-1 (powder-only facility)",
  verdict(supplier(screen, "supplier-07"), "MR-1").status !== "pass",
  `got ${verdict(supplier(screen, "supplier-07"), "MR-1").status}`,
);

check(
  "supplier-08 fails MR-6 (Vietnam, not India)",
  verdict(supplier(screen, "supplier-08"), "MR-6").status === "fail",
  `got ${verdict(supplier(screen, "supplier-08"), "MR-6").status}`,
);

check(
  "supplier-09 fails MR-3 (MOQ 20,000 > 5,000)",
  verdict(supplier(screen, "supplier-09"), "MR-3").status === "fail",
  `got ${verdict(supplier(screen, "supplier-09"), "MR-3").status} — ${verdict(supplier(screen, "supplier-09"), "MR-3").comparison}`,
);

check(
  "supplier-10 fails MR-5 (25 days > 20)",
  verdict(supplier(screen, "supplier-10"), "MR-5").status === "fail",
  `got ${verdict(supplier(screen, "supplier-10"), "MR-5").status} — ${verdict(supplier(screen, "supplier-10"), "MR-5").comparison}`,
);

check(
  "supplier-11 does NOT pass MR-2 (marketing claim is not a certificate)",
  verdict(supplier(screen, "supplier-11"), "MR-2").status !== "pass",
  `got ${verdict(supplier(screen, "supplier-11"), "MR-2").status} — ${verdict(supplier(screen, "supplier-11"), "MR-2").comparison}`,
);

{
  const s13 = supplier(screen, "supplier-13");
  const abstained = ["MR-2", "MR-3", "MR-4", "MR-5"].filter(
    (id) => verdict(s13, id).status === "insufficient-evidence",
  );
  check(
    `supplier-13 abstains on MR-2..MR-5 (${abstained.length}/4)`,
    abstained.length === 4,
    ["MR-2", "MR-3", "MR-4", "MR-5"]
      .map((id) => `${id}=${verdict(s13, id).status}`)
      .join(", "),
  );
  const cited = ["MR-2", "MR-3", "MR-4", "MR-5"].filter(
    (id) => verdict(s13, id).citationQuote !== null,
  );
  check(
    `supplier-13 abstentions are evidenced, not silent (${cited.length}/4 cite the document)`,
    cited.length >= 3,
    "abstention should point at the text showing the data is absent",
  );
}

{
  const v = verdict(supplier(screen, "supplier-03"), "MR-2");
  check(
    "supplier-03 MR-2 is surfaced as conflicting, not resolved",
    v.status === "conflicting",
    `got ${v.status}`,
  );
  check(
    "supplier-03 conflict note references both certification statements",
    v.conflictNote !== null &&
      /expired|2025-11-01/i.test(v.conflictNote) &&
      /current|holds/i.test(v.conflictNote),
    v.conflictNote ?? "(no conflict note)",
  );
  if (v.conflictNote) console.log(`\n        "${v.conflictNote}"`);
}

for (const prefix of ["supplier-01", "supplier-06", "supplier-12"]) {
  const s = supplier(screen, prefix);
  check(
    `${prefix} is eligible`,
    s.eligible,
    `blocked by ${s.blockingRequirements.join(", ") || "(none)"}`,
  );
}

for (const prefix of ["supplier-02", "supplier-04"]) {
  const v = verdict(supplier(screen, prefix), "MR-2");
  check(
    `${prefix} fails MR-2 on certificate expiry (computed against as-of date)`,
    v.status === "fail",
    `got ${v.status} — ${v.comparison}`,
  );
}

// --------------------------------------------------------------- summary
section(`SUMMARY — ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("\nEligibility screening is working.\n");
