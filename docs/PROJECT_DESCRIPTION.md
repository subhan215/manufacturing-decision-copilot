# Project description (Sofstica portal, ≤1,000 characters)

**987 characters.** Paste the block below into the portal's description field.

The criteria PDF frames this field as *"basically Pitch or sell your idea"* and requires four points: what you built, the problem it addresses, how it works, and what you would improve or add with more time. The closing line covers the fourth as forward direction rather than as a list of shortcomings — the limitations are documented honestly in the README, `docs/INTENDED_USE.md` and the scorecard, which is where a judge who wants them will look.

---

A supplier shortlisting copilot for manufacturing sourcing. A buyer has 23 supplier profiles and 7 mandatory requirements; checking them by hand is slow, and a tool that just names a winner is unverifiable.

The core idea: the model reads, the code decides. The LLM never compares a number to a threshold — it reports what a document says and quotes it. Code does the arithmetic and shows it. Every quote is verified byte-for-byte against its source, so a fabricated citation cannot survive.

That pays off twice. Accuracy: 98.1% against 161 hand-authored labels (94 pre-registered before the system existed), 0 critical errors where a rule-based baseline made 12, 100% citation correctness. Interactivity: because every comparison is arithmetic, you can drag a requirement's limit or drop a supplier and all 161 verdicts re-decide in the browser, with no model call.

Next: multi-supplier award optimisation, landed-cost comparison across freight and duties, and independent annotators.

---

## If the portal's counter disagrees

Trim the closing line to *"Next: multi-supplier award optimisation and landed-cost comparison."* (66 characters, saves 51). Do not delete it — point 4 is a mandatory element of this field.

## Numbers, verified

| Figure | Source |
|---|---|
| 23 profiles, 7 requirements, 161 verdicts | `data/derived/ui-snapshot.json` |
| 98.1% accuracy, 94 pre-registered | `eval-results/scorecard.md` |
| 0 critical errors vs. baseline's 12 | `eval-results/scorecard.md` |
| 100% citation correctness | `eval-results/scorecard.md` |
