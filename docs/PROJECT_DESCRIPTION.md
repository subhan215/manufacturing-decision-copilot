# Project description (Sofstica portal, ≤1,000 characters)

Paste the block below into the portal's description field.

---

A supplier shortlisting copilot for manufacturing sourcing. A buyer has 23 supplier profiles and 7 mandatory requirements; working out who qualifies is slow, and a tool that just names a winner is unverifiable.

The core idea: the model reads, the code decides. The LLM never compares a number to a threshold — it reports what a document says and quotes it. Code does the arithmetic and shows it. Every quote is verified byte-for-byte against the source, so a fabricated citation cannot survive.

Result: 98.1% accuracy against 161 hand-authored labels (94 pre-registered before the system existed), 0 critical errors against a rule-based baseline's 12, 100% citation correctness, 0 hallucinations. It also plans for disruption — what a requirement costs, who takes over if the top supplier can't deliver.

Next: fix conflict over-reporting, get a second annotator, and test on real supplier PDFs rather than a corpus I wrote.
