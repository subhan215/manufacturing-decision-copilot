# Data Manifest — AI Manufacturing Decision Copilot (Track 1: Supplier Shortlisting)

This manifest documents every data source used to build and evaluate this prototype, per the challenge brief's requirement to disclose sources, retrieval dates, and how each input influenced the result.

## 1. Real external source

| Field | Value |
|---|---|
| Dataset | "Supply Chain Dataset" |
| Publisher / author | Kaggle user `amirmotefaker` |
| URL | https://www.kaggle.com/datasets/amirmotefaker/supply-chain-dataset |
| Retrieved | 2026-08-08 |
| Format | Single CSV, 100 rows (1 header + 100 data rows), 24 columns |
| Local copy | `data/raw/supply_chain_data.csv` (frozen at retrieval; not re-downloaded during development or judging) |
| Licence | As published on the Kaggle dataset page at retrieval date (see dataset page for current terms) |
| Fields used | `Supplier name`, `Location`, `Manufacturing lead time`, `Manufacturing costs`, `Inspection results`, `Defect rates`, `Production volumes`, `Product type` |
| Fields NOT used | Pricing/SKU/demand fields not relevant to eligibility screening (`Price`, `Revenue generated`, `Customer demographics`, `Stock levels`, `Number of products sold`, shipping/route fields) |

### How this source was used
The CSV contains 5 real suppliers ("Supplier 1" through "Supplier 5"), each with multiple SKU-level rows. For each of these 5 suppliers, we aggregated the SKU-level rows into supplier-level statistics (mean manufacturing lead time, mean manufacturing cost, inspection Pass/Fail/Pending rate, mean defect rate). These aggregates are reported verbatim (with computation shown) in `data/supplier-profiles/supplier-01.md` through `supplier-05.md`.

**This dataset does not contain**: certifications, minimum order quantities, cruelty-free/sustainability declarations, or facility country/location beyond an Indian city name. These fields were not available from any real source for this hackathon and were therefore synthesized — see Section 2.

## 2. Synthetic / derived content

The following were authored specifically for this hackathon and are **not** real company data:

1. **Product brief** (`data/product-brief.md`) — a fictional product ("Botanical Renewal Vitamin C Face Serum" for a fictional brand "SkinLumen Cosmetics") with mandatory requirements (MR-1 through MR-7) and ranking-priority weights, designed to exercise the eligibility-screening and ranking logic the challenge requires.
2. **Certifications, MOQ, sustainability declarations, and free-text narrative** added to supplier-01 through supplier-05's profiles, layered on top of the real CSV-derived statistics for those 5 suppliers.
3. **8 additional fully synthetic suppliers** (supplier-06 through supplier-13), invented to create a realistic and pedagogically useful spread of eligibility outcomes:
   - `supplier-06-vantage-cosmo-labs.md` — clean pass on all mandatory requirements (comparison candidate against Supplier 1).
   - `supplier-07-glowcraft-industries.md` — fails MR-1 (no liquid/serum line).
   - `supplier-08-meridian-beauty-manufacturing.md` — fails MR-6 (facility outside India), otherwise a strong candidate — used to test that the system doesn't silently drop a good supplier without explaining *why*.
   - `supplier-09-sunrise-personal-care.md` — fails MR-3 (MOQ of 20,000 units exceeds the ≤5,000 requirement).
   - `supplier-10-ecoderm-naturals.md` — fails MR-5 (25-day lead time exceeds the 20-day requirement).
   - `supplier-11-prakriti-formulations.md` — fails MR-2; deliberately includes an unverified marketing claim ("GMP-compliant") with no actual ISO 22716 certificate number, to test whether the system correctly refuses to treat marketing language as a verified certification.
   - `supplier-12-coastal-wellness-manufacturing.md` — passes every mandatory requirement, but narrowly (at or just inside every threshold) — used to demonstrate threshold transparency.
   - `supplier-13-novaline-personal-care.md` — missing data for MR-2 through MR-5 entirely — used as the required "failure/fallback case," to demonstrate the system abstains from a determination rather than guessing.
   - `supplier-03.md` (real-CSV-derived) — additionally engineered with **internally conflicting certification-status statements** between two sections of its own document, used as the required "ambiguous/conflicting case."

4. **10 adversarial suppliers (`supplier-14` through `supplier-23`)**, added after the initial system was complete and measured. Their purpose is different from suppliers 06–13: those were authored to produce a readable spread of outcomes, these were authored to *probe specific ways document-reading can go wrong*. Each one encodes at least one named failure mode, listed below.

**Every verdict in the table below was recorded here before these documents were shown to any AI system**, in the same manner as the section-2 outcomes above, and is carried into `data/derived/gold-labels.json` tagged `pre-registered`. This is the control that makes the resulting accuracy figure meaningful: the author could not have been anchored by output that did not yet exist. Where the decision rules admit a second defensible answer, that answer is recorded in `alsoAcceptable` rather than being quietly widened later.

| Supplier | Failure mode probed | MR-1 | MR-2 | MR-3 | MR-4 | MR-5 | MR-6 | MR-7 |
|---|---|---|---|---|---|---|---|---|
| 14 Anantara Formulations | Unit conversion: MOQ quoted in cases (500 × 12 = 6,000 units), lead time quoted in weeks (3 weeks = 21 days). Reading either figure at face value flips both verdicts. | pass | pass | **fail** | pass | **fail** | pass | pass |
| 15 Rathore Cosmetic Works | Date arithmetic: a real ISO 22716 certificate number and issuing record, expired 2025-03-31 against an as-of date of 2026-08-09. Also a genuinely weak supplier on two other counts. | pass | **fail** | pass | **fail** | **fail** | pass | **insufficient-evidence** |
| 16 Bluepeak Skincare Solutions | Near-miss standard: holds ISO 9001 and ISO 14001 with current certificate numbers, but not ISO 22716. Also an environmental policy offered where a cruelty-free declaration is required. | pass | **insufficient-evidence** | pass | pass | pass | pass | **insufficient-evidence** |
| 17 Sahyadri Beauty Group | Entity scope: a valid certificate held by a sister site, explicitly not issued for the unit being quoted. | pass | **insufficient-evidence** *(also acceptable: fail)* | **fail** | pass | pass | pass | pass |
| 18 Trilok Personal Care | Internal contradiction: order terms state a 16-day lead time, production notes state 26 days for serum formats specifically. | pass | pass | pass | pass | **conflicting** | pass | pass |
| 19 Kanan Naturals | Two at once — a certification claim with no certificate record, and three MOQs by product format where the applicable one (serums, 12,000) is not the smallest on the page. | pass | **fail** | **fail** | pass | pass | pass | pass |
| 20 Meghdoot Labs | Metric inversion: quality stated as a 68% acceptance rate, which must be inverted to a 32% fail rate. Capability is solid-format only, stated without the word "liquid" appearing as a negation. | **fail** | pass | pass | **fail** | pass | pass | pass |
| 21 Vasanth Bio Cosmetics | Attribute attached to the wrong entity: an Indian registered head office, a Sri Lankan manufacturing facility. The requirement is about where production happens. | pass | pass | pass | pass | pass | **fail** | pass |
| 22 Ashvattha Wellness | Favourable-end bias: lead time given as a range of 18–24 days, where only the lower bound satisfies the limit. Also a regulatory-compliance statement offered in place of a cruelty-free declaration. | pass | pass | pass | pass | **fail** *(also acceptable: insufficient-evidence)* | pass | **insufficient-evidence** *(also acceptable: fail)* |
| 23 Nirvaan Skin Sciences | Control case, and the one that must **not** trip: every figure stated twice, once in a table and once in prose, in agreement. A system that flags consistent restatement as a conflict fails here. | pass | pass | pass | pass | pass | pass | pass |

**What this addition does and does not change.** It takes the corpus from 13 suppliers and 91 labels to 23 and 161, and pre-registered labels from 24 to 94 — from roughly a quarter of the ground truth to well over half. Labels the system can actually get wrong (fail, insufficient-evidence, conflicting) rise from 21 to 39, and the two rarest classes roughly double. It does **not** materially change the majority-class rate: a system answering "pass" to everything scored 77% before and would score about 76% after, because realistic supplier documents satisfy most requirements. That number could have been forced down by inventing suppliers that fail four criteria each, and was not, because it would mean shaping the corpus to flatter a summary statistic.

## 3. Case-to-requirement mapping (for the 3 required demo cases)

| Required demo case | Supplier(s) used | What it demonstrates |
|---|---|---|
| Successful case | Supplier 1, Vantage Cosmo Labs (06), Coastal Wellness (12) | Full eligibility screen pass/fail per constraint, ranked output, citations, sensitivity to priority-weight changes |
| Ambiguous / conflicting case | Supplier 3 | System must surface the certification-status conflict between two document sections rather than silently picking one |
| Failure / fallback case | Novaline Personal Care (13) | System must abstain from an eligibility determination when data needed for a mandatory requirement is simply absent, rather than hallucinating a pass or fail |

## 4. Data hygiene control (evaluation-integrity transformation)

**This section is part of the transformation log and documents an edit made to the corpus after its initial authoring.**

When first written, several supplier profiles carried provenance footers that stated the expected evaluation outcome outright (for example, "intentionally designed to fail the MOQ requirement"), and two profiles editorialized the intended conclusion inside evidence sections. One profile referenced this project's internal requirement identifier `MR-6` — an identifier no real supplier document would contain.

Left in place, that text would constitute **label leakage**: the model could read the expected verdict directly from the evidence instead of reasoning from the underlying facts, and every accuracy, citation-coverage, and hallucination metric reported for this prototype would be measuring nothing.

Two corrections were applied:

1. **Source files edited.** All 13 supplier-profile footers were normalized to state only derivation and licensing provenance. The `supplier-08` location note was rewritten as a neutral logistics fact (facility located in Ho Chi Minh City, Vietnam; production lead time excludes export freight). The editorializing sentences in `supplier-03` and `supplier-11` `## Certifications` were removed, leaving the underlying contradictory and incomplete evidence intact so that detecting the conflict and the missing certification record remains the system's task.
2. **Structural controls at ingestion.** Document discovery uses an explicit allowlist (`data/product-brief.md` and `data/supplier-profiles/*`) rather than a recursive glob, so **this manifest — which contains the case-to-requirement mapping in Section 3 and therefore functions as an answer key — is unreachable from the evidence corpus by construction, not by filtering.** Post-horizontal-rule provenance regions are excluded uniformly across all 13 profiles (not selectively from the ones that leaked, which would itself be label-dependent preprocessing), and a content scan fails the build if any answer-revealing phrase survives into model-visible text.

Excluded content is retained in an audit report with rule identifiers and excerpts, so a reviewer can see exactly what was withheld from the model and why. Nothing is hidden from human review; only from the model's input.

## 5. What this data does NOT establish

Consistent with the challenge brief's boundaries: none of this data proves live supplier availability, pricing, capacity, or compliance. All supplier profiles are either derived from a public, non-supplier-specific dataset or entirely fictional, constructed for the purpose of exercising and evaluating the prototype's reasoning, citation, and eligibility-screening logic. No real supplier, certification body, or company is represented.
