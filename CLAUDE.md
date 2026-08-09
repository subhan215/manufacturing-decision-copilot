# Project Context — AI Manufacturing Decision Copilot

@AGENTS.md

Living context file for this repo. Read this first in any new session before doing anything else.

## What this is

Submission for **Sofstica Hackathon 2026** (SGTDP, 48-hour event). Full submission rules and rubric live in the sibling folder `../Themes for Hackathon 2026/` (theme PDFs + `SUBMISSION_CHECKLIST.md` — keep both in sync with progress here).

- **Theme:** AI Manufacturing Decision Copilot
- **Track:** Track 1 — Supplier Shortlisting
- **Why this theme/track:** chosen deliberately for AI-engineering learning value (LLM/RAG/agent skills, currently the most in-demand "AI engineer" skillset per market research) and because Track 1 is the most demo-tractable of the three tracks in a 48-hour window.

## Track 1 requirements (recap)

Build an eligibility screen + ranking system for suppliers against a product's mandatory requirements. Minimum evidence required:
1. Transparent eligibility screen (pass/fail per constraint, per supplier) shown *before* ranking.
2. Source citations for every material supplier claim.
3. Sensitivity analysis — show how the ranking changes when priority weights change.

Plus challenge-wide deliverables: architecture/data-flow explanation, data/source manifest, baseline comparison + quantitative eval, 3 demo cases (successful / ambiguous-conflicting / failure-fallback), intended-user statement + assumptions/limitations/human-approval points, safety rules (no autonomous supplier contact/approval/ordering).

## Tech stack decisions

- **Node/TypeScript + Next.js** — user's strong preference (JS/TS background, not Python/FastAPI, despite past FastAPI job experience). Do not suggest Python for this project.
- **No LangChain.** Deliberate choice: raw SDK, hand-build RAG / tool-use / agentic orchestration / evaluation, for learning value and to avoid framework-debugging risk under hackathon time pressure.
- **LLM: Anthropic Claude via `@anthropic-ai/claude-agent-sdk`** (Agent SDK), driving the user's **local Claude Code CLI** — billed under their existing Claude subscription, **not** a paid Anthropic API key (budget constraint: no money for API credits).
  - Requires Claude Code CLI installed + authenticated on whatever machine runs the app. **Must be disclosed plainly in the README** as a stated dependency (same as "requires Docker").
  - Reproducibility-for-judges risk is mitigated by submitting a **recorded demo video** instead of requiring a live hosted app or judges running it themselves (satisfies the Sofstica "Project Links" requirement, which accepts video/slides in lieu of a live app).
  - Explicitly ruled out: extracting/reusing Claude Code's OAuth token to call the raw Anthropic API directly. That's a ToS violation regardless of who writes the code that does it — rejected for this project, full stop.
  - Revisit only if free Anthropic API trial credit becomes available/preferable.

## Data layer (in `data/`) — DONE

- `data/raw/supply_chain_data.csv` — real Kaggle dataset ("Supply Chain Dataset" by amirmotefaker), 100 rows, 5 real suppliers, frozen copy, retrieved 2026-08-08.
- `data/product-brief.md` — fictional product ("Botanical Renewal Vitamin C Face Serum," fictional brand "SkinLumen Cosmetics") with 7 mandatory requirements (MR-1..MR-7: liquid-formulation capability, ISO 22716 cert, MOQ ≤5000, fail-rate ≤30%, lead time ≤20 days, India-based facility, cruelty-free declaration) and ranking-priority weights (cost 35%, lead time 25%, quality 25%, sustainability 15%).
- `data/supplier-profiles/` — **13 supplier documents** in Markdown (deliberately Markdown, not PDF — brief doesn't mandate a format, see rationale below):
  - `supplier-01.md`..`supplier-05.md` — real CSV-derived suppliers, stats aggregated from CSV + synthetic certs/MOQ/sustainability layered on top.
  - `supplier-03.md` — **the required ambiguous/conflicting case**: two sections of its own document disagree on certification status.
  - `supplier-06`..`supplier-12` — fully synthetic, each engineered to fail exactly one mandatory requirement (capability / location / MOQ / lead time / certification-vs-marketing-claim), plus one clean pass (06) and one narrowly-passes-everything borderline case (12).
  - `supplier-13-novaline-personal-care.md` — **the required failure/fallback case**: missing data for MR-2 through MR-5 entirely; system must abstain, not guess.
- `data/DATA_MANIFEST.md` — full source disclosure, transformation log, and case-to-requirement mapping table.

**Important note on file format:** supplier profiles are Markdown for authoring convenience and to embed ambiguity naturally in prose. The brief does NOT require PDF — it only specifies content (profiles, quotations, evidence), not format. However: **build the ingestion/extraction logic to treat documents as raw text, not as Markdown-structured data** (don't hard-parse `##` headers as a schema). Real challenge packs and any judge-supplied held-out cases will likely be PDFs/Word docs; the pipeline needs to be format-agnostic so swapping in real files later doesn't require rework.

## Piece 1 — Next.js scaffold — DONE

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4. `package.json` has `"type": "module"`; `tsconfig` has `allowImportingTsExtensions: true`. Relative imports inside `src/lib/**` use explicit `.ts` extensions so the same modules run under both Turbopack and plain `node` (Node 24 strips types natively). Scripts in `scripts/` import `src/lib/**/index.ts` directly; app code should import `server.ts` variants instead.

## Piece 2 — Document ingestion — DONE

`src/lib/ingestion/`: `types.ts`, `text.ts`, `headings.ts`, `chunker.ts`, `leakage.ts`, `loader.ts`, `citation.ts`, `index.ts` (plain entry), `server.ts` (`server-only`-guarded entry for app code).

Verify with `npm run inspect:ingestion` — 42 assertions, exits non-zero on failure. Current state: 14 documents, 98 retained chunks, 13 excluded (trailer regions), ~4.7k estimated tokens total.

Key facts to know before touching downstream pieces:

- **Offsets are UTF-16 indices into `SourceDocument.text` (the NORMALIZED text), never into bytes on disk.** Normalization order is BOM → CRLF→LF → NFC, applied *before* offsets/hash are computed. The invariant `doc.text.slice(c.start, c.end) === c.text` is asserted for every chunk and is what makes citation verification trustworthy.
- **Chunking here is for citation granularity and leakage quarantine, NOT context management.** The whole corpus is ~4.7k tokens, far under any context limit. **Piece 3 should send whole documents per prompt — no embeddings, no vector store, no similarity search.** Chunks exist so a claim can cite `supplier-03#s01-certifications`.
- **Zero chunk overlap, deliberately** — overlap would make a sentence citable under two chunk IDs and corrupt attribution. This is the opposite of standard RAG advice, because our objective is attribution rather than recall.
- **Leakage control is structural, not conventional.** Discovery uses an explicit allowlist (`data/product-brief.md` + `data/supplier-profiles/*`), so `data/DATA_MANIFEST.md` — which contains the case-to-requirement answer key — is unreachable, not merely filtered. `ExcludedChunk` is a *different type* from `DocumentChunk`, so quarantined text cannot be passed to a prompt builder even by accident. `assertNoHardLeakage(corpus)` throws. Leakage rules are document-kind-scoped: `MR-\d` is a hard violation in a supplier profile but legitimate in the product brief, which is where MR-1..MR-7 are defined.
- **Citation verification is mechanical, not probabilistic.** `resolveCitation()` returns `exact | normalized | wrong-chunk | wrong-doc | unknown-chunk | not-found`, with `isVerified` (exact|normalized) and `isHallucinated` (unknown-chunk|not-found) materialized so the eval harness just counts booleans. `normalizeForMatch()` keeps an index map back to raw offsets — without it, a model quoting `not stated.` instead of `**not stated.**` would be scored as a hallucination and we would report a large fictitious error rate.
- **The three demo cases are protected by assertions**: supplier-03's two contradictory certification statements must land in ONE chunk (split = the ambiguous case dies silently); supplier-13's "not stated" markers must survive (abstention needs positive evidence of absence); supplier-08's title block must carry "Ho Chi Minh City, Vietnam" (the location evidence the India requirement is judged on).
- Data files were sanitized to remove authoring notes that stated expected verdicts. Recorded in `data/DATA_MANIFEST.md` §4 as a transformation-log entry.

## Piece 3 — LLM client layer — DONE

`src/lib/llm/`: `types.ts`, `config.ts`, `prompt.ts`, `cache.ts`, `preflight.ts`, `client.ts`, `index.ts`, `server.ts`. Shared root resolution moved to `src/lib/paths.ts` (ingestion now uses it too).

Verify with `npm run probe:llm` — 12 assertions against live Claude Code calls. Run twice; the second must report cache hits.

Everything goes through **one** function:

```ts
askStructured({ prompt, schema, schemaName, systemPrompt?, model?, timeoutMs?, cache? })
  -> { data: T, telemetry: {...} }
```

Non-obvious things that are load-bearing:

- **`z.toJSONSchema(schema, { target: "draft-7" })` is mandatory.** The SDK validates against draft-07 and rejects newer dialects; Zod emits 2020-12 by default. Omitting `target` fails the run at startup. Use `toSdkSchema()` — never call `z.toJSONSchema` directly.
- **Success is a three-part test**, not just `subtype === "success"`: subtype **and** `structured_output` present **and** Zod validates. A run can report success with no structured output at all (documented, and the shape of [issue #277](https://github.com/anthropics/claude-agent-sdk-typescript/issues/277)). That case throws `LlmNoStructuredOutputError` with the raw text attached, because its fix is "flatten the schema", not "retry".
- **`query()` throws *after* yielding an error result**, so the iteration is wrapped in try/catch and a result may already be captured when the catch fires. Connection/process failures yield no result message at all.
- **Isolation in `config.ts` ISOLATION is a security control, not tuning.** `tools: []` (NOT `allowedTools`, which only controls auto-approval) removes all built-in tools — without it the model could `Read` `data/DATA_MANIFEST.md` and every ingestion-level leakage control is void. `settingSources: []` stops it loading this repo's own CLAUDE.md, which documents expected outcomes. `maxTurns: 1`, `permissionMode: "dontAsk"`. Never pass `env` (it REPLACES the subprocess environment rather than merging).
- **Prompt injection**: `fenceUntrusted()` wraps document text and neutralizes delimiter-like sequences so a document cannot close its own fence. But the real mitigation is `tools: []` — a successful injection has no capability to reach. State it that way in the safety writeup; do not claim wording defeats injection.
- **Model is pinned** (`claude-sonnet-5`, override `MDC_MODEL`) for reproducibility, and recorded on every result.
- **Cache** is content-addressed at `.cache/llm/` (git-ignored), keyed by model+system+prompt+schema. Cache hits re-validate against the schema and report *actual* elapsed time (~1ms), not the original call's duration — replaying that would inflate any completion-time figure we report. Disable with `MDC_NO_LLM_CACHE=1`. Option worth revisiting at submission: commit a frozen cache so judges can reproduce scores with no Claude Code login.
- **Node strip-only mode forbids constructor parameter properties** (`constructor(readonly x: T)`). Error classes use explicit field declarations. This bites at runtime, not at typecheck.

Empirically confirmed by the probe: the piece-4-shaped schema (root → array of 7 flat verdict objects) round-trips fine *with* `additionalProperties: false` present, so `stripAdditionalProperties` stays off by default. First call ~7s, cached ~1ms.

## Piece 4 — Eligibility screening engine — DONE

`src/lib/eligibility/`: `types.ts`, `requirements.ts`, `prompt.ts`, `evaluate.ts`, `verify.ts`, `screen.ts`, `index.ts`, `server.ts`. Scripts: `npm run extract:requirements`, `npm run screen` (21 assertions).

Current result: 13 suppliers × 7 requirements = 91 verdicts. **65 decided in code, 26 by model judgement. 91/91 citations verified, 0 unverified.** Eligible: supplier-01, supplier-06, supplier-12. Full run ~168s live, ~0s cached.

**The central architectural decision — the model reads, the code decides.** Published measurements put LLM numeric-comparison error near 16.9%, dropping to ~0.7% when the comparison is deterministic. So the model extracts *evidence* (values, dates, categories, quotes) and `evaluate.ts` derives the verdict. Requirements carry a `kind`:
- `numeric-threshold` (MR-3/4/5) → code does `value ≤ threshold`
- `certification` (MR-2) → code compares expiry against `asOfDate`
- `categorical-match` (MR-6) → code does the string match
- `qualitative` (MR-1/7) → genuinely needs judgement, model decides

Every deterministic verdict carries a `comparison` string (`"5000 units ≤ 5000 units"`) so the arithmetic is showable rather than trusted. supplier-12 passes all five thresholds *narrowly* — that case exists specifically to catch a sloppy comparison.

Other things that matter downstream:

- **`asOfDate` (default `2026-08-09`) is passed into every prompt and compared in code.** We override `systemPrompt`, which replaces the Claude Code preset, so the model cannot be assumed to know today's date. The prompt explicitly tells it *not* to decide whether dates have passed — only to report them.
- **Citation verification can override the model** (`verify.ts`): `exact`/`normalized` accept; `wrong-chunk` accepts and re-points; `wrong-doc` and `not-found` force `insufficient-evidence` with `citationUnverified: true`. `modelClaimedStatus` preserves the pre-downgrade verdict so `stats.downgradedByVerification` is computable — currently 0.
- **Four statuses**: `pass` / `fail` / `insufficient-evidence` / `conflicting`. `conflicting` exists so supplier-03's contradictory certification statements are surfaced, never resolved.
- **Absence of evidence ≠ evidence of absence.** A missing certificate record yields `insufficient-evidence`, not `fail` — the supplier may hold it and simply not have supplied it. Only a *marketing claim* offered in place of a certificate is a `fail`, because there we have positive evidence that what was offered is not a certificate. Both still block eligibility; the distinction tells a reviewer whether to go and ask.
- **`modelConfidence` is captured but deliberately NOT surfaced as decision support** — verbalized LLM confidence is driven by an internal mechanism that responds largely independently of correctness. Piece 7 should measure its miscalibration rather than display it.
- **Concurrency is 2, with exponential backoff** on rate-limit/529 errors. Parallel Claude Code sessions hard-fail past ~3–4 in flight with no built-in retry. The cache makes a partial failure resume rather than restart.
- **Requirements are AI-extracted then frozen** to `data/derived/requirements.json` (committed, human-reviewed — this is the human-approval artifact). `data/derived/` is outside ingestion's allowlist so it can never re-enter the corpus. `requirementsVersion` is stamped on every screen to catch a stale run after a brief edit.

Emergent behaviour worth keeping: supplier-02's MR-4 comes back `conflicting` rather than `fail` — the model spotted that with 41% of batches still "pending re-inspection", the fail-rate denominator is genuinely ambiguous (8/22 vs 8/13). Not engineered by us; defensible.

## Piece 5 — Ranking & sensitivity analysis — DONE

`src/lib/ranking/`: `types.ts`, `signals.ts`, `normalize.ts`, `score.ts`, `sensitivity.ts`, `report.ts`, `index.ts`, `server.ts`. Run `npm run rank` (20 assertions).

Result: 3 eligible suppliers ranked. **supplier-01 wins by default (0.715 vs 0.450 vs 0.256)**, wins 56.1% of 10,000 random weightings; supplier-06 wins 43.9%; **supplier-12 wins 0%** — it is Pareto-dominated.

- **Reuses the screen's verified numbers.** Lead time and fail rate come from the MR-5/MR-4 verdicts rather than being re-extracted, so the ranking can never disagree with the eligibility screen about the same supplier. Only cost and sustainability need a new call (3 calls total). An assertion compares both views and fails if they diverge.
- **Sustainability is scored, not judged**: model extracts `crueltyFreeDeclaration` + `thirdPartyCertifications[]`, code counts points (1 + one per certification). Same read/decide split as piece 4.
- **Min-max normalization**, direction flip handled once in `normalize.ts` — putting it in the scorer instead would make an inverted criterion easy to introduce and nearly invisible, since the output still looks like a plausible ranking. Degenerate (zero-spread) criteria get 0.5 for everyone and are reported rather than dividing by zero.
- **Three-tier sensitivity**, matching the one-way / multi-way / probabilistic framework in the MCDA literature:
  1. five named scenarios;
  2. **weight stability intervals** — sweep each weight 0→100% at 0.5% resolution and report the range where the winner holds plus the crossover point (e.g. *supplier-01 wins on quality weight 0–49.5%; supplier-06 takes over at 50%*). The literature explicitly calls scenario analysis **alone** the weak prior approach, so tier 2 is what makes this credible;
  3. **Monte Carlo** — 10,000 weight vectors sampled uniformly from the simplex via normalized exponentials (flat Dirichlet; naively normalizing uniforms would bias toward the centre). **Seeded mulberry32, never `Math.random()`**, so a reviewer reproduces the exact numbers.
- **Pareto dominance is computed separately from scores** and is a stronger claim than any ranking: a dominated supplier cannot win under *any* weights. Doubles as a falsifiable check — if supplier-12 ever wins a single Monte Carlo draw, dominance or scoring is broken.
- **The compensatory critique of weighted-sum is answered by the architecture**: hard requirements are enforced non-compensatorily in piece 4 *before* scoring, so no soft score can offset a missing certificate. Asserted mechanically (no ineligible supplier may appear in the ranking under any weighting).
- **Conditionally-eligible tier**: supplier-13 is blocked only by `insufficient-evidence`, so it is listed with the specific documents to request rather than silently dropped — and deliberately **not ranked**, since scoring on absent data is the guesswork the system refuses everywhere else.
- Zero model calls in the entire sensitivity path, so UI sliders recompute instantly.

**Fixed a latent flaw in the piece-3 probe while running this.** The isolation test used to ask the model to *attempt* reading `DATA_MANIFEST.md`. Under `maxTurns: 1` an impossible action costs a turn to attempt and another to report, so the run died with `error_max_turns` and proved nothing either way. Replaced with a structural assertion on `ISOLATION` plus a tool-*inventory* question the model can answer in one turn. Probe is now 14/14 and deterministic. Lesson worth keeping: **do not test a safety property by asking the model to fail at something.**

## Piece 7 — Baseline comparison & ground truth — DONE

`src/lib/baseline/` (`negation.ts`, `rules.ts`, `screen.ts`), `src/eval/` (`gold.ts`, `compare.ts`), `data/derived/gold-labels.json`, `data/paraphrased/`. Run `npm run baseline` (20 assertions).

**Headline results:**

| | accuracy | pre-registered | critical errors | eligibility |
|---|---|---|---|---|
| AI | **100%** (91/91) | **100%** (24/24) | **0** | 13/13 |
| Rule baseline | 96.7% (88/91) | 95.8% (23/24) | 3 | 13/13 |

Phrasing robustness (reworded documents): **AI −4.8pp, baseline −61.9pp.**

- **The baseline is deliberately strong, not a strawman.** It has NegEx-style negation detection, explicit-absence patterns, and date arithmetic — every rule-based capability that does not require reading comprehension. My first design predicted a win on supplier-07's *"No liquid-fill or serum production line"*; NegEx (25 years old, ~0.94 accuracy, standard in clinical NLP) solves that trivially, so claiming it would have meant beating a system I had weakened. The baseline now gets that case **right**, and assertions in group B *require* it to. **On the original corpus the baseline matches the AI on all 13 eligibility outcomes** — good rules are genuinely competitive on uniformly formatted text.
- **Where the AI actually wins: the three critical errors.** supplier-03 MR-2 (`missed-conflict` — resolves a self-contradicting document instead of surfacing it), supplier-03 MR-7 (`false-pass` — treats an unsigned brochure as a declaration), supplier-13 MR-1 (`false-certainty` — asserts a failure where the document supports no determination). All three are the dangerous direction.
- **Cost-sensitive taxonomy, not bare accuracy** (`compare.ts`): `false-pass` / `false-certainty` / `missed-conflict` are critical; `false-fail` is costly; `over-abstention` is merely conservative. Plain accuracy would report "3.3% better" and hide that every baseline error is one a buyer would act on.
- **Anchoring control.** I authored corpus, system and labels, and had seen the system's output — so labels are tagged `pre-registered` (24, traceable to `DATA_MANIFEST.md` §2, written before any AI existed) vs `post-hoc` (67, anchoring risk disclosed). Pre-registered accuracy is reported separately as the trustworthy figure. 4 labels carry `alsoAcceptable` alternatives where the document is genuinely ambiguous.
- **The paraphrase test is what makes the comparison honest.** Our corpus is uniformly formatted because we generated it, which flatters regex. Three reworded profiles (same facts, different wording/order) collapse the baseline to 38.1% while the AI holds at 95.2% — one of them a `false-pass` on an expired certificate. Without this the comparison would have understated the real-world gap.
- **No LLM-as-judge**, deliberately: self-enhancement bias would have a model grade its own family too generously. Labels are hand-authored, citation checking mechanical.
- **Honest about direction**: the baseline is free and instant; the AI costs ~$0.73 and ~170s cold. The AI's advantage is accuracy on dangerous cases, plus **0 errors among its 83 unflagged verdicts vs the baseline's 3** — the ones a reviewer accepts without checking.
- `buildCorpusVariant("paraphrased")` in `loader.ts` loads the reworded set. Still an explicit named directory, never a glob, so `DATA_MANIFEST.md` stays unreachable.

Note: `ruleFailRate` initially used `batches?`, which matches "batche"/"batches" but **not** "batch" — needed `batch(?:es)?`. Fixing that (and stripping emphasis markers) was required to keep the baseline fair, not to weaken it.

## Piece 8 — Evaluation harness — DONE

`src/eval/` (`citations.ts`, `extraction.ts`, `confidence.ts`, `robustness.ts`, `provenance.ts`, `report.ts`), `data/derived/reference-values.json`, `eval-results/{results.json,scorecard.md}`. Run `npm run eval` (21 assertions). Completes all seven measurements the brief's evaluation protocol requires.

**Results:** citations 100% coverage / 100% correctness (90 exact, 1 normalized), 0 hallucinations · extraction 12/12 within document-stated reference · ranking agreement exact · injection ASR 0/5 delivered · evidence removal → abstains 2/2 · threshold shift 26/26 match arithmetic prediction.

Two methodological points that carry the credibility of everything else:

- **The detector is validated, not assumed.** "0 hallucinations" is unfalsifiable on its own — a checker that always returned `exact` produces the identical table. So 52 synthetically corrupted citations (fabricated quote / wrong chunk / wrong doc / nonexistent chunk) are run through `resolveCitation`: **52/52 caught, each resolving to exactly the right status, with 0 false positives on the 91 genuine ones.** Both halves matter — a checker that rejects everything would score 100% on corruption while being useless. Disclosed: synthetic corruptions are a proxy and may not mirror organic model errors.
- **Confidence: accuracy-calibration is unmeasurable here, so we measured something better.** With 0 errors there is no variance to correlate against and ECE is degenerate; claiming "well calibrated" would be unsupportable. What *is* measurable without errors: does confidence track the system's own uncertainty? **Of 8 verdicts where the system declined to decide, 6 carry `high` confidence** — it says "I cannot determine this" and "high confidence" simultaneously. That is the empirical basis for piece 4's decision never to surface confidence, measured on our own output rather than cited from a paper.

Other decisions worth keeping:

- **Kendall's tau was planned for ranking agreement and dropped.** At n=3 there are six possible orderings and three pairs, so a chance match occurs ~17% of the time and τ=1.0 would sound strong while carrying almost no information. Replaced with exact-ordering match plus **score margins** (0.265 and 0.194), which say how much error the ordering could absorb.
- **Reference values record ranges, not invented point values.** supplier-01 states "12–14 calendar days" alongside an audited mean of 12.6; three readings are defensible, so any value in [12,14] scores correct. Picking one and calling the rest wrong would measure our preference, not the system's accuracy.
- **No LLM-as-judge**, unlike RAGAS/DeepEval-style faithfulness scoring — self-enhancement bias would have a model grade its own family's output, and the claim does not need a model. Benchmark context: production RAG teams commonly target ≥90% citation precision.
- **Injection has three outcomes, not two.** During development the piece-2 leakage filter quarantined two payloads (their wording matched `mandatory requirement` / `case-to-requirement`) — a real defence, but one that left the *model's* resistance untested for those attacks. Counting them as "resisted" would credit the model for a filter's work. So outcomes are `blocked-at-ingestion` / `delivered-and-resisted` / `succeeded`, ASR is computed over **delivered** attacks only, and payloads were reworded so all 5 genuinely reach the model. **Delivery is asserted per payload** — published ASR against undefended systems is high, so an unexplained zero should not be trusted.
- **Threshold-shift robustness costs zero model calls** — the deterministic evaluator recomputes from cached findings. The clearest payoff of the read/decide split.
- `provenance.ts` generates the facts / assumptions / model-output separation the brief requires, from the actual run: 97 cited facts, 7 named assumptions (as-of date, lead-time upper bound, sustainability formula, min-max normalisation, marketing-claim-vs-silence rule, manual-review estimate, brief-stated thresholds), 91 model verdicts.

## Piece 6 — User interface — DONE

`src/app/page.tsx` + `src/components/` (8 components), `src/lib/snapshot.ts`, `scripts/build-snapshot.ts`, `scripts/check-ui.ts`. Run `npm run check:ui` (19 assertions; the rendered-page group needs `npm run dev` up).

**The decision that matters most: the UI reads a committed snapshot** (`data/derived/ui-snapshot.json`, regenerated only by `npm run build:snapshot`). This retires the dependency carried since piece 1 — anyone can now `npm install && npm run dev` and see the whole system with **no Claude Code, no API key**. The snapshot carries `requirementsVersion` and `check:ui` fails if it drifts from the frozen requirements, so staleness is loud.

**Sensitivity recomputes in the browser.** `ranking/score.ts` and `sensitivity.ts` are pure arithmetic, so sliders re-rank instantly with no server or model call. Client components import those files **directly** — importing `@/lib/ranking` would pull `report.ts` → `fs` into the bundle. `check:ui` group B guards this at source level with a clearer message than the build error.

Design decisions worth keeping:

- **A "Why this recommendation could be wrong" panel sits beside the recommendation**, not in a footer. Research finding that drove it: detailed supporting explanations raise trust *whether or not warranted*, "even explanations with no basis in the AI's actual working", and the effect is **stronger for domain experts**. The documented counterweight is surfacing disconfirming information, so the panel is generated from real state — narrow-margin thresholds, abstentions, contradictions, the first-to-second margin, our assumptions, and the confidence caveat.
- **No confidence indicator**, against the prevailing 2026 pattern, because piece 8 measured 6 of 8 declined-to-decide verdicts self-reporting *high* confidence. The UI states that reasoning — an omission only reads as rigour if the reason is visible.
- **Colours come from a validated data-viz palette**, not chosen by eye. Status vocabulary (verdicts: good/critical/serious/warning) is kept strictly separate from the series vocabulary (four ranking criteria). `warning` and `serious` fall below 3:1 on the light surface **by design**, so every cell carries mark + text label — colour never carries meaning alone.
- **Evidence is shown in context**: the quote is highlighted *inside its source section*, and the drawer states the comparison was computed in code rather than by the model.
- **No control implies an outward action** — no approve/contact/quote/order buttons anywhere; the human-approval boundary is stated as text and asserted by test.

Two things the build caught:

- The `check:ui` confidence assertion initially failed on the **serialized React props payload**, not the visible UI — `modelConfidence` ships to the client as snapshot data but is never rendered. Testing the HTML was the wrong instrument; the check now scans component source (with comments and string literals stripped, so prose *about* confidence doesn't trip it) and separately asserts the field is still recorded, since its unreliability must stay measurable.
- The zero-width-segment anti-pattern is real here: supplier-12 has **three contributions of exactly 0.000**. Segments below 0.4% width are not rendered, and every value appears in text beneath the bar regardless.

**Not visually inspected.** The Chrome extension was not connected, so I verified structure and the zero-width case programmatically but could not eyeball layout, label collisions or overflow. `npm run dev` → http://localhost:3000 needs a human look before recording the demo.

## Submission remediation — DONE

Audit against the Sofstica criteria and the challenge brief found five gaps outside piece 9's writing work. All closed. Run `npm run check:submission` (29 assertions).

- **The project was not a git repository at all.** Now initialised, 2 commits, 151 tracked files, ~893 KB. Pushing to GitHub is the user's step.
- **`.gitattributes` was missing** — the one not on the original list, and a prerequisite for the cache decision. Git's Windows default rewrites LF→CRLF on clone, which shifts **every character offset after line 1** and silently breaks citation verification on a reviewer's machine while passing on ours. Piece 2 flagged this risk and it had never been actioned. Now `* text=auto eol=lf` repo-wide, verified by clone test.
- **`docs/INTENDED_USE.md`** closes the required "intended-user statement, assumptions, limitations, and human-approval points" deliverable, which existed nowhere — "sourcing analyst" appeared only in prompt strings and code comments. `SafetyBanner` now names the user too.
- **The response cache is committed** (`.cache/llm`, 30 entries, 229 KB, with a README). This is what makes every script reproducible without a Claude Code CLI.
- **The confidence deviation is now argued, not silent.** The brief asks to display "source, retrieval date, **confidence**, assumptions, conflicts"; we show four and deliberately omit confidence. `docs/INTENDED_USE.md` §Deliberate deviations makes the case: we substituted a *checkable* signal (evidence verification status) for an *unreliable self-reported* one, backed by the measurement that 6 of 8 undetermined verdicts self-reported high confidence. It also states plainly that the corpus and gold labels are self-constructed, since no organiser pack existed.

**The clone test is the check that mattered** and no assertion could substitute for it: cloned to a fresh directory, `npm install`, then ran every suite with `CLAUDE_CODE_EXECUTABLE_PATH` pointed at a nonexistent binary. All passed from cache — 42/14→n/a, 21, 20, 20, 21. That is exactly what a reviewer will do, and it now works.

One flaw this exposed in my own check: "working tree is clean" failed after running `npm run eval`, because the harness legitimately rewrites its own bundle with a fresh timestamp. The assertion was testing the wrong thing — it now fails only on uncommitted *source, data or docs*, and reports regenerated outputs as a note.

**Commit style for this repo: short messages, no `Co-Authored-By` trailer** (user preference, recorded in memory).

## Track 3 — Supply-risk scenario planning — DONE

A second complete track, permitted by the brief only once one track's minimum evidence is fully delivered. `src/lib/scenarios/` (types, split, relax, disrupt, index), `src/components/ScenarioPanel.tsx`, `scripts/run-scenarios.ts` — **55 assertions**, no model access needed. Track 2 was ruled out: freight, duties, tooling and Incoterms appear twice in the whole corpus, so a landed-cost view would mean rewriting 13 profiles and invalidating the gold labels, snapshot and cache.

Every scenario is arithmetic over verdicts and signals we already hold. The only new model work was extracting cost and sustainability for the five near-miss suppliers, so a returned supplier can be *ranked* rather than merely named. Relaxation splits by requirement kind — qualitative requirements are dropped by **set arithmetic over existing verdicts** (nothing re-parsed, nothing to mis-parse); numeric ones are re-thresholded through `evaluateFinding`, reusing the mechanism piece 8 already validated 26/26 against arithmetic predictions.

**The headline finding is a negative result, and it only appeared after checking practice.** Procurement teams use 70/30 or 80/20, keeping ≥20–30% with the second source, because a supplier holding a token allocation will not prioritise you in a shortage. Run those ratios against the brief's 8,000-unit launch and the extracted MOQs and both are unavailable: the secondary allocation (1,600 / 2,400 units) falls below every eligible supplier's minimum. Only 60/40 and 50/50 survive — the splits practitioners avoid — and dual sourcing becomes properly available at the 40,000-unit scale-up the brief already anticipates (21 arrangements vs 4). Had we led with 50/50 we would have reported the opposite conclusion.

Details worth keeping:

- **Concentration is HHI**, verified against published worked examples (70/30 → 0.58; four-way 25% → 0.25), reported alongside **effective number of suppliers** (1/HHI) because "the equivalent of 1.9 independent suppliers" means something to a buyer that "0.53" does not. The current recommendation is stated as what it is: sole-source, HHI 1.0.
- **MOQ boundary ratios are generated, not just the standard four.** Supplier 12's 5,000 minimum is exactly 62.5% of the launch order, so the only arrangement including it puts *both* legs precisely on their minimum — feasible, and flagged in the UI as having no room to move. Without the derived ratio it would have looked simply impossible.
- **Infeasible options are kept with their reason**, not filtered away. At launch volume the infeasibility *is* the finding.
- **No upside is reported without its caveat**, asserted rather than trusted: every scenario admitting a supplier carries ≥2. The MR-6 saving (a supplier $13.80/unit cheaper) is stated beside the fact that its own document puts export freight and customs outside its quote, so the unit-price saving is not a landed saving. Blended split cost is labelled a best case — we assume price is independent of volume, whereas a backup source typically charges a 10–20% premium.
- **Caveats that make claims about the data are checked against the data.** The MR-5 caveat asserts the supplier it admits brings no cost relief; an assertion verifies it is genuinely the dearest, so the prose cannot go stale silently.

Two things the suite caught:

- I asserted the lead-time slip would flip exactly as many verdicts as suppliers it removed. It flipped three for two exits — supplier-05 also loses its MR-5 pass, though it was already blocked on MR-4. The code was right and my assertion was wrong; the corrected check is stronger, since that overlap is exactly the case where relaxing one requirement stops helping.
- The MR-5 relaxation shipped with one caveat where every other admitting scenario had two. That was a real gap, not a test artefact — relaxing a lead-time limit is a decision about the launch date, which the documents do not contain.

Regenerating the snapshot moved nothing: ingestion 42, probe 14, screen 21, rank 20, baseline 20, eval 21, check:ui 19 — all identical, as required.

## Corpus expansion — 13 → 23 suppliers — DONE

The real source was exhausted: the Kaggle CSV has 100 rows but only **5 distinct suppliers**, and no certification, MOQ, cruelty-free or country fields — the four things MR-1/2/3/6/7 test. Web search found no public dataset carrying those; MOQ is a negotiated commercial term and is not published in structured form. So growth had to be synthetic, which raised the question of whether it was worth doing.

**More suppliers of the same kind would have been worthless.** The label distribution showed why: 70 of 91 expected verdicts were `pass`, so a system answering "pass" to everything scored 77%, and only 24 labels were pre-registered. Adding ordinary suppliers would have added mostly-pass labels the system already gets right.

What was built instead: **10 adversarial suppliers, each encoding a named failure mode** — unit conversion (MOQ in cases, lead time in weeks), expired certificate, near-miss standard (ISO 9001/14001 but not 22716), certificate held by a sister site, internal contradiction, distractor MOQs by product format, metric inversion (68% acceptance = 32% fail), attribute on the wrong entity (Indian head office, Sri Lankan factory), favourable-end reading of a range, and one control that must **not** trip (every figure stated twice, table and prose, in agreement).

All 70 expected verdicts were **pre-registered in `DATA_MANIFEST.md` §2 before the documents met any model**, with `alsoAcceptable` recorded up front for the three genuinely arguable calls. Pre-registered labels went 24 → 94.

**I said this would drop the majority-class score to ~59% and that was wrong** — realistic supplier documents pass most requirements, so it sits at 76%. Forcing it down would have meant inventing suppliers that fail four things each, which is shaping a corpus to flatter a statistic. The manifest says so plainly.

### What it caught

| | before | after |
|---|---|---|
| AI accuracy | 100% (91/91) | **98.1%** (158/161), pre-registered 96.8% |
| Baseline accuracy | 100% | **91.9%**, pre-registered 88.3% |
| Baseline critical errors | small | **12**, including 6 false-passes |
| AI critical errors | 0 | **0** |

Every single trap caught the rule-based baseline: it passed the cases/weeks supplier, the 12,000-unit MOQ, the Sri Lankan factory and the 18–24 day range. The AI's three errors share one coherent failure mode — **it reports `conflicting` where a document states different values for different scopes or entities** (a certificate for a sister site, MOQs by product format, head office vs factory) rather than selecting the one that applies. It correctly flagged the one real self-contradiction and correctly did *not* flag the consistent restatement. All three errors are in the safe direction: still blocked, still routed to a human.

### Three findings, handled deliberately

- **A real extraction bug, found by the reference-value check.** The model counted **ISO 22716 as a third-party sustainability certification**, double-counting a mandatory requirement as a ranking bonus — and it inflated the score of the supplier that had just become the new winner. Fixed deterministically in `sustainabilityPoints()`: a certification that is already mandatory cannot also be an advantage, since every eligible supplier holds it. Extraction went back to 16/16 exact and supplier-01 is the winner again.
- **A citation gap left standing on purpose.** Coverage fell to 160/161: supplier-16 abstains on cruelty-free, and its sustainability section discusses an environmental policy rather than saying nothing, so the prompt's conditional "cite the text that shows it is unaddressed" does not oblige a citation. Making the rule unconditional **does** close it — that was tried, and it flipped supplier-01's lead-time verdict to `conflicting`, costing it eligibility. Re-tuning a prompt after seeing pre-registered results is exactly the anchoring pre-registration exists to prevent, so the change was reverted and the gap disclosed. The assertion now hard-fails on any *decided* verdict lacking a citation and caps abstention gaps at one, so it can shrink but never grow.
- **Track 3's headline finding flipped, and the write-up followed the data.** Nirvaan's 1,500-unit minimum means an 80/20 split at 8,000 units puts 1,600 with the secondary, which clears it — so dual sourcing is now available at every standard ratio at launch volume. The honest finding is better than the one it replaced: **the binding constraint was never the order size, it was the supplier set.** The assertions were rewritten to test the arithmetic that produces either outcome rather than the outcome that happened to hold, per the rule set when Track 3 was planned.

Also fixed: the lead-time-slip scenario was re-evaluating verdicts with no parseable figure, turning `conflicting` into `insufficient-evidence` and reporting a change it had not caused.

Corpus-size literals (13, 91) are gone — replaced by a single `SUPPLIER_COUNT` per script or derived from the data.

**Suite totals: 42 · 14 · 21 · 20 · 20 · 22 · 52 · 19 · 29.**

## Piece 9 — submission writing — DONE (except the recording)

- `README.md` — rewritten from the scaffold stub. What/why/how, setup, architecture with a data-flow diagram, results, the three required cases, safety posture, and an honest "what it gets wrong" section naming the conflict over-reporting bug. Written in first person and deliberately not padded.
- `docs/PROJECT_DESCRIPTION.md` — 926 characters against the portal's 1,000 limit. Covers all four required points.
- `docs/DEMO_SCRIPT.md` — shot-by-shot script for a 4-minute video with timings, hitting all three required cases. Verified against the actual UI: hovering a matrix cell shows the comparison string, clicking opens the drawer with "computed in code, not by the model".
- `docs/SLIDES.md` — ten slides with speaker notes, ending on the limitations slide rather than a thank-you.
- `../Themes for Hackathon 2026/SUBMISSION_CHECKLIST.md` — 43 items ticked. The confidence-display row is marked `[~]` with the deviation argued inline rather than left silently unticked.

Fixed while writing: the ranking-agreement caveat still said "three eligible suppliers give six possible orderings" after a fourth became eligible. Now derived from the signal count — a wrong number inside a caveat about statistical rigour is worse than no caveat. Also corrected two figures I had written from memory: near-misses are seven, not five, and a 25% lead-time slip leaves two of four eligible suppliers, not one.

## Brief re-audit — gaps closed

Went back to `AI_Manufacturing_Decision_Copilot.pdf` rather than trusting my own checklist, since a derived checklist inherits whatever it missed. Four real gaps, all now closed:

- **Completion time and human-review effort** — the brief lists it under "report at minimum". The figures were already in `results.json` but never rendered into `scorecard.md`, which is the document a judge reads. That is the same as not reporting them. New section, with the point that the baseline's *lower* review burden (4.3% vs 9.9%) is worse, because it hides 12 critical errors among the verdicts it did not flag.
- **SHA-256 checksums** — the brief describes the case pack as frozen and versioned with checksums. No organiser pack existed, so ours is self-authored and the checksums are our job. `npm run checksums` / `checksums:check`, 32 files, hashed over *normalised* text because that is what citation offsets index into — hashing raw bytes would false-alarm on a CRLF checkout that is actually correct. Verified inside `check:submission`.
- **Data dictionary** — also listed as part of the pack. `data/DATA_DICTIONARY.md` covers every source section, every derived file and field, the identifier schemes, and why `fail` and `insufficient-evidence` are different answers.
- **Retrieval date in the UI** — the brief wants source, retrieval date, confidence, assumptions and conflicts *beside consequential recommendations*. We had four of five: source in the evidence drawer, assumptions in their panel, conflicts surfaced, confidence deliberately omitted and argued. The retrieval date was simply missing. Now in the decision header with a line stating documents are not re-fetched, and asserted by `check:ui` so it cannot quietly vanish.

**Suite totals: 42 · 14 · 21 · 20 · 20 · 22 · 52 · 22 · 36 · 2 = 251 assertions.**

## Interactive UI rebuild — DONE

The interface was a report viewer: six of nine panels static, including the entire scenario panel. Wasteful, because the scenario engine was already deliberately Node-free so it *could* run client-side, and `evaluateFinding` is a pure function — dragging a threshold and watching the matrix re-decide costs zero model calls and is the clearest possible demonstration of "the model reads, the code decides".

**Structural fix first.** Verdicts now carry a `VerdictEvidence` block — the extracted values, not just the display string. The scenario engine had been recovering numbers by regex-parsing `"5000 units ≤ 5000 units"` in three places, so a change to a display format could silently change a computed result. Those regexes are gone. All suites confirmed identical results, so it was behaviour-neutral.

**Live eligibility** (`src/lib/eligibility/rescreen.ts`, `ThresholdControls.tsx`). MOQ, fail rate and lead time are draggable; every affected verdict re-decides in the browser through the same `evaluateFinding` the evaluation was measured against. Cells that moved carry a marker and a "was X under the brief's limit" tooltip, and the brief's own value is pinned on each slider track. A relaxed screen must never be mistakable for the one the brief asked for. Slider ranges are anchored on the brief's value rather than the data, so the control does not quietly reveal where suppliers sit. An unverified citation stays downgraded — a threshold change cannot restore evidence that failed verification.

**Live scenarios.** Order quantity, requirement relaxed, supplier unavailable, slip percentage — all recomputed live, and they *combine*, which is the honest case since things rarely go wrong one at a time. Same functions the verification suite exercises, so interface and suite cannot diverge.

**Live run mode** (`src/app/api/run/route.ts`, `LiveRunPanel.tsx`). A **Route Handler returning a ReadableStream**, not a Server Action — research was decisive here: Next.js waits for an action to return before sending anything, so progress would arrive in one lump at the end, and there is an open vercel/next.js issue about Server Actions + `useTransition` hanging on long work. The handler returns the Response immediately and writes events from a background task. Verified streaming incrementally. Each verdict arrives with its quote and whether it was decided in code or by the model. A `HEAD` probe tells the panel whether a CLI exists; with none, the button disables and explains why. **The offline guarantee is intact and now asserted** — build confirms page `○ static`, route `ƒ dynamic`.

**Layout** follows the pattern the research supports (sidebar rail 240–280px, calm 4–6 card metric strip, content grid; cognitive load, not aesthetics, predicts abandonment). `SideNav.tsx` uses an IntersectionObserver biased to the upper third — the "current" section is the one at the top of the viewport, not whatever is centred. `MetricStrip.tsx` carries four numbers that *bound how much weight the recommendation can bear*: eligible count, citation correctness, accuracy vs ground truth, and how much still needs a person. Deliberately excluded: documents processed, time saved, cost saved — volume metrics flatter the tool without telling a buyer whether to believe it.

**Suite totals: 42 · 14 · 21 · 20 · 20 · 22 · 52 · 24 · 36 · 2 = 253 assertions.**

## Live-run honesty fix — DONE

The user asked "do you think we are still running it live?" and they were right to. It was not. A full 161-verdict run finished in **0.63 seconds** — pure cache replay — while the panel said "This runs the real thing", and `route.ts` inferred cache status from `elapsed < 20_000` instead of reading `telemetry.cacheHit`, which was sitting right there. The guess happened to be correct, which is worse than being wrong: it would have started lying the moment the cache went partially cold, reporting replay speed as model speed.

- **Truth from telemetry.** `cacheHits` and `liveCalls` are counted from `telemetry.cacheHit` per call, never inferred from elapsed time.
- **Two explicit controls.** `Replay from cache` (~1s, reproducible, no login needed) and `Fresh run` (`?fresh=1`, bypasses the cache via a new `cache` passthrough on `screenSupplier`, ~25s per supplier). Both label what they are *before* you press them, asserted by `check:ui`.
- **Two real bugs surfaced by testing it properly:**
  - *Silent failure.* `screenSupplier` catches errors and returns an error screen; the route never checked `result.error`, so 23 failed suppliers rendered as a finished run reporting "23 live calls" with an empty result. Now each failure is sent as a `supplier-failed` event and shown in red, and `liveCalls` counts only calls that actually completed.
  - *`Controller is already closed`.* An unhandled rejection took down the dev server whenever a client disconnected mid-run. `send` and `finish` are now guarded.

The failure that exposed all this was transient — it coincided with a `claude` re-login, so every call failed fast. Under the old code that looked like a successful run. That is precisely the failure mode the fix exists for.

Verified after: fresh run reports `cacheHit:false` at 19–26s per supplier; replay reports `cacheHits:23, liveCalls:0`.

`docs/DEMO_SCRIPT.md` rewritten for the interactive UI — the strongest thirty seconds is now dragging the MOQ slider and watching verdicts re-decide with no model call, and the ending shows replay and a real run as two different things rather than pretending either does the other's job.

## Not yet built
- [ ] Demo video — script is ready, needs recording and an unlisted upload
- [ ] Push to a public GitHub remote (user's step)
- [ ] Team size / CV upload logistics still unconfirmed
- [ ] Nobody has visually inspected the running UI

## Where else to look

- `../Themes for Hackathon 2026/SUBMISSION_CHECKLIST.md` — full Sofstica + challenge-specific submission checklist, keep updated as we progress.
- `../Themes for Hackathon 2026/AI_Manufacturing_Decision_Copilot.pdf` — original challenge brief.
