import type { UiSnapshot } from "@/lib/snapshot";

/**
 * The four numbers that qualify everything below them.
 *
 * A strip like this usually carries whatever is easiest to compute, which is
 * how dashboards end up reporting activity instead of trust. These four were
 * chosen because each one bounds how much weight the recommendation can bear:
 * how many candidates survived, how much of the evidence is checkable, how the
 * system scored against ground truth, and how much still needs a person.
 *
 * Deliberately not here: cost saved, time saved, documents processed. Volume
 * metrics flatter the tool without telling a buyer anything about whether to
 * believe it.
 */

function Metric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className="tnum mt-1.5 text-2xl font-semibold tracking-tight"
        style={{ color: accent ?? "var(--text-primary)" }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
        {detail}
      </p>
    </div>
  );
}

export function MetricStrip({ snapshot }: { snapshot: UiSnapshot }) {
  const { screen, evaluation } = snapshot;
  const total = screen.suppliers.length;
  const eligible = screen.suppliers.filter((s) => s.eligible).length;

  const needsPerson = screen.suppliers.reduce(
    (n, s) =>
      n +
      s.verdicts.filter(
        (v) =>
          v.status === "conflicting" || v.status === "insufficient-evidence",
      ).length,
    0,
  );
  const verdicts = screen.stats.verdictsTotal;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Eligible"
        value={`${eligible} of ${total}`}
        detail={`Cleared all seven mandatory requirements. ${total - eligible} were blocked, each with a stated reason.`}
      />
      <Metric
        label="Citations verified"
        value={`${(evaluation.citationCorrectness * 100).toFixed(0)}%`}
        detail={`${evaluation.citationsExact + evaluation.citationsNormalized} quotes checked character-by-character against the source. ${evaluation.hallucinationRate === 0 ? "None fabricated." : `${(evaluation.hallucinationRate * 100).toFixed(1)}% not found.`}`}
        accent="var(--status-good)"
      />
      <Metric
        label="Accuracy vs. ground truth"
        value={`${(evaluation.goldAccuracy * 100).toFixed(1)}%`}
        detail={`Against hand-authored labels; ${(evaluation.goldPreRegisteredAccuracy * 100).toFixed(1)}% on the ones written before the system existed. Baseline: ${(evaluation.baselineAccuracy * 100).toFixed(1)}%.`}
      />
      <Metric
        label="Needs a person"
        value={`${needsPerson} of ${verdicts}`}
        detail="Contradictory documents and missing evidence, routed to a human rather than guessed."
        accent="var(--status-serious)"
      />
    </div>
  );
}
