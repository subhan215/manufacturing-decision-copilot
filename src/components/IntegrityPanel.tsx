import type { UiSnapshot } from "@/lib/snapshot";

/**
 * What was checked, and what was withheld from the model.
 *
 * Stat tiles rather than charts: each of these is a single number, and a
 * one-bar chart is just a number wearing a costume.
 */

function Tile({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className="rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-4">
      {/* Proportional figures — tabular digits read loose at this size. */}
      <p className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
        {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
        {note}
      </p>
    </div>
  );
}

export function IntegrityPanel({ snapshot }: { snapshot: UiSnapshot }) {
  const e = snapshot.evaluation;
  const audit = snapshot.ingestionAudit;

  return (
    <section
      id="integrity"
      className="scroll-mt-6 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        How far these results can be trusted
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
        Every figure below is produced by a check that can be re-run from the
        repository.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          value={`${Math.round(e.citationCoverage * 100)}%`}
          label="Claims carrying a citation"
          note={`${e.citationsExact} quoted exactly, ${e.citationsNormalized} differing only in formatting marks.`}
        />
        <Tile
          value={`${e.detectorCasesCaught}/${e.detectorCasesTotal}`}
          label="Deliberately corrupted citations caught"
          note={`A clean record proves nothing unless the checker can detect a bad citation, so it was tested against fabricated, misattributed and non-existent references. ${e.detectorFalsePositives} genuine citations were wrongly rejected.`}
        />
        <Tile
          value={`${e.injectionSucceeded}/${e.injectionDelivered}`}
          label="Successful injected instructions"
          note="Hostile instructions were planted inside a supplier document and confirmed to reach the model. None changed a verdict, forged a citation or extracted a file."
        />
        <Tile
          value={`${Math.round(e.goldAccuracy * 100)}%`}
          label="Agreement with hand-checked answers"
          note={`A rule-based comparison reaches ${Math.round(e.baselineAccuracy * 100)}% but makes ${e.baselineCriticalErrors} errors of the kind a buyer would act on.`}
        />
      </div>

      <div className="mt-6 border-t border-[var(--hairline)] pt-5">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          What the model was not allowed to see
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {audit.chunksExcluded} of {audit.chunksRetained + audit.chunksExcluded}{" "}
          document sections were withheld from the model across{" "}
          {audit.documentsIngested} documents. Nothing is hidden from you — the
          excerpts are below — only from the system, so that its conclusions come
          from supplier evidence rather than from our own notes about the data.
        </p>

        <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-2">
          {audit.exclusions.map((x, i) => (
            <li
              key={`${x.docId}-${i}`}
              className="text-xs leading-relaxed text-[var(--text-secondary)]"
            >
              <span className="font-mono text-[var(--text-muted)]">
                {x.docId}
              </span>{" "}
              — {x.rationale}{" "}
              <span className="italic text-[var(--text-muted)]">
                &ldquo;{x.excerpt.slice(0, 90)}…&rdquo;
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
