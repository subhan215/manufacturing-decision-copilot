/**
 * Interface checks.
 *
 *   node scripts/check-ui.ts
 *
 * Validates the frozen snapshot, guards the client/server boundary, and
 * confirms the interactive ranking agrees with the recorded one. Exits non-zero
 * on failure.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/paths.ts";
import { loadSnapshot } from "../src/lib/snapshot.ts";
import { loadRequirements, requirementsVersion } from "../src/lib/eligibility/index.ts";
import { defaultWeights, rankSuppliers } from "../src/lib/ranking/score.ts";

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

/** Corpus size, stated once so a grown corpus cannot pass a stale assertion. */
const SUPPLIER_COUNT = 23;

const root = resolveProjectRoot();
const snapshot = await loadSnapshot();

// ------------------------------------------------------- snapshot integrity
section("A. SNAPSHOT INTEGRITY");

check(
  `${SUPPLIER_COUNT} suppliers screened (${snapshot.screen.suppliers.length})`,
  snapshot.screen.suppliers.length === SUPPLIER_COUNT,
);
check(
  "every supplier has 7 verdicts",
  snapshot.screen.suppliers.every((s) => s.verdicts.length === 7),
);
check(
  `${snapshot.signals.length} eligible suppliers carry ranking signals`,
  snapshot.signals.length ===
    snapshot.screen.suppliers.filter((s) => s.eligible).length,
);

{
  const current = requirementsVersion(await loadRequirements());
  check(
    "snapshot was built against the current requirements",
    snapshot.requirementsVersion === current,
    `snapshot ${snapshot.requirementsVersion} vs current ${current} — run \`npm run build:snapshot\``,
  );
}

{
  const have = new Set(snapshot.citedChunks.map((c) => c.chunkId));
  const missing: string[] = [];
  for (const s of snapshot.screen.suppliers) {
    for (const v of s.verdicts) {
      if (v.citationChunkId && !have.has(v.citationChunkId)) {
        missing.push(`${s.supplierId}/${v.requirementId} → ${v.citationChunkId}`);
      }
    }
  }
  check(
    `every cited section is present, so no evidence panel renders empty (${have.size} sections)`,
    missing.length === 0,
    missing.slice(0, 5).join("\n        "),
  );
}

check(
  "the three required demo cases are present",
  snapshot.screen.suppliers.some((s) =>
    s.verdicts.some((v) => v.status === "conflicting"),
  ) &&
    snapshot.screen.suppliers.some((s) =>
      s.verdicts.some((v) => v.status === "insufficient-evidence"),
    ) &&
    snapshot.screen.suppliers.some((s) => s.eligible),
);

// -------------------------------------------------------- client/server line
section("B. CLIENT / SERVER BOUNDARY");

{
  const dir = path.join(root, "src", "components");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

  // Importing a package barrel would pull the filesystem-backed loaders into the
  // browser bundle. The build would fail eventually; this says why immediately.
  const forbidden = [
    "@/lib/ranking\"",
    "@/lib/ingestion\"",
    "@/lib/llm\"",
    "@/eval\"",
    "@/lib/eligibility\"",
  ];
  const offenders: string[] = [];
  for (const f of files) {
    const src = await readFile(path.join(dir, f), "utf8");
    const isClient = src.includes('"use client"');
    for (const bad of forbidden) {
      if (src.includes(`from ${bad}`)) {
        offenders.push(`${f} imports ${bad.replace(/"$/, "")}`);
      }
    }
    // Type-only imports are erased, so a client component may name a type from
    // a server module; a value import from one is the problem.
    if (isClient && /^import\s+\{[^}]*\}\s+from\s+"@\/lib\/(ingestion|llm|eval)\//m.test(src)) {
      offenders.push(`${f} takes a value import from a server-only module`);
    }
  }
  check(
    `no component imports a package barrel (${files.length} components checked)`,
    offenders.length === 0,
    offenders.join("\n        "),
  );
}

// ---------------------------------------------------------- determinism
section("C. INTERACTIVE RESULT MATCHES THE RECORDED ONE");

{
  const live = rankSuppliers(snapshot.signals, defaultWeights());
  const sameOrder =
    live.ranked.map((r) => r.supplierId).join("|") ===
    snapshot.baseline.ranked.map((r) => r.supplierId).join("|");
  const sameScores = live.ranked.every((r, i) =>
    Math.abs(r.totalScore - snapshot.baseline.ranked[i].totalScore) < 1e-9,
  );
  check("client-side ranking reproduces the snapshot ordering", sameOrder);
  check("client-side ranking reproduces the snapshot scores", sameScores);
  console.log(
    `        ${live.ranked.map((r) => `${r.supplierId.slice(0, 12)} ${r.totalScore.toFixed(3)}`).join("  ·  ")}`,
  );
}

// ---------------------------------------------------------- rendered output
section("D. RENDERED PAGE");

const res = await fetch("http://localhost:3000/").catch(() => null);
if (!res || !res.ok) {
  console.log(
    "  SKIP  dev server not reachable on :3000 — start it with `npm run dev` to run these checks",
  );
} else {
  const html = await res.text();

  check("safety boundary is stated on the page", html.includes("Decision support only"));
  check(
    "the recommended supplier is named",
    html.includes(snapshot.signals[0]?.supplierName ?? "___"),
  );
  check(
    "the counter-explanation panel is present",
    html.includes("Why this recommendation could be wrong"),
  );
  check("a contradictory verdict is shown", html.includes("CONF"));
  check("an undetermined verdict is shown", html.includes("N/A"));
  check(
    "the human-approval boundary is stated",
    html.includes("Where a person takes over"),
  );

  check(
    "no numeric confidence badge is rendered",
    !/\b\d{1,3}%\s*(confiden|certain)/i.test(html),
  );

  check(
    "no control implies contacting, approving or ordering",
    !/<button[^>]*>\s*(approve|contact|request quote|place order)/i.test(html),
  );
}

// ------------------------------------------------- the confidence omission
section("E. THE CONFIDENCE SIGNAL IS COLLECTED BUT NOT DISPLAYED");

{
  // Testing the rendered HTML is the wrong instrument here: the verdicts are
  // serialised into the page as component props, so `modelConfidence` appears
  // in the payload whether or not anything draws it. The snapshot is the record
  // of what was measured and should keep the field; the question is only
  // whether the interface presents it. So this checks the components.
  const dir = path.join(root, "src", "components");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".tsx"));
  const offenders: string[] = [];

  for (const f of files) {
    const src = await readFile(path.join(dir, f), "utf8");
    // Strip comments and JS strings so prose *about* confidence does not count.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    if (/\.modelConfidence\b/.test(code)) offenders.push(f);
  }

  check(
    `no component renders the model's self-reported confidence (${files.length} checked)`,
    offenders.length === 0,
    offenders.join(", ") +
      " — measured on this corpus, 6 of 8 verdicts the system declined to decide were self-reported as high confidence, so the signal must not be presented as reliability",
  );

  const stillCollected = snapshot.screen.suppliers.every((s) =>
    s.verdicts.every((v) => typeof v.modelConfidence === "string"),
  );
  check(
    "the signal is still recorded, so its unreliability stays measurable",
    stillCollected,
  );
}

section(`SUMMARY — ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("\nInterface checks passed.\n");
