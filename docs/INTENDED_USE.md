# Intended use, assumptions, limits and human approval

*AI Manufacturing Decision Copilot — Track 1, supplier shortlisting.*

This document states who the system is for, what it does and does not do, where
a person must take over, what we assumed, what the evaluation does not
establish, and where we have deliberately departed from the challenge brief.

---

## Intended user and decision

**The user is a sourcing or product analyst choosing a contract manufacturer for
a single product**, working from a folder of supplier documentation they have
been sent. They have the domain knowledge to judge whether a supplier's claims
are credible; what they lack is the hours it takes to read thirteen profiles
against seven requirements and keep the reasoning straight.

**The decision it supports** is narrow and specific: *given these mandatory
requirements and these supplier documents, which suppliers qualify, and among
those, which best fits our stated priorities?*

It is designed to be **read**, not obeyed. Every verdict carries the sentence it
came from, and the interface leads with the reasons the recommendation might be
wrong rather than burying them.

### Who it is not for

- **Not for procurement automation.** It issues nothing, approves nothing and
  integrates with no purchasing system.
- **Not a compliance system of record.** A certificate that satisfies MR-2 here
  has been read from a document, not verified with the issuing body.
- **Not for anyone acting on the output without opening the evidence.** The
  system is built to make checking cheap; it is not built to be trusted blind.

---

## What the system does

- Reads supplied supplier documents and the product brief as untrusted text.
- Screens every supplier against every mandatory requirement, showing pass, fail,
  contradictory or undetermined per requirement.
- Quotes the exact sentence behind each verdict and verifies mechanically that
  the quote exists where it claims to.
- Computes threshold, date and location comparisons **in code**, not in the
  model, and shows the arithmetic.
- Ranks the qualifying suppliers under adjustable priorities and shows how far
  those priorities can move before the answer changes.
- Surfaces contradictions rather than resolving them, and abstains where the
  documents are silent.

## What the system does not do

- **Does not contact suppliers** — no email, no message, no request for
  quotation, under any circumstances.
- **Does not verify certificates** with issuing bodies or registries.
- **Does not price an order.** Cost figures are stated averages across comparable
  products, not quotations for this product.
- **Does not approve a supplier** or place an order, and offers no control that
  implies doing so.
- **Does not assess anything outside the seven stated requirements** — financial
  stability, capacity under load, labour practices and geopolitical risk are all
  out of scope.
- **Does not establish that a supplier is currently able to fulfil an order.**
  Every finding describes a document, not a factory.

---

## Where a person takes over

These are handoffs, not suggestions. The system stops at each of them.

1. **Verifying certifications.** MR-2 verdicts rest on what a document says about
   a certificate. Confirming that the certificate exists, is current and covers
   the relevant scope requires contacting the issuing body.
2. **Resolving contradictions.** Where a document contradicts itself, the system
   reports both statements and deliberately does not choose. Someone must ask the
   supplier which is true.
3. **Filling evidence gaps.** Suppliers marked undetermined are not disqualified —
   they are undocumented. Deciding whether to request the missing paperwork is a
   commercial judgement.
4. **Accepting narrow margins.** Several requirements are satisfied by very small
   margins. Whether a supplier at exactly the MOQ limit is genuinely acceptable is
   a negotiation question, not a computation.
5. **Selecting a supplier, and everything after it.** Approval, contracting,
   quotation and ordering are entirely outside this system.

---

## Assumptions we introduced

None of the following appears in any source document. Each is our decision, and
each would change the result if decided differently. The authoritative list lives
in `src/eval/provenance.ts` and is reproduced in the interface and in
`eval-results/scorecard.md`.

| Assumption | Why | What it changes |
|---|---|---|
| Certificate validity is judged against an as-of date of **2026-08-09** | The system prompt replaces the CLI preset, so the model cannot be assumed to know the current date. Passing it explicitly and comparing in code makes expiry deterministic and reproducible from cache months later. | MR-2 for every supplier whose certificate expires near this date |
| Where a document states a lead-time **range**, the upper bound is used | The requirement is a maximum, so the conservative reading is the worst case. Taking the lower bound would pass suppliers on their best day. | supplier-01, stated as 12–14 days alongside an audited mean of 12.6 |
| Sustainability scores **one point per documented cruelty-free declaration plus one per named third-party certification** | The brief asks for a sustainability score without defining one. Counting documented commitments is auditable; weighting them by perceived stringency would not be. | The sustainability criterion, 15% of the default weighting |
| Criteria are normalised **min-max across the eligible pool** before weighting | Chosen for stability and low sensitivity to small perturbations. Scores are therefore relative to the candidate pool, not absolute quality. | All ranking scores; adding or removing a supplier can reorder the rest |
| A **promotional compliance claim** with no certificate record is a failure, whereas a **missing certificate section** is insufficient evidence | A marketing claim offered in place of a certificate is positive evidence that none was supplied. Silence is not — the supplier may hold one and simply not have sent it. | MR-2 for supplier-11 (fail) versus supplier-13 (abstain) |
| Manual review is estimated at **~10 minutes per supplier** | Stated for comparison only. It is an estimate, not a measurement, and is labelled as such wherever it appears. | The time-saving narrative only; no computed metric depends on it |
| Mandatory thresholds and ranking weights are taken **from the product brief as given** | These are the buyer's stated requirements, not our judgement. They are extracted from the brief by the model and frozen to a reviewed file. | Every eligibility verdict and the default ranking; the sensitivity analysis exists to show what moves when the weights do |

---

## What the evaluation does not establish

Reproduced from `src/eval/report.ts`, which is the source of truth.

- One annotator authored the corpus, the gold labels and the system. A sound
  evaluation would use independent annotators and report inter-annotator
  agreement, which also establishes the ceiling on achievable performance.
- 24 of 91 gold labels are **pre-registered** (recorded before any AI system
  existed); the remaining 67 were authored afterwards and carry a disclosed risk
  of anchoring toward the system's output.
- The corpus is uniformly formatted because it was generated. This flatters
  pattern-matching approaches, so the measured gap against the rule-based
  baseline **understates** the likely real-world gap. The paraphrase test exists
  to quantify that.
- Detector validation uses synthetically corrupted citations. These are an
  operational proxy and may not mirror organic model errors.
- Accuracy-calibration of the model's confidence could not be measured, because
  the system made no errors on this corpus.
- Three eligible suppliers is too small a sample for rank-correlation statistics;
  ordering agreement is reported with score margins instead.
- Cost figures are stated averages across comparable products, not quotations.
- Prompt-injection results cover five payloads against one supplier document.
  Absence of a successful attack here is not proof of general immunity.

---

## Deliberate deviations from the brief

Two places where we have knowingly not done what the brief says. Both are
choices, not oversights, and we would rather argue them than have them found.

### 1. We do not display the model's confidence

> The brief asks the prototype to *"display source, retrieval date, **confidence**,
> assumptions, and conflicts beside consequential recommendations."*

We display source, retrieval date, assumptions and conflicts. **We deliberately
do not display confidence.**

The reason is measured, not theoretical. The system records a self-reported
confidence level on every verdict, and we checked it against its own behaviour:
**of the 8 verdicts where the system explicitly declined to decide — returning
"contradictory" or "undetermined" — 6 were nonetheless labelled high
confidence.** It reports "I cannot determine this" and "high confidence"
simultaneously. That matches the published finding that verbalised model
confidence responds to the answer a model has committed to rather than to
whether that answer is correct.

Displaying it would satisfy the letter of the requirement while doing the
opposite of what the requirement is for. A reader who saw "high confidence" on an
undetermined verdict would be worse informed than one who saw nothing.

**What we show instead** is a signal the reader can check: whether the quoted
evidence was located in the source document, and by what kind of match. That
serves the requirement's intent — telling the user how far to trust a claim —
with something verifiable rather than something self-reported.

The confidence values are still recorded in the snapshot and the evaluation
bundle, so the claim above stays testable. `npm run check:ui` asserts that no
component renders them.

### 2. The corpus and the gold labels are ours

The brief anticipates an organiser-supplied challenge pack and evaluation against
*"organizer-provided held-out cases or reference calculations."* No such pack was
available to us.

We therefore **constructed the entire corpus ourselves**: a fictional product
brief and thirteen supplier profiles, five of them derived from a public Kaggle
supply-chain dataset and eight fully invented, each engineered to exercise a
specific behaviour. We then hand-authored 91 gold labels to evaluate against.

`data/DATA_MANIFEST.md` documents every source, transformation and design intent.
The consequences are stated in the limitations above — most importantly that we
graded our own homework, and that a uniformly formatted corpus makes a
rule-based baseline look better than it would on real supplier documents.

---

## Provenance

The evaluation separates three kinds of statement, as the brief requires, and the
separation is generated from the actual run rather than asserted here:

- **Facts** — 97 values extracted from documents, each with a verified citation.
- **Assumptions** — the 7 above, none of which appears in any source document.
- **Model output** — 91 verdicts and the ranking derived from them.

See `eval-results/results.json` (`provenance`) and `eval-results/scorecard.md`.
