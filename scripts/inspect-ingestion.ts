/**
 * Ingestion inspection / smoke test.
 *
 *   node scripts/inspect-ingestion.ts
 *
 * Prints the chunk inventory and the leakage audit, and asserts the invariants
 * that everything downstream depends on. Exits non-zero on any failure, so it
 * doubles as a regression check.
 */
import {
  buildAudit,
  chunkDocument,
  buildLineStarts,
  countNonWhitespace,
  detectHeadings,
  estimateTokens,
  getCorpus,
  normalizeText,
  resolveCitation,
  scanLeakage,
  assertNoHardLeakage,
} from "../src/lib/ingestion/index.ts";
import type { Corpus, IngestedDocument } from "../src/lib/ingestion/index.ts";

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(74)}\n${title}\n${"=".repeat(74)}`);
}

const EXPECTED_SUPPLIER_SLUGS = [
  "certifications",
  "manufacturing-capability",
  "order-terms",
  "quality-history",
  "sustainability",
  "cost-reference",
];

const corpus: Corpus = await getCorpus({ force: true });
const all: IngestedDocument[] = [corpus.brief, ...corpus.suppliers];

// ---------------------------------------------------------------- inventory
section("INVENTORY");
for (const d of all) {
  const slugs = d.chunks.map((c) => c.headingSlug).join(", ");
  console.log(
    `\n${d.doc.docId}  [${d.doc.kind}]  sha256=${d.doc.sha256.slice(0, 12)}…`,
  );
  console.log(
    `  retained=${d.chunks.length}  excluded=${d.excluded.length}  ~tokens=${estimateTokens(
      d.chunks.map((c) => c.text).join("\n"),
    )}`,
  );
  console.log(`  slugs: ${slugs}`);
}

// ------------------------------------------------------- A. structural
section("A. STRUCTURAL INVARIANTS");

check("14 documents discovered (1 brief + 13 supplier profiles)", all.length === 14,
  `got ${all.length}`);
check("13 supplier profiles", corpus.suppliers.length === 13,
  `got ${corpus.suppliers.length}`);
check(
  "DATA_MANIFEST.md and raw/ are absent from the corpus",
  all.every((d) => !/DATA_MANIFEST|raw\//i.test(d.doc.relPath)),
);
check(
  "no retained chunk contains the answer-key table heading",
  all.every((d) =>
    d.chunks.every((c) => !/case-to-requirement/i.test(c.text)),
  ),
);

{
  let offsetOk = true;
  let orderOk = true;
  let coverageOk = true;
  const details: string[] = [];

  for (const d of all) {
    const every = [...d.chunks, ...d.excluded.map((e) => e.chunk)].sort(
      (a, b) => a.seq - b.seq,
    );
    for (const c of every) {
      if (d.doc.text.slice(c.start, c.end) !== c.text) {
        offsetOk = false;
        details.push(`${c.chunkId}: slice(start,end) !== text`);
      }
    }
    for (let i = 1; i < every.length; i++) {
      if (every[i].start < every[i - 1].end) {
        orderOk = false;
        details.push(`${every[i].chunkId} overlaps ${every[i - 1].chunkId}`);
      }
    }
    const covered = every.reduce((n, c) => n + countNonWhitespace(c.text), 0);
    const total = countNonWhitespace(d.doc.text);
    if (covered !== total) {
      coverageOk = false;
      details.push(`${d.doc.docId}: covered ${covered}/${total} non-ws chars`);
    }
  }

  check("offset round-trip holds for every chunk", offsetOk, details.slice(0, 5).join("\n        "));
  check("chunks are non-overlapping and seq-ordered", orderOk);
  check("coverage = 1.0 over non-whitespace characters", coverageOk,
    details.filter((d) => d.includes("covered")).join("\n        "));
}

check(
  "chunk ids are globally unique",
  corpus.byChunkId.size ===
    all.reduce((n, d) => n + d.chunks.length + d.excluded.length, 0),
);

// ------------------------------------------------- B. slug normalization
section("B. SLUG NORMALIZATION");

for (const slug of EXPECTED_SUPPLIER_SLUGS) {
  const count = corpus.suppliers.filter((d) =>
    d.chunks.some((c) => c.headingSlug === slug),
  ).length;
  check(
    `"${slug}" present in exactly 13 supplier profiles`,
    count === 13,
    `got ${count} — heading normalization (e.g. the "n=NN" suffix) is broken`,
  );
}

check(
  "every supplier profile has a title-block chunk",
  corpus.suppliers.every((d) =>
    d.chunks.some((c) => c.role === "title-block"),
  ),
);

{
  const detectors = all.flatMap((d) =>
    detectHeadings(d.doc.text.split("\n")).map((h) => h.detector),
  );
  const pdfHeuristics = detectors.filter(
    (x) => x === "bold-line" || x === "caps-line",
  ).length;
  check(
    "PDF-only heading heuristics fired 0 times on this Markdown corpus",
    pdfHeuristics === 0,
    `fired ${pdfHeuristics} times — the key:value rejection filter is leaking`,
  );
}

// ------------------------------------------------------- C. leakage audit
section("C. LEAKAGE AUDIT");

const audit = buildAudit(corpus);
console.log(
  `\n  ${"doc".padEnd(46)} ${"rule".padEnd(22)} chars  excerpt`,
);
for (const e of audit.exclusions) {
  console.log(
    `  ${e.chunkId.padEnd(46).slice(0, 46)} ${e.ruleId.padEnd(22)} ${String(e.chars).padStart(5)}  ${e.excerpt.slice(0, 60)}…`,
  );
}
console.log(
  `\n  totals: ${audit.totals.retainedChunks} retained, ${audit.totals.excludedChunks} excluded, ~${audit.totals.estimatedTokens} estimated tokens`,
);

{
  const trailers = audit.exclusions.filter((e) => e.ruleId === "trailer-region");
  check("13 trailer regions excluded (one per supplier profile)",
    trailers.length === 13, `got ${trailers.length}`);
  check(
    "no trailer excluded from the product brief (its |---| table rows are not rules)",
    !trailers.some((e) => e.docId === "product-brief"),
  );
}

check(
  "product brief retains its title block and all requirement sections",
  corpus.brief.chunks.some((c) => c.role === "title-block") &&
    corpus.brief.chunks.some((c) => c.headingSlug === "mandatory-requirements") &&
    corpus.brief.chunks.some((c) => c.headingSlug === "ranking-priorities"),
  "meta-commentary in the brief must not cost us the requirements themselves",
);

check(
  "the only exclusions are trailer regions (no content chunk was quarantined)",
  audit.exclusions.every((e) => e.ruleId === "trailer-region"),
  audit.exclusions
    .filter((e) => e.ruleId !== "trailer-region")
    .map((e) => `${e.chunkId} [${e.ruleId}] ${e.excerpt.slice(0, 60)}`)
    .join("\n        "),
);

{
  let hardHits = 0;
  for (const d of all) {
    for (const c of d.chunks) {
      hardHits += scanLeakage(c.text, d.doc.kind).filter(
        (h) => h.rule.severity === "hard",
      ).length;
    }
  }
  check("zero hard leakage hits across all retained chunks", hardHits === 0,
    `found ${hardHits}`);
}

try {
  assertNoHardLeakage(corpus);
  check("assertNoHardLeakage() passes", true);
} catch (err) {
  check("assertNoHardLeakage() passes", false, String(err));
}

if (audit.warnings.length > 0) {
  console.log("\n  soft warnings (retained, flagged for human review):");
  for (const w of audit.warnings) {
    console.log(`    ${w.chunkId}  [${w.ruleId}]  ${JSON.stringify(w.matchedText)}`);
  }
}

// ------------------------------------------ D. supplier-03 conflict case
section("D. AMBIGUOUS CASE — supplier-03 conflicting certifications");

{
  const d = corpus.suppliers.find((s) => s.doc.docId === "supplier-03")!;
  const certs = d.chunks.find((c) => c.headingSlug === "certifications");
  check("supplier-03 certifications chunk exists", certs !== undefined);
  if (certs) {
    const hasCurrent = /holds current ISO 22716/i.test(certs.text);
    const hasExpired = /expired 2025-11-01/i.test(certs.text);
    check(
      "both contradictory statements land in ONE chunk",
      hasCurrent && hasExpired,
      "if these are split, the model sees only one side and reports a confident (wrong) verdict",
    );
    console.log(`\n  ${certs.chunkId}  lines ${certs.startLine}-${certs.endLine}`);
    console.log(
      certs.text
        .split("\n")
        .map((l) => `    | ${l}`)
        .join("\n"),
    );
  }
}

// -------------------------------------- E. supplier-13 abstention case
section("E. FALLBACK CASE — supplier-13 missing data");

{
  const d = corpus.suppliers.find((s) =>
    s.doc.docId.startsWith("supplier-13"),
  )!;
  for (const slug of EXPECTED_SUPPLIER_SLUGS) {
    const c = d.chunks.find((x) => x.headingSlug === slug);
    check(`supplier-13 "${slug}" section is present and non-empty`,
      c !== undefined && c.text.trim().length > 0);
  }
  const joined = d.chunks.map((c) => c.text).join("\n");
  check(
    "absence is explicitly stated (citable), not merely missing",
    /not provided|not stated|No audited production batch records|Not addressed/i.test(
      joined,
    ),
    "abstention needs positive evidence of absence, or the model is pushed toward guessing",
  );
}

// ----------------------------------------- F. supplier-08 location case
section("F. LOCATION EVIDENCE — supplier-08");

{
  const d = corpus.suppliers.find((s) =>
    s.doc.docId.startsWith("supplier-08"),
  )!;
  const title = d.chunks.find((c) => c.role === "title-block");
  check(
    "title-block carries the facility location (Vietnam)",
    title !== undefined && /Ho Chi Minh City, Vietnam/i.test(title.text),
    "this is the evidence the India-facility requirement is judged on",
  );
  if (title) {
    console.log(`\n  ${title.chunkId}`);
    console.log(
      title.text
        .split("\n")
        .map((l) => `    | ${l}`)
        .join("\n"),
    );
  }
}

// ---------------------------------------------------- G. fallback path
section("G. FALLBACK PATH — heading-less document (PDF-dump simulation)");

{
  const source = corpus.suppliers.find((s) =>
    s.doc.docId.startsWith("supplier-06"),
  )!;
  const stripped = normalizeText(
    source.doc.text.replace(/^#{1,6}\s+/gm, ""),
  ).text;
  const lineStarts = buildLineStarts(stripped);
  const headings = detectHeadings(stripped.split("\n"));
  const chunks = chunkDocument("synthetic-pdf-dump", stripped, lineStarts);

  check("stripping headings leaves fewer than 2 detectable headings",
    headings.length < 2, `detected ${headings.length}`);
  check("fallback produced multiple body chunks",
    chunks.filter((c) => c.role === "body").length >= 2,
    `got ${chunks.filter((c) => c.role === "body").length}`);
  check(
    "offset invariant still holds on the fallback path",
    chunks.every((c) => stripped.slice(c.start, c.end) === c.text),
  );
  check(
    "coverage still 1.0 on the fallback path",
    chunks.reduce((n, c) => n + countNonWhitespace(c.text), 0) ===
      countNonWhitespace(stripped),
  );
}

// ------------------------------------------------- H. citation round-trip
section("H. CITATION VERIFICATION");

{
  const s13 = corpus.suppliers.find((s) =>
    s.doc.docId.startsWith("supplier-13"),
  )!;
  const order = s13.chunks.find((c) => c.headingSlug === "order-terms")!;

  const exactQuote = order.text.split("\n").find((l) => l.includes("not stated"))!.trim();
  const exact = resolveCitation({ chunkId: order.chunkId, quote: exactQuote }, corpus);
  check(`exact quote resolves as "exact" (got "${exact.status}")`,
    exact.status === "exact" && exact.isVerified);
  console.log(`    locator: ${exact.locator}`);

  const markdownStripped = exactQuote.replace(/\*\*/g, "").replace(/\s+/g, " ");
  const normalized = resolveCitation(
    { chunkId: order.chunkId, quote: markdownStripped },
    corpus,
  );
  check(
    `markdown-stripped quote resolves as "normalized" (got "${normalized.status}")`,
    normalized.isVerified,
    "without this, correct model citations would be scored as failures",
  );
  check(
    "normalized match still points at the raw span",
    normalized.start !== null &&
      normalized.end !== null &&
      s13.doc.text
        .slice(normalized.start, normalized.end)
        .includes("not stated"),
  );

  const s03 = corpus.suppliers.find((s) => s.doc.docId === "supplier-03")!;
  const s04 = corpus.suppliers.find((s) => s.doc.docId === "supplier-04")!;
  const misattributed = resolveCitation(
    {
      chunkId: s04.chunks.find((c) => c.headingSlug === "certifications")!.chunkId,
      quote: "expired 2025-11-01",
    },
    corpus,
  );
  check(
    `quote from supplier-03 attributed to supplier-04 resolves as "wrong-doc" (got "${misattributed.status}")`,
    misattributed.status === "wrong-doc",
  );
  void s03;

  const fabricated = resolveCitation(
    {
      chunkId: order.chunkId,
      quote: "ISO 22716 certificate valid until 2029",
    },
    corpus,
  );
  check(
    `fabricated quote resolves as "not-found" and is flagged hallucinated (got "${fabricated.status}")`,
    fabricated.status === "not-found" && fabricated.isHallucinated,
  );

  const unknown = resolveCitation(
    { chunkId: "supplier-99#s00-nope", quote: "anything" },
    corpus,
  );
  check("unknown chunk id resolves as \"unknown-chunk\"",
    unknown.status === "unknown-chunk" && unknown.isHallucinated);
}

// ------------------------------------------------------- I. token budget
section("I. TOKEN BUDGET (estimated)");

{
  const max = Math.max(...audit.documents.map((d) => d.estimatedTokens));
  console.log(`  total across corpus : ~${audit.totals.estimatedTokens} tokens`);
  console.log(`  largest document    : ~${max} tokens`);
  console.log(
    "\n  Whole-corpus prompting is viable at this size; chunking here serves\n" +
      "  citation granularity and leakage quarantine, not context management.",
  );
}

// --------------------------------------------------------------- summary
section(`SUMMARY — ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("\nAll ingestion invariants hold.\n");
