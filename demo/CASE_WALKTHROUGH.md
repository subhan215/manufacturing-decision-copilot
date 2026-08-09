# The three required cases

The challenge brief asks for *"a demonstration of one successful case, one ambiguous or conflicting case, and one failure or fallback case."*

Everything below is real output from the committed analysis (`data/derived/ui-snapshot.json`), reproduced verbatim — quotes, comparisons and conflict notes are copied from the run, not written for this document. Reproduce any of it with `npm run screen`, or see it in the interface at `npm run dev`.

The three cases were chosen during corpus construction and are recorded in `data/DATA_MANIFEST.md` §3, before any AI system existed.

---

## 1. Successful case — Supplier 1

**Eligible. Ranked first under the brief's stated priorities.**

Clears all seven mandatory requirements. Each verdict carries the quote it rests on, and every numeric comparison shows its arithmetic — the model reported the value, code did the comparison.

| Req | Verdict | Arithmetic | Evidence |
|---|---|---|---|
| MR-1 Liquid/serum capability | pass | *(qualitative)* | "Liquid and serum formulation lines (dropper-fill and pump-fill), cream/lotion lines, and pressed-powder lines. Confirmed experience producing skincare serums…" |
| MR-2 ISO 22716 | pass | `expires 2027-03-11 ≥ as-of 2026-08-09` | "ISO 22716:2007 (Cosmetics GMP) — Certificate No. IN-COS-22716-0341, issued 2024-03-12, valid until 2027-03-11." |
| MR-3 MOQ ≤ 5,000 | pass | `3000 units ≤ 5000 units` | "Minimum order quantity: 3,000 units per SKU for first orders." |
| MR-4 Fail rate ≤ 30% | pass | `22 percent ≤ 30 percent` | "Fail: 6 batches (22%)" |
| MR-5 Lead time ≤ 20 days | pass | `14 calendar days ≤ 20 calendar days` | "Standard manufacturing lead time: 12–14 calendar days… (audited average: 12.6 days across 27 recent production batches)" |
| MR-6 India | pass | `"Mumbai, Maharashtra, India" matches "India"` | "**Location:** Mumbai, Maharashtra, India" |
| MR-7 Cruelty-free | pass | *(qualitative)* | "Signed cruelty-free manufacturing declaration on file (Declaration Ref: CF-2025-0091, dated 2025-01-18)." |

**Worth noting on MR-5.** The document gives a range (12–14 days) *and* an audited mean (12.6). The system takes the upper bound, because the requirement is a maximum and the conservative reading is the worst case — taking 12 would pass a supplier on its best day. That choice is ours, not the document's, and it is declared as an assumption in `docs/INTENDED_USE.md` and the scorecard.

---

## 2. Ambiguous / conflicting case — Supplier 3

**Not eligible. MR-2 returns `conflicting`, and the system refuses to resolve it.**

The document contradicts itself about its own certification, in two different sections:

> **Section A (Compliance Summary):** "Supplier 3 holds current ISO 22716 Cosmetics GMP certification, Certificate No. IN-COS-22716-0288."
>
> **Section D (Facility Audit Appendix):** "ISO 22716 certificate IN-COS-22716-0288 expired 2025-11-01. Renewal audit scheduled, no confirmed renewal date on file."

The recorded conflict note, verbatim from the run:

> "Section A (Compliance Summary) states: 'Supplier 3 holds current ISO 22716 Cosmetics GMP certification, Certificate No. IN-COS-22716-0288.' Section D (Facility Audit Appendix) states: 'ISO 22716 certificate IN-COS-22716-0288 expired 2025-11-01. Renewal audit scheduled, no confirmed renewal date on file.' These two statements conflict regarding whether the certification is current."

**Why this is the interesting case.** Both statements are quoted; neither is chosen. Picking one would mean guessing, and hiding the disagreement from the only person who can resolve it — a buyer who can telephone the supplier and ask. `conflicting` is a first-class verdict for exactly this reason, and it blocks eligibility rather than being silently dropped.

Note also **MR-7 on the same supplier**, which shows the opposite call being made confidently:

> "Cruelty-free declaration referenced in marketing brochure (undated, unsigned) — no formal declaration document on file."

That is a **fail**, not an abstention. A marketing claim offered *in place of* a declaration is positive evidence that no declaration was supplied. Compare with case 3 below, where silence produces an abstention instead. The distinction is deliberate and is enforced in code.

---

## 3. Failure / fallback case — Novaline Personal Care

**Not eligible. Six of seven requirements return `insufficient-evidence` — and not one of them is a fail.**

| Req | Verdict | Evidence cited for the absence |
|---|---|---|
| MR-1 | insufficient-evidence | "Profile states 'general cosmetics manufacturing' with no breakdown of liquid vs. solid vs. powder line capability." |
| MR-2 | insufficient-evidence | "Certification status: **not provided in submitted documentation.** Onboarding packet references 'certifications available on request'…" |
| MR-3 | insufficient-evidence | "Minimum order quantity: **not stated.**" |
| MR-4 | insufficient-evidence | "No audited production batch records were included in this supplier's submission." |
| MR-5 | insufficient-evidence | "Standard manufacturing lead time: **not stated.** Onboarding packet notes 'lead time provided at quotation stage'…" |
| MR-6 | **pass** | "**Location:** Nagpur, Maharashtra, India" |
| MR-7 | insufficient-evidence | "Not addressed in submitted documentation." |

**Why these are not failures.** A missing certificate section does not mean the supplier lacks the certificate — it means they did not send it. Rejecting them for that would be the same unsupported inference as passing them, pointed the other way. The interface says so directly, and lists what to request in order to bring the supplier back into consideration.

**Every abstention still cites something.** The system points at the text that shows the requirement is unaddressed, so a reviewer can confirm the absence rather than take it on trust. One verdict in the whole corpus abstains without a citation; it is disclosed in the scorecard's limitations and asserted against growth.

---

## What these three demonstrate together

| | Supplier 1 | Supplier 3 | Novaline |
|---|---|---|---|
| Outcome | eligible | blocked | blocked |
| Evidence quality | complete | self-contradictory | absent |
| System behaviour | decides, shows arithmetic | surfaces both statements, declines to choose | abstains, says where it looked |
| Who acts next | buyer reviews shortlist | buyer telephones the supplier | buyer requests the missing documents |

The failure modes matter more than the success. A tool that only handles Supplier 1 is a spreadsheet formula. What makes this usable in front of a buyer is that the other two produce a stated, evidenced *"I can't answer that"* instead of a confident guess.

---

## Reproducing this

```bash
npm install
npm run dev          # interface at localhost:3000 — no API key, no login
npm run screen       # re-runs the screen from the committed cache (~1s)
```

Every figure above is in `data/derived/ui-snapshot.json` and is regenerated by `npm run build:snapshot`. The full evaluation, including how these verdicts scored against hand-authored ground truth, is in `eval-results/scorecard.md`.
