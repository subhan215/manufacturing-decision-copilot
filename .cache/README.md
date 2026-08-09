# Model response cache

The JSON files in `llm/` are recorded responses from the model calls this
project makes. They are committed on purpose.

## Why they are in the repository

Every AI call in this project runs through the local Claude Code CLI rather than
a paid API key. That is a real constraint: without these files, nobody could
reproduce our results without their own authenticated Claude Code installation,
and the evaluation numbers in `eval-results/` would have to be taken on trust.

With them, a reviewer can clone this repository and run

```bash
npm run screen      # eligibility screening, 13 suppliers
npm run rank        # ranking and sensitivity analysis
npm run baseline    # comparison against a rule-based baseline
npm run eval        # the full evaluation harness
```

and reproduce every reported figure with **no Claude Code, no API key and no
network access**. The interface is served from a separate frozen snapshot
(`data/derived/ui-snapshot.json`) and likewise needs neither.

## How the cache works

Each file is named for the SHA-256 of everything that could change the answer:
the model, the system prompt, the user prompt and the output schema. Editing any
of those produces a different key and therefore a miss, so a stale response can
never be served for a changed question.

Returned data is re-validated against its schema on read, so a corrupted or
hand-edited entry is discarded rather than trusted.

## Running against the live model instead

```bash
MDC_NO_LLM_CACHE=1 npm run screen
```

This bypasses the cache entirely and makes real calls. It requires Claude Code
to be installed and authenticated (`claude login`). Results may differ slightly
from the recorded ones — model outputs are not perfectly deterministic, which is
precisely why the recorded run is frozen here.

## What this does not do

Committing responses freezes one run; it does not demonstrate that the system
behaves identically on a different day or a different model version. The
evaluation bundle states the model and date the recorded run used, and
`eval-results/scorecard.md` lists the limitations of what these numbers
establish.
