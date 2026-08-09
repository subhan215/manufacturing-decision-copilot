# Demo video script

Target: **4 minutes**. Under 5 either way — judges watch a lot of these.

Record with `npm run dev` at http://localhost:3000. Nothing on the page needs a Claude Code login except the fresh run at the end, so it will just work.

**Before you hit record**

- Close other tabs, browser zoom at 100%, window reasonably wide (the eligibility grid has 23 rows).
- Do one dry pass so you know where each control is. The demo is now mostly *interaction*, so fumbling for a slider costs more than it used to.
- Say the numbers out loud. Nobody reads them off the screen.
- **Decide the ending now**: a fresh run takes about 25 seconds per supplier and there are 23 of them, so you cannot show a full one. Plan to start it, show two or three suppliers arriving live, and stop.

---

## 0:00 — What this is (20s)

*On screen: top of the page — safety banner and metric strip.*

> "This is a supplier shortlisting copilot for manufacturing sourcing. A buyer has a product brief with seven mandatory requirements and twenty-three supplier profiles."

*Point at the metric strip.*

> "Four eligible out of twenty-three. All citations verified. Ninety-eight percent against hand-written ground truth. And sixteen verdicts it refuses to decide and hands to a person — that last number is the one I care about most."

---

## 0:20 — The idea everything is built on (35s)

*Scroll to the eligibility screen. Hover a cell to show the comparison string.*

> "One decision drives the whole architecture: the model reads, the code decides."
>
> "The language model never compares a number to a threshold. It reads the document and reports what it found, with a quote. Whether that number clears the limit is decided by an if-statement — and you can see the arithmetic: five thousand units, less than or equal to five thousand units. This supplier sits exactly on the limit, and that's settled by an operator, not by a model's judgement on a borderline case."

---

## 0:55 — Why that matters: move the limit (45s)

**This is the strongest thirty seconds in the demo. Don't rush it.**

*Drag the MOQ slider from 5,000 upward.*

> "And because the comparison is arithmetic, I can change the buyer's limit and everything re-decides — in the browser, with no model call at all. Nothing is re-read. These are the same verdicts, against a different rule."

*Point at a cell that flipped, then at the count.*

> "Cells that moved are marked, and the brief's own value stays pinned on the slider, so a relaxed screen can never be mistaken for the one the brief actually asked for. Four eligible becomes six."

*Drag it back, or click "Reset to the brief".*

> "This is what buying the architecture gets you. If the model had been doing the comparison, every one of those would have been a fresh API call — and a chance to get it wrong."

---

## 1:40 — The three required cases (55s)

*Click Supplier 3's MR-2 cell — the drawer opens.*

> "Supplier 3's document contradicts itself. Its compliance summary says the ISO 22716 certificate is current; its audit appendix, further down the same document, says it expired in November 2025. The system quotes both and refuses to pick one — resolving it would mean guessing, and hiding the disagreement from the one person who can phone the supplier."

*Point at the highlighted quote in its section.*

> "Every verdict cites its source, and the quote is highlighted inside the section it came from. These are verified in code — we take the character offsets and check the quote matches the source exactly. Across a hundred and sixty-one verdicts: zero hallucinated quotes."

*Scroll to Novaline, supplier 13 — the row of N/A cells.*

> "And when the data simply isn't there, it abstains. Four of seven requirements have nothing to go on. Note it's not a fail — a missing certificate section doesn't mean the supplier lacks the certificate, it means they didn't send it."

---

## 2:35 — Ranking and its stability (35s)

*Drag a ranking weight slider.*

> "The ranking is live too, recomputed in the browser using the same scoring code the evaluation ran against — so what you see here and what's in the scorecard can't drift apart."

*Point at stability intervals and the win-probability bars.*

> "This says how far each priority can move before the winner changes, and across two thousand random weightings, how often each supplier comes out on top."

*Scroll up briefly to the counter-explanation panel.*

> "And this panel is always on. It argues against the recommendation. Automation bias is real — people under-scrutinise confident recommendations — so the tool makes its own case harder."

---

## 3:10 — Supply risk (30s)

*Change the "supplier unavailable" dropdown to Supplier 1, then drag the slip slider.*

> "Second track: what happens when the plan stops working. Take the recommended supplier out and someone else takes over. Slip every lead time by twenty-five percent and four eligible suppliers become two — the ones quoting close to the limit have no room."

*Point at a caveat sitting next to a saving figure.*

> "And where a scenario shows a saving, the caveat sits right next to it — that cheaper supplier excludes freight and customs from its own quote, so it isn't a landed saving. A number like that gets acted on."

---

## 3:40 — Run it for real (20s)

*Scroll to "Run the pipeline". Press **Replay from cache** first.*

> "All of that reads a frozen analysis, which is why this runs with no API key. Replay serves every call from a committed cache — a hundred and sixty-one verdicts in about a second, which is what makes the numbers reproducible."

*Press **Fresh run**. Let two or three suppliers arrive, then stop.*

> "And this is the real thing — cache bypassed, calling the model. About twenty-five seconds a supplier. Each verdict arrives with its quote and a label saying whether it was decided in code or by the model."

---

## 4:00 — Close (15s)

> "It's honest about what it gets wrong too. Three errors in a hundred and sixty-one, all the same bug: it reports a conflict when a document gives different values for different sites or product lines, instead of picking the one that applies. That's written up in the repo, and it's the first thing I'd fix."

Stop recording. No outro.

---

## Notes

- **Show the running app, not slides.** The brief asks for a working prototype; a video of a working thing is the proof.
- **The interaction is the demo.** The sliders at 0:55 and the fresh run at 3:40 are what separate this from a report generator. If you have to cut something, cut narration, not those.
- **The three required cases are non-negotiable** — success, conflicting, fallback. They're an explicit deliverable, so name each one as it appears.
- **Don't claim the fresh run is fast.** It isn't, and the panel says so. The honest framing — replay for reproducibility, fresh run for proof — is stronger than pretending either does the other's job.
- If you fluff a line, keep going and re-record that section. Cutting beats restarting.
- Upload unlisted to YouTube or Loom, then paste the link into the portal.
