# Data dictionary

The challenge brief describes the organiser case pack as shipping with a data dictionary. No pack existed, so this corpus is ours — which makes the dictionary ours to write too.

Provenance and licensing are in [`DATA_MANIFEST.md`](DATA_MANIFEST.md). This file describes **shape**: what each file holds and what each field means.

Integrity: [`CHECKSUMS.txt`](CHECKSUMS.txt), verified with `npm run checksums:check`.

---

## Source documents

### `product-brief.md`

The buyer's requirements. One document, read by the model, never hand-parsed.

| Section | Contents |
|---|---|
| Mandatory requirements | MR-1 … MR-7 as a table: identifier, requirement, rationale |
| Ranking priorities | Weights that must sum to 100 — cost 35, lead time 25, quality 25, sustainability 15 |
| Order quantities | 8,000 units at launch, 40,000/quarter at scale |

### `supplier-profiles/*.md` — 23 documents

Every profile carries the same six sections. That uniformity is a **limitation, not a feature** — it flatters pattern-matching approaches and is disclosed as such in the scorecard.

| Section | What it carries | Feeds |
|---|---|---|
| *(title block)* | Name, location, facility type, years operating | MR-6 |
| `## Certifications` | Standard, certificate number, issue and expiry dates | MR-2 |
| `## Manufacturing capability` | Line types, formats produced, programme history | MR-1 |
| `## Order terms` | Minimum order quantity, manufacturing lead time | MR-3, MR-5 |
| `## Quality history` | Audited batch counts, pass/fail split, defect rate | MR-4 |
| `## Sustainability` | Cruelty-free declaration, third-party certifications | MR-7, ranking |
| `## Cost reference` | Average manufacturing cost per unit | Ranking |
| *(after `---`)* | Provenance footer | **Excluded at ingestion** — never model-visible |

Sections vary in wording on purpose. `## Quality history (audited production batches, n=25)` and `## Quality history` normalise to the same slug, and one profile carries an extra `## Production planning notes` section that contradicts its own order terms.

### `paraphrased/*.md` — 3 documents

Reworded versions of three profiles, same facts and different sentences. Used only by the robustness test, which measures how far accuracy drops when phrasing changes. Never part of the main corpus.

---

## Derived files (`derived/`)

Generated once, reviewed, then frozen and committed. Regenerating them is a deliberate act, not a side effect of running the app.

### `requirements.json`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `MR-1` … `MR-7` |
| `title`, `description`, `rationale` | string | As written in the brief |
| `kind` | enum | `numeric-threshold` · `certification` · `categorical-match` · `qualitative` — **selects the evaluation rule** |
| `operator` | enum \| null | `lte` · `gte` · `lt` · `gt` · `eq`; numeric requirements only |
| `threshold` | number \| null | The limit the comparison is made against |
| `unit` | string \| null | `units`, `percent`, `calendar days` |
| `expectedValue` | string \| null | Categorical target, e.g. `India` |
| `certificationName` | string \| null | e.g. `ISO 22716 (Cosmetics GMP)` |

A 16-character hash of this array is the **requirements version**, stamped onto every screen, snapshot and evaluation bundle. A mismatch means an artifact was built against different requirements, and the checks fail rather than silently comparing incomparable runs.

### `gold-labels.json` — 161 labels

| Field | Type | Meaning |
|---|---|---|
| `supplierId`, `requirementId` | string | Together, the key |
| `expected` | enum | `pass` · `fail` · `conflicting` · `insufficient-evidence` |
| `alsoAcceptable` | enum[] | Verdicts a competent reviewer could also defend. Used only where the document is genuinely ambiguous |
| `provenance` | enum | `pre-registered` (94, written before any AI system existed) · `post-hoc` (67, written after seeing output) |
| `rationale` | string | Why, in words, usually quoting the document |

Accuracy is reported separately for the two provenance subsets. The pre-registered figure is the one that cannot be flattered by hindsight.

### `reference-values.json` — 4 suppliers

Hand-read values for the eligible suppliers, used to measure extraction error independently of the model.

| Field | Meaning |
|---|---|
| `cost.value` | Unit cost, with the `quote` it came from |
| `leadTime.min` / `.max` | A **range**, because documents sometimes state one. Any value inside it scores as correct |
| `leadTime.ambiguity` | Present when several readings are defensible, naming each one |
| `failRate.value` | Inspection fail rate, percent |
| `sustainabilityPoints.value` | 1 for a cruelty-free declaration, +1 per third-party certification — excluding the mandatory GMP certification, which every eligible supplier holds by definition |

### `ui-snapshot.json`

A complete frozen analysis run. This is what the interface reads, which is why the app needs no API key and no login. Holds the screen, ranking signals, near-miss signals, sensitivity report, scenario report, cited chunk texts, evaluation highlights, the ingestion audit, assumptions and limitations. Regenerate with `npm run build:snapshot`.

---

## Identifiers

**Supplier id** is the filename stem: `supplier-08-meridian-beauty-manufacturing`. Stable, human-readable, and the join key across every derived file.

**Chunk id** is `{docId}#s{seq}-{slug}` — `supplier-03#s01-certifications`. `seq` is the two-digit section order, `slug` the normalised heading. This is what a citation points at.

**Offsets** are UTF-16 indices into the *normalised* document text (BOM stripped, CRLF→LF, NFC) — never byte offsets on disk. Citation verification is `doc.text.slice(start, end) === quote`, so anything that shifts a character shifts every offset after it. The repo pins `* text=auto eol=lf` in `.gitattributes` for exactly this reason: without it, Git's Windows default rewrites line endings on clone and silently breaks every citation past line 1.

---

## Verdict statuses

| Status | Meaning | Blocks eligibility |
|---|---|---|
| `pass` | Evidence satisfies the requirement | no |
| `fail` | Evidence contradicts the requirement | yes |
| `conflicting` | The document contradicts *itself*. Both statements are surfaced, neither is chosen | yes |
| `insufficient-evidence` | The document does not address it. Absence of evidence, not evidence of absence | yes |

The distinction between `fail` and `insufficient-evidence` is load-bearing. A marketing claim offered in place of a certificate is a `fail` — positive evidence that no certificate was supplied. A missing certifications section is `insufficient-evidence` — the supplier may hold the certificate and simply not have sent it. Rejecting them for that would be the same unsupported inference as passing them, pointed the other way.
