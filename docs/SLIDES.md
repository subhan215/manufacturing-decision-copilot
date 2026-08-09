# Slides

**The deck itself is `slides.html`** — open it in Chrome or Edge and it presents as ten 16:9 pages.

**To export a PDF:** `Ctrl`+`P` → Destination **Save as PDF** → Layout **Landscape** → Margins **None** → tick **Background graphics**. Each slide becomes one page at 13.333in × 7.5in, the standard 16:9 slide size.

This file is the *script*: the same ten slides in plain text, with the speaker notes in italics. Those notes are deliberately not on the slides — a slide a presenter reads aloud is a slide the audience is reading instead of listening.

---

## 1. AI Manufacturing Decision Copilot

Supplier shortlisting with evidence you can check

Sofstica Hackathon 2026 · Track 1 (+ Track 3)

*Don't read the title out. Go straight into the problem.*

---

## 2. The problem

A buyer has 23 supplier profiles and 7 mandatory requirements.

Reading them by hand is slow and easy to get wrong.

**But a tool that just names a winner is worse than nothing** — it's confident and unverifiable, and someone places an order on it.

*The second line is the actual pitch. Land it.*

---

## 3. The idea everything is built on

# The model reads. The code decides.

The LLM never compares a number to a threshold. It reports what a document says, and quotes it.

Code does the arithmetic — and shows it.

`5000 units ≤ 5000 units`

*If they remember one slide, this is the one.*

---

## 4. Why that matters

- A supplier **exactly on a limit** is decided by an operator, not a borderline judgement call
- **Every verdict shows its arithmetic** — checkable in a second
- **Exploring a constraint is free** — drag a limit and all 161 verdicts re-decide in the browser, zero model calls

Plus: every citation is verified byte-for-byte against the source.
A model can't talk its way past a string comparison.

---

## 5. Results

| | AI | Rule-based baseline |
|---|---|---|
| Accuracy (161 labels) | **98.1%** | 91.9% |
| Pre-registered only (94) | **96.8%** | 88.3% |
| **Critical errors** | **0** | **12** |
| Citation correctness | 100% | — |
| Hallucinated quotes | 0 | — |

*The accuracy gap is modest. The critical-error gap is the one that matters — six of the baseline's twelve were false passes.*

---

## 6. Three things that make those numbers mean something

**The baseline is a real opponent.** NegEx negation detection, explicit-absence detection, certificate date arithmetic. My first version was a strawman and I rebuilt it.

**The labels came first.** 94 of 161 expected verdicts were written down before those documents met a model.

**The detector was itself tested.** 92 deliberately corrupted citations, 92 caught, zero false positives on genuine ones.

*A zero hallucination rate is meaningless if the checker can't detect. So I checked the checker.*

---

## 7. Built against over-reliance

People under-scrutinise confident automated recommendations. So:

- **A counter-argument panel that's always on** — who's cheaper, where the winner is weak, what would flip it
- **No action controls anywhere** — no approve, no order, no contact
- **Abstention is a real answer** — missing evidence returns *insufficient evidence*, never a guess
- **Confidence deliberately not shown** — of 16 verdicts where it declined to decide, 11 claimed high confidence

*Last point is a deviation from the brief. I argue it in the repo rather than hiding it.*

---

## 8. Track 3 — when the plan stops working

- What each requirement **costs you** — and the caveat sits next to the saving, not in a footnote
- Who takes over if the **top supplier can't deliver**
- What a **25% lead-time slip** does
- Whether you can **split the order** — MOQs enforced, concentration measured as HHI

**The finding:** dual sourcing at launch volume looked impossible until I added one small-batch supplier. The binding constraint was never the order size — it was the supplier set.

---

## 9. What it gets wrong

Three errors in 161. All the same bug.

It reports **conflicting** when a document gives different values for different scopes — a certificate held by a sister site, MOQs listed per product line, an Indian head office with a Sri Lankan factory.

Those aren't contradictions. It should pick the one that applies.

*All three block the supplier and route to a human, so they're safe-direction. Still errors, and it's the first thing I'd fix.*

---

## 10. What I'd do next

- **Fix the conflict over-reporting** — the schema needs a notion of applicability
- **Get a second annotator** — one person wrote the corpus, the labels and the system
- **Test on real supplier PDFs** — mine are uniformly formatted, which flatters pattern matching
- **Landed cost** — freight and duties appear twice in the whole corpus

Repo · `demo/CASE_WALKTHROUGH.md` · `eval-results/scorecard.md`

*End on the limitation slide, not on a thank-you slide.*

---

### Note on slide 3

Keep it nearly empty. It is the one that has to stick, and the deck sets it as a single statement with one line of arithmetic beneath it — nothing else competes.
