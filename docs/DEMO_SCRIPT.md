# Demo video script

**Target: 4 minutes.** Under 5 either way — judges watch a lot of these.

Every number below was verified against the committed snapshot on 2026-08-09. Where a figure appears in **bold**, it is what the screen will actually show. If something differs when you record, trust the screen and say what you see.

## Before you press record

- `npm run dev` → http://localhost:3000. Nothing needs a login except the fresh run at the end.
- Browser at 100% zoom, window wide — the eligibility grid is 23 rows.
- **Do one dry pass.** This demo is mostly interaction now; fumbling for a slider costs more than a fluffed line.
- **Plan the ending.** A fresh run is ~25s per supplier × 23. You cannot show a whole one. Start it, let two or three suppliers land, stop.
- Say numbers out loud. Nobody reads them off the screen.

---

## 0:00 — What this is · 20s

*Top of page: safety banner, metric strip.*

> "A supplier shortlisting copilot for manufacturing sourcing. The buyer has a product brief with seven mandatory requirements, and twenty-three supplier profiles to get through."

*Point along the metric strip.*

> "**Four eligible out of twenty-three.** Every citation verified. **Ninety-eight point one percent** against hand-written ground truth. And **sixteen verdicts** it refuses to decide and hands to a person — that last one is the number I care about most."

---

## 0:20 — The idea everything is built on · 30s

*Scroll to the eligibility screen. Hover **Coastal Wellness Manufacturing**, column MR-3.*

> "One decision drives the whole architecture: the model reads, the code decides."
>
> "The language model never compares a number to a threshold. It reads the document, reports what it found, and quotes it. Whether that number clears the limit is an if-statement — and you can see the arithmetic."

*The tooltip reads `5000 units ≤ 5000 units`.*

> "**Five thousand units, less than or equal to five thousand.** This supplier sits exactly on the limit, and that's settled by an operator — not by a model's judgement on a borderline case."

---

## 0:50 — Move the limit · 50s

**This is the strongest minute in the demo. Take your time.**

*Drag the **fail-rate** slider from 30 upward, slowly, to about 39.*

> "And because the comparison is arithmetic, I can move the buyer's limit and everything re-decides — in the browser, with no model call at all. Nothing is re-read. Same evidence, different rule."

*At 39: **Supplier 5** enters, count goes **4 → 5**.*

> "**Four eligible becomes five.** Supplier 5 was blocked by a thirty percent quality ceiling and sits at thirty-nine. Cells that moved are marked, and the brief's own value stays pinned on the slider — so a relaxed screen can never be mistaken for the one the brief actually asked for."

*Reset. Now drag **MOQ** up to 6,000 — nothing happens.*

> "Not every constraint is costing you something. Raise the order-quantity limit and nothing moves at all — everyone blocked by it is blocked by something else too."

*Now, leaving MOQ at 6,000, drag **lead time** to 21.*

> "But move a second one as well — and **Anantara Formulations** appears. Neither limit alone was the obstacle. It needed both, and you'd never find that by asking one question at a time."

---

## 1:40 — The three required cases · 55s

*Click **Supplier 3**, column MR-2. Drawer opens.*

> "Supplier 3's document contradicts itself. Its compliance summary says the ISO 22716 certificate is current; its audit appendix, further down the same document, says it expired in November 2025. The system quotes both and refuses to choose — resolving it would mean guessing, and hiding the disagreement from the one person who can phone the supplier."

*Point at the highlighted quote inside its section.*

> "Every verdict cites its source, highlighted inside the section it came from. These are verified in code — we take the character offsets and check the quote matches the source exactly. Across a hundred and sixty-one verdicts: **zero hallucinated quotes**."

*Scroll to **Novaline Personal Care** — the long row of N/A cells.*

> "And when the data isn't there, it abstains. **Six of seven requirements** have nothing to go on. Note it's not a fail — a missing certificate section doesn't mean the supplier lacks the certificate. It means they didn't send it."

---

## 2:35 — Ranking and how much to trust it · 30s

*Drag a ranking weight slider.*

> "The ranking is live too, recomputed in the browser with the same scoring code the evaluation ran against — so what you see here and what's in the scorecard can't drift apart."

*Point at the stability intervals, then the win-probability bars.*

> "This says how far each priority can move before the winner changes. And across two thousand random weightings, how often each supplier comes out on top."

*Scroll up to the counter-explanation panel.*

> "This panel is always on, and it argues against the recommendation. Automation bias is real — people under-scrutinise confident recommendations — so the tool makes its own case harder."

---

## 3:05 — Supply risk · 30s

*Set **Supplier unavailable → Supplier 1**.*

> "Second track: what happens when the plan stops working. Take the recommended supplier out, and **Nirvaan Skin Sciences** takes over."

*Reset that, then drag the **slip** slider to 25%.*

> "Slip every lead time by twenty-five percent and **four eligible suppliers become two**. The ones quoting close to the limit have no room."

*Point at a caveat sitting beside a saving figure.*

> "And where a scenario shows a saving, the caveat sits right next to it — that cheaper supplier excludes freight and customs from its own quote, so it isn't a landed saving. A number like that is exactly what gets acted on."

---

## 3:35 — Run it for real · 20s

*Scroll to "Run the pipeline". Press **Replay from cache**.*

> "Everything so far reads a frozen analysis — that's why this runs with no API key. Replay serves every call from a committed cache: a hundred and sixty-one verdicts in about a second, which is what makes these numbers reproducible on anyone's machine."

*Press **Fresh run**. Let two or three suppliers arrive. Stop.*

> "And this is the real thing — cache bypassed, calling the model, about twenty-five seconds a supplier. Each verdict arrives with its quote and a label saying whether it was decided in code or by the model."

---

## 3:55 — Close · 15s

> "It's honest about what it gets wrong, too. Three errors in a hundred and sixty-one, all the same bug: it reports a conflict when a document gives different values for different sites or product lines, instead of picking the one that applies. That's written up in the repo, and it's the first thing I'd fix."

Stop recording. No outro.

---

## Verified figures

| Claim | Value |
|---|---|
| Eligible | 4 of 23 |
| Citation correctness / hallucinations | 100% / 0 |
| Accuracy vs. gold (pre-registered) | 98.1% (96.8%) |
| Verdicts needing a person | 16 of 161 |
| On the MOQ limit exactly | Coastal Wellness Manufacturing, `5000 ≤ 5000` |
| Fail rate 30 → 39 | 4 → 5, **Supplier 5** enters |
| Lead time 20 → 25 | 4 → 5, **EcoDerm Naturals** enters |
| MOQ 6,000 alone | no change |
| Lead time 21 alone | no change |
| MOQ 6,000 **+** lead time 21 | 4 → 5, **Anantara Formulations** enters |
| Novaline abstentions | 6 of 7 |
| Supplier 1 unavailable | Nirvaan Skin Sciences takes over |
| Lead times slip 25% | 4 → 2 (Supplier 1, Nirvaan) |
| Fresh run pace | ~19–26s per supplier |

## Notes

- **The interaction is the demo.** The sliders at 0:50 and the fresh run at 3:35 are what separate this from a report generator. Cut narration before you cut those.
- **The two-slider moment at 1:20 is the best thing in the video.** It shows a finding that only exists because recompute is instant — no single limit was the obstacle. Don't rush past it.
- **The three required cases are non-negotiable** — success, conflicting, fallback. Name each as it appears; they're an explicit deliverable.
- **Don't oversell the fresh run.** It's slow, and the panel says so. Replay for reproducibility, fresh run for proof — that framing is stronger than pretending either does the other's job.
- Fluffed a line? Keep going, re-record that section. Cutting beats restarting.
- Upload unlisted to YouTube or Loom, paste the link into the portal.
