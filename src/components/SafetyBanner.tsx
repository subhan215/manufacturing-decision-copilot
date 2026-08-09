/**
 * Persistent scope statement.
 *
 * Not dismissible: the boundary it states — that no supplier is contacted,
 * approved or ordered from by this system — is a condition of the tool, not a
 * notice to be acknowledged and cleared.
 */
export function SafetyBanner() {
  return (
    <div className="border-b border-[var(--hairline)] bg-[var(--surface-raised)]">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-6 py-3">
        <span
          aria-hidden
          className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--status-warning)]"
        />
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          <strong className="font-semibold text-[var(--text-primary)]">
            Decision support only.
          </strong>{" "}
          Built for a sourcing or product analyst choosing a contract
          manufacturer from supplied documentation. It reads those documents and
          shows the evidence behind a shortlist. It does not contact suppliers,
          request quotations, verify certificates with issuing bodies, approve
          vendors or place orders — every one of those steps stays with a human.
          Figures are drawn from the documents as written and are not checked
          against live supplier data.
        </p>
      </div>
    </div>
  );
}
