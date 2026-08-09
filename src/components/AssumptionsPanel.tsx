import type { UiSnapshot } from "@/lib/snapshot";

/**
 * The separation the brief asks for: facts drawn from documents, assumptions we
 * introduced, and conclusions the model reached.
 *
 * The assumptions are the part a reader is least likely to think to ask about
 * and most likely to be surprised by, so each is paired with what it would
 * change if it were decided differently.
 */
export function AssumptionsPanel({ snapshot }: { snapshot: UiSnapshot }) {
  return (
    <section
      id="assumptions"
      className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        Assumptions and limits
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
        These choices are ours, not the suppliers&rsquo;. None of them appears in
        any source document.
      </p>

      <dl className="mt-5 space-y-4">
        {snapshot.assumptions.map((a) => (
          <div key={a.id} className="border-l-2 border-[var(--gridline)] pl-4">
            <dt className="text-sm font-medium text-[var(--text-primary)]">
              {a.statement}
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              {a.rationale}{" "}
              <span className="text-[var(--text-muted)]">
                Changes: {a.affects}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 border-t border-[var(--hairline)] pt-5">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          What this evaluation does not establish
        </h3>
        <ul className="mt-3 space-y-2">
          {snapshot.limitations.map((l) => (
            <li
              key={l}
              className="flex gap-2 text-sm leading-relaxed text-[var(--text-secondary)]"
            >
              <span aria-hidden className="text-[var(--text-muted)]">
                —
              </span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-4 text-sm leading-relaxed text-[var(--text-secondary)]">
        <strong className="font-medium text-[var(--text-primary)]">
          Where a person takes over.
        </strong>{" "}
        This analysis produces a shortlist and the evidence behind it. Confirming
        certifications with the issuing bodies, resolving the contradictions
        flagged above, requesting the missing documents, and approving any
        supplier or order are human decisions that this system neither makes nor
        prepares to make.
      </p>
    </section>
  );
}
