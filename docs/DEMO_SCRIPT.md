# Demo video script

Target: **4 minutes**. Under 5 either way — judges are watching a lot of these.

Record with `npm run dev` at http://localhost:3000. Nothing needs a Claude Code login, so the app will just run.

**Before you hit record:** close other tabs, set browser zoom to 100%, and do one dry pass so you know where things are. Say the numbers out loud rather than expecting anyone to read them off the screen.

---

## 0:00 — What this is (20s)

*On screen: the app, top of page.*

> "This is a supplier shortlisting copilot for manufacturing sourcing. A buyer has a product brief with seven mandatory requirements and twenty-three supplier profiles. The tool works out who qualifies, ranks the survivors, and — the part I care about — shows its evidence for every single call it makes."

Scroll slowly through the page once so people see the shape of it. Don't stop yet.

---

## 0:20 — The idea the whole thing is built on (30s)

*On screen: the eligibility matrix.*

> "One design decision drives everything here. The model reads, the code decides."
>
> "The language model never compares a number to a threshold. It reads a document and reports what it found, with a quote. Whether that number clears the limit is decided by an if-statement."

*Hover a verdict to show the comparison string, e.g. `5000 units ≤ 5000 units`.*

> "So this supplier sits exactly on the five-thousand-unit ceiling. That's decided by an operator, not by a model's judgement on a borderline case — and you can see the arithmetic."

---

## 0:50 — Case 1: the successful one (30s)

*On screen: the decision header, Supplier 1.*

> "Supplier 1 clears all seven requirements and ranks first."

*Open the evidence drawer on one of its verdicts.*

> "Every verdict cites its source, and the quote is highlighted inside the section it came from. These citations are verified in code — we take the character offsets and check the quote matches the source exactly. If it doesn't match, the verdict gets downgraded. Across a hundred and sixty-one verdicts: zero hallucinated quotes."

---

## 1:20 — Case 2: the conflicting one (40s)

*On screen: Supplier 3, MR-2.*

> "This is the case I like most. Supplier 3's own document contradicts itself."

*Show the conflict note with both statements.*

> "Its compliance summary says the ISO 22716 certificate is current. Its audit appendix, further down the same document, says that certificate expired in November 2025. The system quotes both and refuses to pick one."
>
> "That's deliberate. Resolving it would mean guessing, and hiding the disagreement from the one person qualified to sort it out — which is a buyer picking up the phone."

---

## 2:00 — Case 3: the fallback (25s)

*On screen: Novaline, supplier 13.*

> "And when the data simply isn't there, it says so. Four of seven requirements have nothing to go on, so it abstains and points at where it looked."
>
> "Note it's not a fail. A missing certificate section doesn't mean the supplier lacks the certificate — it means they didn't send it. Absence of evidence isn't evidence of absence, and the difference matters when you're about to reject a supplier."

---

## 2:25 — Sensitivity: how much to trust the ranking (40s)

*On screen: the ranking panel. Drag the cost slider.*

> "The ranking is live. Drag a priority and everything recomputes in the browser — using the same scoring code the evaluation ran against, so what you see here and what's in the scorecard can't drift apart."

*Point at the stability intervals.*

> "This tells you how far each priority can move before the winner changes. And across two thousand random weightings, here's how often each supplier comes out on top."

*Scroll to the counter-explanation panel.*

> "This panel is always on. It argues against the recommendation — who's cheaper, where the winner is weak, how small a change flips it. Automation bias is real: people under-scrutinise confident recommendations. So the tool makes its own case harder."

---

## 3:05 — Track 3: when the plan stops working (35s)

*On screen: the supply-risk panel.*

> "The second track asks what happens when things move. What does each requirement actually cost you — there's a supplier thirteen dollars a unit cheaper, blocked only by the India-only rule."

*Point at the caveat under it.*

> "And right next to that saving: their own document says freight and customs are excluded, so it isn't a landed saving. A number like that gets acted on, so the caveat sits beside it, not in a footnote."
>
> "Also here: who takes over if the top supplier can't deliver, what a twenty-five percent lead-time slip does — it takes four eligible suppliers down to two — and whether you can split the order, with minimum order quantities enforced and concentration measured properly."

---

## 3:40 — Does it actually work (20s)

*On screen: `eval-results/scorecard.md` in an editor, or the integrity panel in the app.*

> "Ninety-eight point one percent against a hundred and sixty-one hand-written labels — ninety-four of which were written down before the system existed. Zero critical errors. The rule-based baseline, which does negation detection and date arithmetic properly, made twelve."
>
> "Two hundred and forty-one assertions across ten suites, and the whole thing reproduces from a committed cache with no API key and no login."

---

## 4:00 — Close (10s)

> "It's honest about what it gets wrong, too. Three errors, all the same bug: it reports a conflict when a document gives different values for different sites or product lines, instead of picking the one that applies. That's written up in the repo and it's the first thing I'd fix."

Stop recording. Don't add an outro.

---

## Notes

- **Don't read the numbers off a slide.** Show the running app. The brief asks for a working prototype, and a video of a working thing is the proof.
- **If you fluff a line, keep going and re-record that section.** Cutting is faster than restarting.
- **The three required cases are non-negotiable** — success, conflicting, fallback. They're an explicit deliverable, so make sure all three are clearly on screen and named.
- Upload unlisted to YouTube or Loom, then paste the link into the portal.
