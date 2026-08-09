import type { UiSnapshot } from "@/lib/snapshot";

/**
 * Reasons this recommendation could be wrong.
 *
 * Deliberately placed beside the recommendation rather than in a footer.
 * Detailed supporting evidence reliably raises a reader's trust whether or not
 * that trust is warranted — and the effect is stronger, not weaker, for people
 * with domain expertise. The documented counterweight is to surface
 * disconfirming information with comparable prominence, so this panel is built
 * from the run's actual state rather than from stock caveats.
 */

interface Caution {
  heading: string;
  detail: string;
}

function buildCautions(snapshot: UiSnapshot): Caution[] {
  const cautions: Caution[] = [];

  // 1. Verdicts decided on a narrow margin — a small extraction error would
  //    have flipped them.
  const narrow: string[] = [];
  for (const supplier of snapshot.screen.suppliers) {
    if (!supplier.eligible) continue;
    for (const v of supplier.verdicts) {
      const m = /^(-?[\d.]+)\s*\S*\s*[≤≥<>=]\s*(-?[\d.]+)/.exec(
        v.comparison ?? "",
      );
      if (!m) continue;
      const value = Number(m[1]);
      const limit = Number(m[2]);
      if (!Number.isFinite(value) || !Number.isFinite(limit) || limit === 0) continue;
      if (Math.abs(limit - value) / Math.abs(limit) <= 0.06) {
        narrow.push(
          `${supplier.supplierName} · ${v.requirementId} (${v.comparison})`,
        );
      }
    }
  }
  if (narrow.length > 0) {
    cautions.push({
      heading: `${narrow.length} requirement${narrow.length === 1 ? "" : "s"} cleared by a very small margin`,
      detail: `${narrow.join("; ")}. A modest change in the underlying figure would reverse these, so they are worth confirming directly with the supplier before relying on them.`,
    });
  }

  // 2. Abstentions: absence of evidence, which is not evidence of absence.
  const abstained = snapshot.screen.suppliers.flatMap((s) =>
    s.verdicts
      .filter((v) => v.status === "insufficient-evidence")
      .map((v) => `${s.supplierName} · ${v.requirementId}`),
  );
  if (abstained.length > 0) {
    cautions.push({
      heading: `${abstained.length} requirement${abstained.length === 1 ? "" : "s"} could not be assessed from the documents`,
      detail:
        "These are recorded as undetermined rather than failed. The supplier may well satisfy them and simply not have supplied the paperwork, so treating them as rejections would be an error in the opposite direction.",
    });
  }

  // 3. Contradictions the system refused to resolve.
  const conflicting = snapshot.screen.suppliers.flatMap((s) =>
    s.verdicts
      .filter((v) => v.status === "conflicting")
      .map((v) => `${s.supplierName} · ${v.requirementId}`),
  );
  if (conflicting.length > 0) {
    cautions.push({
      heading: `${conflicting.length} document${conflicting.length === 1 ? "" : "s"} contradict themselves`,
      detail: `${conflicting.join("; ")}. The system deliberately did not choose between the conflicting statements — that judgement belongs to a person with the ability to ask the supplier.`,
    });
  }

  // 4. How little separates first from second.
  const [first, second] = snapshot.baseline.ranked;
  if (first && second) {
    const margin = first.totalScore - second.totalScore;
    cautions.push({
      heading: `The lead over second place is ${margin.toFixed(3)}`,
      detail: `Scores are relative to these ${snapshot.baseline.ranked.length} suppliers, not absolute quality marks. The sliders below show how far the priorities can move before the order changes — on some criteria that point is closer than it looks.`,
    });
  }

  // 5. The choices we made that are not in any document.
  cautions.push({
    heading: `${snapshot.assumptions.length} assumptions were introduced by us, not taken from the documents`,
    detail:
      "The assessment date, the reading of stated ranges, the sustainability scoring rule and the normalisation method are all our decisions. Each is listed in full at the foot of this page with what it would change.",
  });

  // 6. The confidence signal we measured and chose not to show.
  const { uncertainButHighConfidence, uncertainVerdicts } = snapshot.evaluation;
  if (uncertainVerdicts > 0) {
    cautions.push({
      heading: "The model's own confidence is not shown, because it is unreliable",
      detail: `Of the ${uncertainVerdicts} verdicts where the system declined to decide, ${uncertainButHighConfidence} were nonetheless self-reported as high confidence. A signal that says "certain" while the answer is "cannot tell" would mislead rather than inform, so this interface shows whether evidence was verified instead.`,
    });
  }

  return cautions;
}

export function CounterExplanation({ snapshot }: { snapshot: UiSnapshot }) {
  const cautions = buildCautions(snapshot);

  return (
    <section
      id="cautions"
      className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        Why this recommendation could be wrong
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
        Detailed evidence tends to increase a reader&rsquo;s confidence whether or
        not it should. These are the specific reasons to hold this result
        loosely.
      </p>

      <ul className="mt-5 space-y-4">
        {cautions.map((c) => (
          <li key={c.heading} className="flex gap-3">
            <span
              aria-hidden
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-serious)]"
            />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {c.heading}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                {c.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
