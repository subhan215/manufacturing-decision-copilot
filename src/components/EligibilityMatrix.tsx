"use client";

import { useMemo, useState } from "react";

import type { UiSnapshot } from "@/lib/snapshot";
import {
  adjustableRequirements,
  rescreen,
  type ThresholdOverrides,
} from "@/lib/eligibility/rescreen";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ThresholdControls } from "./ThresholdControls";
import { STATUS_STYLES } from "./statusStyle";

/**
 * The eligibility screen: every supplier against every mandatory requirement,
 * shown before any ranking.
 *
 * This is a status grid, not a heatmap — the values are categorical, so they
 * take the status palette with a mark and label per cell, never a magnitude
 * ramp. A supplier is eligible only when all seven are satisfied, so the grid
 * is the whole argument for who was excluded and why.
 *
 * The thresholds are live. Moving one re-decides every affected verdict in the
 * browser through the same `evaluateFinding` the evaluation was measured
 * against — no model call, nothing re-read. That is only possible because the
 * model was never asked to do the comparison in the first place.
 */
export function EligibilityMatrix({ snapshot }: { snapshot: UiSnapshot }) {
  const [selected, setSelected] = useState<{
    supplierId: string;
    requirementId: string;
  } | null>(null);
  const [overrides, setOverrides] = useState<ThresholdOverrides>({});

  const adjustable = useMemo(
    () => adjustableRequirements(snapshot.requirements),
    [snapshot.requirements],
  );

  const screen = useMemo(
    () => rescreen(snapshot.screen, snapshot.requirements, overrides),
    [snapshot.screen, snapshot.requirements, overrides],
  );

  const baselineEligible = snapshot.screen.suppliers.filter(
    (s) => s.eligible,
  ).length;
  const nowEligible = screen.suppliers.filter((s) => s.eligible).length;

  const requirementIds =
    screen.suppliers[0]?.verdicts.map((v) => v.requirementId) ?? [];

  // What each verdict was under the brief's own limits, so a cell that moved
  // can be marked as moved. Without this the grid under relaxed limits looks
  // exactly like the grid the brief asked for.
  const baselineStatus = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of snapshot.screen.suppliers) {
      for (const v of s.verdicts) {
        map.set(`${s.supplierId}::${v.requirementId}`, v.status);
      }
    }
    return map;
  }, [snapshot.screen.suppliers]);

  const chunkById = useMemo(
    () => new Map(snapshot.citedChunks.map((c) => [c.chunkId, c])),
    [snapshot.citedChunks],
  );

  const supplier = selected
    ? screen.suppliers.find((s) => s.supplierId === selected.supplierId)
    : undefined;
  const verdict = selected
    ? (supplier?.verdicts.find((v) => v.requirementId === selected.requirementId) ??
      null)
    : null;

  return (
    <section
      id="eligibility"
      className="scroll-mt-6 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Eligibility screen
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            All seven requirements are mandatory — one failure disqualifies.
            Select any cell to see the evidence behind it.
          </p>
        </div>

        <ul className="flex flex-wrap gap-3">
          {Object.entries(STATUS_STYLES).map(([key, style]) => (
            <li key={key} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-semibold"
                style={{ color: style.color, background: style.tint }}
              >
                {style.mark}
              </span>
              <span className="text-[var(--text-secondary)]">{style.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <ThresholdControls
        requirements={adjustable}
        overrides={overrides}
        onChange={setOverrides}
        eligibleBefore={baselineEligible}
        eligibleAfter={nowEligible}
      />

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Supplier eligibility against seven mandatory requirements
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[var(--surface-1)] px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
              >
                Supplier
              </th>
              {requirementIds.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className="px-1 py-2 text-center text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
                >
                  {id}
                </th>
              ))}
              <th
                scope="col"
                className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]"
              >
                Eligible
              </th>
            </tr>
          </thead>
          <tbody>
            {screen.suppliers.map((s) => (
              <tr
                key={s.supplierId}
                className="border-t border-[var(--gridline)]"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[15rem] truncate bg-[var(--surface-1)] px-2 py-1.5 text-left font-normal text-[var(--text-primary)]"
                  title={s.supplierName}
                >
                  {s.supplierName}
                </th>

                {s.verdicts.map((v) => {
                  const style = STATUS_STYLES[v.status];
                  const was = baselineStatus.get(
                    `${s.supplierId}::${v.requirementId}`,
                  );
                  const moved = was !== undefined && was !== v.status;
                  return (
                    <td
                      key={v.requirementId}
                      className="relative px-0.5 py-1 text-center"
                    >
                      <button
                        onClick={() =>
                          setSelected({
                            supplierId: s.supplierId,
                            requirementId: v.requirementId,
                          })
                        }
                        title={`${v.requirementId} — ${style.label}${v.comparison ? `: ${v.comparison}` : ""}${moved ? ` (was ${was} under the brief's limit)` : ""}`}
                        className="tnum inline-flex h-8 w-full min-w-[3.25rem] items-center justify-center gap-1 rounded text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                        style={{ color: style.color, background: style.tint }}
                      >
                        <span aria-hidden>{style.mark}</span>
                        <span>{style.short}</span>
                        <span className="sr-only">
                          {s.supplierName}, {v.requirementId}: {style.label}
                          {moved ? `, changed from ${was}` : ""}
                        </span>
                      </button>
                      {moved && (
                        <span
                          aria-hidden
                          title={`Changed from ${was} by a moved limit`}
                          className="pointer-events-none absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--status-serious)]"
                        />
                      )}
                    </td>
                  );
                })}

                <td className="px-2 py-1.5 text-right">
                  {s.eligible ? (
                    <span className="text-sm font-medium text-[var(--success-text)]">
                      Yes
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--text-muted)]">
                      {s.blockingRequirements.length} blocking
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {snapshot.conditionallyEligible.length > 0 && (
        <div className="mt-5 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            Not rejected — undocumented
          </h3>
          {snapshot.conditionallyEligible.map((c) => (
            <p
              key={c.supplierId}
              className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]"
            >
              <strong className="font-medium">{c.supplierName}</strong> fails
              nothing outright; {c.unresolvedRequirements.length} requirements
              simply are not addressed in the documents supplied. To bring them
              back into consideration, request: {c.dataGaps.join("; ")}.
            </p>
          ))}
        </div>
      )}

      <EvidenceDrawer
        supplierName={supplier?.supplierName ?? ""}
        verdict={verdict}
        chunk={
          verdict?.citationChunkId
            ? (chunkById.get(verdict.citationChunkId) ?? null)
            : null
        }
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
