"use client";

import { useEffect, useRef } from "react";

import type { RequirementVerdict } from "@/lib/eligibility/types";
import type { CitedChunk } from "@/lib/snapshot";
import { STATUS_STYLES } from "./statusStyle";

/**
 * Evidence for one verdict.
 *
 * The quote is shown highlighted inside the section it came from rather than
 * lifted out on its own, because a sentence read in isolation is easy to accept
 * and hard to check. Verification status is displayed as what it is — the
 * result of locating the quoted text in the source — not as a score.
 */

interface Props {
  supplierName: string;
  verdict: RequirementVerdict | null;
  chunk: CitedChunk | null;
  onClose: () => void;
}

function highlight(text: string, quote: string | null) {
  if (!quote) return [{ text, match: false }];
  const at = text.indexOf(quote);
  if (at === -1) {
    // The stored quote may differ from the section text only in formatting
    // markers; showing the section unhighlighted is better than showing nothing.
    return [{ text, match: false }];
  }
  return [
    { text: text.slice(0, at), match: false },
    { text: text.slice(at, at + quote.length), match: true },
    { text: text.slice(at + quote.length), match: false },
  ].filter((p) => p.text.length > 0);
}

export function EvidenceDrawer({ supplierName, verdict, chunk, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (verdict && !el.open) el.showModal();
    if (!verdict && el.open) el.close();
  }, [verdict]);

  if (!verdict) {
    return <dialog ref={ref} className="hidden" onClose={onClose} />;
  }

  const style = STATUS_STYLES[verdict.status];
  const parts = highlight(chunk?.text ?? "", verdict.citationQuote);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 ml-auto h-full max-h-none w-full max-w-xl bg-transparent p-0 backdrop:bg-black/45"
    >
      <div className="flex h-full flex-col overflow-y-auto bg-[var(--surface-1)] text-[var(--text-primary)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {supplierName}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {verdict.requirementId} — {verdict.requirementTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded border border-[var(--hairline)] px-2 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium"
              style={{ color: style.color, background: style.tint }}
            >
              <span aria-hidden>{style.mark}</span>
              {style.label}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              {style.description}
            </span>
          </div>

          {verdict.comparison && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                How this was decided
              </h3>
              <p className="tnum mt-2 rounded border border-[var(--hairline)] bg-[var(--page-plane)] px-3 py-2 font-mono text-sm">
                {verdict.comparison}
              </p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                The model read the value from the document; this comparison was
                computed in code, not by the model.
              </p>
            </section>
          )}

          {verdict.conflictNote && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Contradiction found
              </h3>
              <p
                className="mt-2 rounded border-l-2 px-3 py-2 text-sm leading-relaxed"
                style={{
                  borderColor: "var(--status-serious)",
                  background: STATUS_STYLES.conflicting.tint,
                }}
              >
                {verdict.conflictNote}
              </p>
            </section>
          )}

          <section>
            <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Reasoning
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {verdict.reasoning}
            </p>
          </section>

          {chunk && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Source
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {verdict.citationLocator}
                </p>
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded border border-[var(--hairline)] bg-[var(--page-plane)] px-3 py-3 font-mono text-xs leading-relaxed">
                {parts.map((p, i) =>
                  p.match ? (
                    <mark
                      key={i}
                      className="rounded-sm bg-[color-mix(in_oklab,var(--status-good)_22%,transparent)] px-0.5 text-[var(--text-primary)]"
                    >
                      {p.text}
                    </mark>
                  ) : (
                    <span key={i} className="text-[var(--text-secondary)]">
                      {p.text}
                    </span>
                  ),
                )}
              </pre>
            </section>
          )}

          <section className="border-t border-[var(--hairline)] pt-4">
            <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Evidence check
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {verdict.citationUnverified ? (
                <>
                  The quoted text could not be located in the source document, so
                  this verdict was downgraded automatically.
                </>
              ) : verdict.citationStatus === "exact" ? (
                <>
                  The quoted text was found character-for-character in the source
                  document at the location above.
                </>
              ) : verdict.citationStatus === "normalized" ? (
                <>
                  The quoted text was found in the source document, differing only
                  in formatting marks such as emphasis.
                </>
              ) : (
                <>No quotation was offered for this verdict.</>
              )}
            </p>
          </section>
        </div>
      </div>
    </dialog>
  );
}
