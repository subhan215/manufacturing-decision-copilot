/**
 * Submission readiness.
 *
 *   node scripts/check-submission.ts
 *
 * Asserts what a reviewer will actually encounter when they clone this
 * repository, rather than trusting a checklist. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/paths.ts";
import { loadSnapshot } from "../src/lib/snapshot.ts";
import {
  loadRequirements,
  requirementsVersion,
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

const root = resolveProjectRoot();

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- repository
section("A. REPOSITORY");

const isRepo = git(["rev-parse", "--is-inside-work-tree"]) === "true";
check(
  "the project is a git repository",
  isRepo,
  "Sofstica requires a public GitHub repository containing the complete source",
);

if (isRepo) {
  const commits = git(["rev-list", "--count", "HEAD"]);
  check(
    `the repository has at least one commit (${commits ?? "0"})`,
    Number(commits ?? 0) >= 1,
  );

  const tracked = git(["ls-files"])?.split("\n").filter(Boolean) ?? [];
  check(
    `tracked files exclude node_modules and build output (${tracked.length} tracked)`,
    !tracked.some(
      (f) =>
        f.startsWith("node_modules/") ||
        f.startsWith(".next/") ||
        f.endsWith(".tsbuildinfo"),
    ),
  );

  check(
    "no real environment file is tracked (only the example)",
    !tracked.some((f) => /^\.env($|\.local$|\.production$)/.test(f)),
  );

  const cached = tracked.filter((f) => f.startsWith(".cache/llm/"));
  check(
    `the model response cache is tracked (${cached.length} entries)`,
    cached.length >= 20,
    "without it, a reviewer cannot reproduce any reported figure without their own Claude Code login",
  );

  const dirty = git(["status", "--porcelain"]);
  check(
    "the working tree is clean",
    dirty === "",
    dirty ? dirty.split("\n").slice(0, 6).join("\n        ") : undefined,
  );
}

// -------------------------------------------------------------- line endings
section("B. LINE ENDINGS");

check(".gitattributes exists", existsSync(path.join(root, ".gitattributes")));

{
  const attrs = existsSync(path.join(root, ".gitattributes"))
    ? await readFile(path.join(root, ".gitattributes"), "utf8")
    : "";
  check(
    ".gitattributes forces LF on checkout",
    /^\*\s+text=auto\s+eol=lf/m.test(attrs),
    "citations are verified by character offset; a CRLF checkout shifts every offset after line 1",
  );
}

{
  // Checked on disk as well as declared, because the declaration only takes
  // effect on a fresh checkout.
  const dirs = [
    path.join(root, "data"),
    path.join(root, "data", "supplier-profiles"),
    path.join(root, "data", "paraphrased"),
  ];
  const offenders: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      const p = path.join(dir, name);
      if (!(await stat(p)).isFile() || !name.endsWith(".md")) continue;
      if ((await readFile(p, "utf8")).includes("\r")) offenders.push(name);
    }
  }
  check(
    "every corpus document is LF on disk",
    offenders.length === 0,
    offenders.join(", "),
  );
}

// ----------------------------------------------------------------- artifacts
section("C. REQUIRED ARTIFACTS");

const required = [
  "data/DATA_MANIFEST.md",
  "data/product-brief.md",
  "data/derived/requirements.json",
  "data/derived/gold-labels.json",
  "data/derived/reference-values.json",
  "data/derived/ui-snapshot.json",
  "eval-results/results.json",
  "eval-results/scorecard.md",
  "docs/INTENDED_USE.md",
  ".cache/README.md",
];

for (const rel of required) {
  const p = path.join(root, rel);
  const present = existsSync(p);
  const size = present ? (await stat(p)).size : 0;
  check(`${rel} present and non-empty`, present && size > 200);
}

// ------------------------------------------------------ required deliverable
section("D. INTENDED-USE STATEMENT");

{
  const doc = existsSync(path.join(root, "docs/INTENDED_USE.md"))
    ? await readFile(path.join(root, "docs/INTENDED_USE.md"), "utf8")
    : "";

  check(
    "names an intended user",
    /intended user/i.test(doc) && /sourcing or product analyst/i.test(doc),
  );
  check(
    "states what the system does not do",
    /does not contact suppliers/i.test(doc),
  );
  check(
    "states where a person takes over",
    /where a person takes over/i.test(doc),
  );
  check("lists the assumptions", /assumptions we introduced/i.test(doc));
  check(
    "lists what the evaluation does not establish",
    /does not establish/i.test(doc),
  );
  check(
    "argues the confidence deviation rather than leaving it unexplained",
    /deliberate deviations/i.test(doc) &&
      /do not display the model's confidence/i.test(doc),
    "the brief asks for confidence to be displayed; omitting it silently reads as non-compliance",
  );
  check(
    "states that the corpus and gold labels are self-constructed",
    /corpus and the gold labels are ours/i.test(doc),
  );
}

// ------------------------------------------------------------------ currency
section("E. ARTIFACTS ARE CURRENT");

{
  const snapshot = await loadSnapshot();
  const current = requirementsVersion(await loadRequirements());
  check(
    "the interface snapshot matches the frozen requirements",
    snapshot.requirementsVersion === current,
    `snapshot ${snapshot.requirementsVersion} vs current ${current} — run \`npm run build:snapshot\``,
  );

  const bundle = JSON.parse(
    await readFile(path.join(root, "eval-results/results.json"), "utf8"),
  ) as { verdicts: unknown[]; requirementsVersion: string };
  check(
    "the evaluation bundle matches the frozen requirements",
    bundle.requirementsVersion === current,
  );
  check(
    `the evaluation bundle carries all 91 verdicts (${bundle.verdicts.length})`,
    bundle.verdicts.length === 91,
  );
}

section(`SUMMARY — ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log(
  "\nSubmission artifacts are in place.\n" +
    "Still to do by hand: create the GitHub remote and push; then clone to a fresh\n" +
    "directory and run `npm install && npm run screen` there with no Claude Code\n" +
    "available — that is what a reviewer will do.\n",
);
