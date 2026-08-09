import type { UiSnapshot } from "@/lib/snapshot";

/**
 * When the supplier documents were obtained. Recorded in data/DATA_MANIFEST.md
 * §1; the corpus is frozen at that date and is never re-fetched, so this is a
 * constant rather than a runtime value.
 */
const CORPUS_RETRIEVED = "8 August 2026";

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}

export function DecisionHeader({ snapshot }: { snapshot: UiSnapshot }) {
  const top = snapshot.baseline.ranked[0];
  const runnerUp = snapshot.baseline.ranked[1];
  const winner = snapshot.signals.find((s) => s.supplierId === top?.supplierId);
  const eligible = snapshot.screen.suppliers.filter((s) => s.eligible).length;

  const asOf = new Date(snapshot.asOfDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6">
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        Highest ranked under the brief&rsquo;s stated priorities
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          {winner?.supplierName ?? top?.supplierId ?? "No eligible supplier"}
        </h1>
        {/* Proportional figures deliberately — tabular digits read loose at
            display size. */}
        <span className="text-2xl font-medium text-[var(--text-secondary)]">
          {top ? top.totalScore.toFixed(3) : "—"}
        </span>
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        {eligible} of {snapshot.screen.suppliers.length} suppliers satisfy every
        mandatory requirement.{" "}
        {runnerUp
          ? `${winner?.supplierName ?? top.supplierId} leads on the brief's default weighting by ${(top.totalScore - runnerUp.totalScore).toFixed(3)}; the ranking below shows where that lead holds and where it does not.`
          : "The ranking below shows the basis for this result."}
      </p>

      {/* Source and retrieval date sit beside the recommendation, not in a
          separate provenance page. A recommendation read without knowing how
          old its evidence is invites acting on a stale document. */}
      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-[var(--hairline)] pt-4 sm:grid-cols-3 lg:grid-cols-5">
        <Meta label="Evidence" value={`${snapshot.screen.suppliers.length} supplier documents`} />
        <Meta label="Retrieved" value={CORPUS_RETRIEVED} />
        <Meta label="Assessed as of" value={asOf} />
        <Meta label="Model" value={snapshot.model} />
        <Meta label="Requirements" value={snapshot.requirementsVersion} />
      </dl>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Analysis run{" "}
        {new Date(snapshot.generatedAt).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        . Supplier documents are static and are not re-fetched; anything a
        supplier changed after the retrieval date is not reflected here.
      </p>
    </header>
  );
}
