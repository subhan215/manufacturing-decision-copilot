# AI Manufacturing Decision Copilot

Sofstica Hackathon 2026 — **Track 1: Supplier Shortlisting**, plus a complete second track (Track 3: Supply-Risk Scenario Planning).

A sourcing analyst has 23 supplier profiles and a product brief with seven mandatory requirements. The job is to work out who qualifies, who doesn't, and why — with the evidence attached, so somebody can check the work before an order gets placed.

That last part is the whole point. A tool that says "Supplier 1 is your best option" and nothing else is worse than no tool, because it's confident and unverifiable. Everything here is built so a buyer can disagree with it.

---

## The one idea worth explaining

**The model reads. The code decides.**

The LLM never compares a number to a threshold. It reads the document and reports what it found: *this supplier states a minimum order quantity of 5,000 units, and here is the sentence.* Whether 5,000 clears a 5,000-unit ceiling is then decided by an `if` statement.

This isn't stylistic. LLMs get numeric comparisons wrong at a low but real rate — the kind of error that puts a supplier on a shortlist they should have been excluded from, with a fluent explanation attached. Code gets them wrong essentially never. So the split is: judgement to the model, arithmetic to the machine.

It pays off in three places:

- **A supplier sitting exactly on a limit** (MOQ of 5,000 against a 5,000 ceiling) is decided by an operator, not a coin flip.
- **Every verdict shows its arithmetic** — `5000 units ≤ 5000 units` — which a human can check in a second.
- **Moving a threshold costs nothing.** The scenario engine recomputes 46 verdicts under new limits with zero model calls, because the values are already extracted and only the comparison changes.

The second idea is smaller but does a lot of work: **citations are verified mechanically.** Every quote is checked with `document.slice(start, end) === quote`. If it doesn't match the source byte-for-byte, the verdict is downgraded. A model can't talk its way past a string comparison. Across 161 verdicts: 100% citation correctness, zero hallucinated quotes.

---

## What it does

1. **Ingests** the product brief and 23 supplier profiles, splits them into sections with exact character offsets, and quarantines anything that would leak the answer.
2. **Screens** every supplier against all seven mandatory requirements — 161 verdicts, each one `pass`, `fail`, `conflicting`, or `insufficient-evidence`, each with a quote.
3. **Ranks** the survivors on cost, lead time, quality and sustainability, with weights you can drag around and see the effect immediately.
4. **Tells you how much to trust it** — how far a priority can move before the winner changes, and which supplier can be set aside no matter what you weight.
5. **Plans for things going wrong** — what a requirement is actually costing you, what happens if the top supplier can't take the order, and whether you can split it across two.

### The three cases the brief asks for

| Case | Supplier | What it shows |
|---|---|---|
| **Success** | Supplier 1 | Clears all seven, ranked first, every verdict cited |
| **Conflicting** | Supplier 3 | Its own compliance summary says the ISO 22716 certificate is current; its audit appendix says it expired in November 2025. The system surfaces both statements and refuses to pick one |
| **Failure / fallback** | Novaline (13) | Four requirements have no data at all. It abstains and says where it looked, rather than guessing |

---

## Does it actually work?

Everything below comes from `npm run eval`, which fails loudly rather than printing a number it can't back up.

| | AI (Claude) | Rule-based baseline |
|---|---|---|
| Accuracy vs. hand-authored labels | **98.1%** (158/161) | 91.9% (148/161) |
| Pre-registered labels only | **96.8%** (91/94) | 88.3% (83/94) |
| **Critical errors** | **0** | **12** |
| Citation correctness | 100% | — |
| Hallucinated quotes | 0 | — |
| Prompt injection success | 0 of 5 delivered | — |

Critical errors are the ones a buyer would act on: passing a supplier the evidence disqualifies, asserting a determination the document doesn't support, or resolving a contradiction instead of surfacing it. The baseline made twelve, six of them false passes. **The AI made none.**

The accuracy gap looks modest. The critical-error gap is the one that matters, and it's the difference between a tool you can put in front of a buyer and one you can't.

Three things I'd point a judge at:

- **The baseline is a real opponent, not a strawman.** It does negation detection (NegEx, the clinical-NLP standard), explicit-absence detection, and certificate date arithmetic. My first version didn't, and web research showed I was about to claim a win that a competent 200-line script would also get. Building it properly cost me a headline; it made the comparison honest.
- **The labels were written before the system existed.** 94 of 161 expected verdicts were recorded in `data/DATA_MANIFEST.md` before those documents were ever shown to a model. Pre-registered accuracy is reported separately, because it's the number that can't be flattered by hindsight.
- **The hallucination detector was itself tested.** A zero hallucination rate means nothing if the checker can't detect. Against 92 deliberately corrupted citations it caught 92, while rejecting none of the 160 genuine ones.

Full detail: [`eval-results/scorecard.md`](eval-results/scorecard.md).

### What it gets wrong

Three verdicts out of 161, and they share one cause: **the system reports `conflicting` when a document states different values for different scopes or entities** — a certificate held by a sister site, MOQs listed per product format, an Indian head office with a Sri Lankan factory. Those aren't contradictions; it should pick the one that applies. It correctly flagged the one genuine self-contradiction and correctly left the consistent-restatement control alone.

All three errors block the supplier and route to a human, so they're in the safe direction. They're still errors.

---

## Setup

You need Node.js 24+ (the project uses native TypeScript type stripping) and npm.

```bash
git clone <this-repo>
cd manufacturing-decision-copilot
npm install
npm run dev
```

Open http://localhost:3000. **That's it — no API key, no Claude Code login, no `.env` file.**

The interface reads a committed snapshot of a completed analysis run (`data/derived/ui-snapshot.json`), so anyone can clone this and see the whole system work.

### Re-running the analysis yourself

Only needed if you want to regenerate rather than inspect. This part needs the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed and logged in (`claude login`) — the project drives your local Claude Code session through `@anthropic-ai/claude-agent-sdk` rather than a paid Anthropic API key.

```bash
npm run screen           # eligibility screen, 161 verdicts
npm run rank             # ranking + sensitivity analysis
npm run baseline         # AI vs rule-based comparison
npm run eval             # full evaluation harness, writes eval-results/
npm run scenarios        # supply-risk scenarios (Track 3)
npm run build:snapshot   # freeze a run for the interface
```

**Every one of these runs from the committed response cache without a CLI at all.** 44 model calls, all cached, 355 KB, committed to the repo. `npm run cache:audit` replays every call path and fails if a single entry is missing. The only script that genuinely needs a live login is `npm run probe:llm`, which exists to check the connection.

That was a deliberate constraint: I have a Claude subscription and no API budget, so I built the whole thing to be reproducible by someone who has neither.

There's still no API key. The only optional setting is `CLAUDE_CODE_EXECUTABLE_PATH`, if `claude` isn't on your PATH — see `.env.local.example`.

### Everything else

```bash
npm run inspect:ingestion   # chunking, offsets, leakage audit   (42 checks)
npm run probe:llm           # SDK isolation — needs a live CLI   (14 checks)
npm run check:ui            # snapshot integrity, client/server   (19 checks)
npm run check:submission    # submission artifacts                (29 checks)
npm run cache:audit         # cache completeness                   (2 checks)
```

**241 assertions across ten suites.** They're not decoration — several of the design decisions below exist because an assertion failed and I couldn't argue with it.

---

## Architecture

```
data/                      product brief + 23 supplier profiles (markdown)
  │
  ▼
src/lib/ingestion/         normalise → detect headings → chunk with exact offsets
  │                        → exclude provenance regions → scan for label leakage
  │                        Chunk ids look like  supplier-01#s03-order-terms
  ▼
src/lib/llm/               single entry point: askStructured()
  │                        native JSON-schema output + Zod validation
  │                        content-addressed cache, keyed on everything that
  │                        can change an answer
  ▼
src/lib/eligibility/       model reports findings  ──▶  code derives verdicts
  │                        citations verified byte-for-byte against source
  │                        unverifiable citation ⇒ verdict downgraded
  ▼
src/lib/ranking/           min-max normalise → weighted sum → sensitivity
  │                        (weight stability intervals, seeded Monte Carlo,
  │                        Pareto dominance).  Browser-safe: no Node imports
  ▼
src/lib/scenarios/         requirement relaxation, supplier loss, lead-time
  │                        slip, split allocation with HHI concentration
  ▼
data/derived/ui-snapshot.json  ──▶  src/app + src/components  (Next.js 16)
```

Two modules deliberately never touch the network or the filesystem — `ranking/score.ts` and `ranking/sensitivity.ts` — so the weight sliders recompute in your browser using **the same code the evaluation ran against**. The interactive result and the reported result can't drift apart, because they're the same function.

### Data flow, end to end

A supplier profile is read from disk and normalised (line endings, whitespace, Unicode). Headings are detected and the document is cut into chunks, each carrying the exact character offsets of its text in the original. Trailing provenance regions are stripped uniformly, and a leakage scanner fails the build if answer-revealing text survives into anything the model can see.

The chunks go to the model inside explicit `UNTRUSTED` fences, with a request for one structured finding per requirement. The model returns what it found and a verbatim quote. Code then verifies the quote appears at the cited offset, derives the verdict by comparison, and records the arithmetic.

Eligible suppliers get a second pass for commercial signals (cost, sustainability), which reuses the lead-time and quality values the screen already extracted rather than asking twice. Ranking, sensitivity and scenarios are pure computation from there — no further model calls.

The whole run is frozen to a snapshot that the interface reads.

### Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Zod · `@anthropic-ai/claude-agent-sdk`

No LangChain, no vector database, no framework between me and the model. That was a learning choice — I wanted to hand-build retrieval, structured output, orchestration and evaluation rather than configure someone else's version. It also meant that when something broke, there was no abstraction to blame.

---

## Safety and honesty

The failure mode I was most worried about isn't the model being wrong. It's the model being wrong and **sounding right**, and a tired buyer going along with it. Research on automation bias is fairly clear that people under-scrutinise confident automated recommendations, so a few things are built to push against that:

- **A counter-argument panel, always on.** Beside the recommendation, the interface states the case against it — which supplier is cheaper, where the winner is weakest, how small a change in priorities would flip it.
- **No action controls anywhere.** No approve, no contact, no place order. The system produces a shortlist and a stopping point.
- **Abstention is a first-class answer.** Missing evidence returns `insufficient-evidence`, not a guess. Absence of a certificate is not treated as evidence of absence — the supplier may simply not have sent it.
- **Confidence is deliberately not displayed.** The brief asks for it. I show verification status instead and argue the substitution in [`docs/INTENDED_USE.md`](docs/INTENDED_USE.md): of 16 verdicts where the system declined to decide, 11 reported high confidence. A number that unreliable next to a verdict would do more harm than good. It's still recorded and measured — just not shown as if it meant something.
- **Untrusted content is fenced, and capability is removed.** The model session runs with no tools at all, so an injected instruction has nothing to act on even if the model follows it. Fencing lowers the odds; removing capability is the control I'd actually rely on. Zero of five delivered injection payloads succeeded.

Known limitations are in [`docs/INTENDED_USE.md`](docs/INTENDED_USE.md) and at the bottom of the scorecard. They include the ones that don't flatter me — a single annotator who wrote the corpus, the labels *and* the system; a uniformly formatted corpus that makes the baseline look better than it would be in the wild; and one verdict in 161 that abstains without citing anything.

---

## Track 3: what happens when the plan stops working

Once Track 1 was complete and measured, I built a second track. It's all arithmetic over verdicts already extracted, so replaying a scenario is instant.

- **What each requirement costs you.** Seven suppliers fail on exactly one requirement, so "what would we gain by dropping the India-only rule?" has a real answer — with the caveat that the cheaper overseas options exclude freight and customs from their quotes, which is stated right next to the saving.
- **If the top supplier can't take the order.** Re-ranks without them, and discloses that the remaining scores shift too, because min-max normalisation is relative to the pool.
- **If lead times slip 25%.** Suppliers quoting close to the limit have no room: of four eligible suppliers, two survive.
- **Can you split the order?** Evaluated at both order quantities, with minimum order quantities enforced, concentration measured as HHI and reported as "the equivalent of 1.9 independent suppliers."

One finding worth the trip. An earlier version of the corpus made dual sourcing **impossible** at launch volume: at the 80/20 and 70/30 ratios procurement teams actually use, the second supplier's share fell below every candidate's minimum order quantity. Then I added a small-batch manufacturer with a 1,500-unit minimum and it became possible at every ratio. The real finding was the second one: **the binding constraint was never the order size, it was the supplier set.** If you want resilience at launch, qualify a supplier who'll take small runs.

I rewrote the tests to assert the arithmetic that produces either answer, rather than the answer that happened to hold. That rule was set before the result changed, which is the only reason it was easy to follow.

---

## What I'd do next

**Fix the conflict over-reporting.** All three remaining errors are the same bug: different values for different scopes read as a contradiction. The extraction schema needs a notion of applicability — which product line, which site, which entity — so the model can select rather than surrender. This is the first thing I'd build.

**Get a second annotator.** Every accuracy figure here has one person behind the corpus, the labels and the system. Inter-annotator agreement would tell us what the ceiling actually is, and I currently have no idea.

**Test on documents nobody wrote for this.** The corpus is uniformly formatted because I generated it, which flatters pattern matching and understates the real gap against the baseline. Real supplier PDFs — inconsistent, scanned, half in tables — are the honest test. The ingestion layer already carries heading heuristics for PDF text that this corpus never exercises.

**Close the citation gap properly.** One verdict abstains without citing anything. Making the citation rule unconditional fixes it and I have the diff; it also moved an unrelated verdict, and re-tuning a prompt after seeing pre-registered results would destroy the thing pre-registration is for. Next corpus, that rule ships from the start.

**Landed cost (Track 2).** Currently impossible — freight, duties, tooling and Incoterms appear twice in the entire corpus. Every "saving" this tool reports is a unit-price saving, and it says so, but a buyer wants the landed number.

**Multi-supplier award optimisation.** Split allocation currently enumerates pairs at fixed ratios. With volume-tiered pricing it becomes a proper optimisation problem, and the interesting version allocates across three or more suppliers.

---

## Repository map

```
data/
  product-brief.md            fictional product, 7 mandatory requirements
  supplier-profiles/          23 profiles (5 CSV-derived, 18 authored)
  paraphrased/                reworded variants for robustness testing
  DATA_MANIFEST.md            every source, plus 94 pre-registered verdicts
  derived/                    frozen requirements, gold labels, UI snapshot
src/lib/                      ingestion · llm · eligibility · ranking · scenarios
src/eval/                     scoring, citations, robustness, provenance
src/components/               interface
scripts/                      ten verification suites
eval-results/                 scorecard.md + results.json
docs/INTENDED_USE.md          intended user, assumptions, limitations
.cache/llm/                   committed responses — this is why it runs offline
CLAUDE.md                     full build log and every decision, with reasons
```

**On the data:** the five real suppliers come from a Kaggle supply-chain dataset. Certifications, minimum order quantities and sustainability declarations don't exist in any public dataset I could find — MOQ is a negotiated term, not published data — so those were authored, along with 18 additional suppliers. Ten of those exist to probe specific ways document reading fails: unit conversion, expired certificates, near-miss standards, distractor numbers, metric inversion. All of it is disclosed in `data/DATA_MANIFEST.md`, including the part where the corpus is mine and what that costs the evaluation.

**Not real companies.** Every supplier name, certificate number and price in this repository is invented.
