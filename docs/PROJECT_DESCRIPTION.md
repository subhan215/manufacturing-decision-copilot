# Project description (Sofstica portal, ≤1,000 characters)

**987 characters.** Paste the block below into the portal's description field.

Covers the four points the checklist requires: what was built, the problem, how it works, and what more time would go on.

---

A supplier shortlisting copilot for manufacturing sourcing. A buyer has 23 supplier profiles and 7 mandatory requirements; checking them by hand is slow, and a tool that just names a winner is unverifiable.

The core idea: the model reads, the code decides. The LLM never compares a number to a threshold — it reports what a document says and quotes it. Code does the arithmetic and shows it. Every quote is verified byte-for-byte against its source, so a fabricated citation cannot survive.

That pays off twice. Accuracy: 98.1% against 161 hand-authored labels (94 pre-registered before the system existed), 0 critical errors where a rule-based baseline made 12, 100% citation correctness. Interactivity: because every comparison is arithmetic, you can drag a requirement's limit or drop a supplier and all 161 verdicts re-decide in the browser with no model call.

Next: fix conflict over-reporting, get a second annotator, and test on real supplier PDFs rather than a corpus I wrote.

---

## If the portal's limit turns out to be tighter

Cut the last paragraph first — "what you would improve" is a required point, so replace it rather than dropping it: *"Next: fix conflict over-reporting and test on real supplier PDFs."* (73 characters, saves 47.)

## Numbers, verified

| Figure | Source |
|---|---|
| 23 profiles, 7 requirements, 161 verdicts | `data/derived/ui-snapshot.json` |
| 98.1% accuracy, 94 pre-registered | `eval-results/scorecard.md` |
| 0 critical errors vs. baseline's 12 | `eval-results/scorecard.md` |
| 100% citation correctness | `eval-results/scorecard.md` |
