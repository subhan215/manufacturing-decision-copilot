"use client";

import { useMemo, useState } from "react";

// Imported from the specific modules, never the package barrel: the barrel
// re-exports the report builder, which reads the filesystem and cannot be
// bundled for the browser. These three files are pure arithmetic.
import { defaultWeights, rankSuppliers } from "@/lib/ranking/score";
import { monteCarlo, stabilityInterval } from "@/lib/ranking/sensitivity";
import { CRITERIA, type CriterionId, type Weights } from "@/lib/ranking/types";
import type { UiSnapshot } from "@/lib/snapshot";

/**
 * Ranking, and what it would take to change it.
 *
 * Every number here is recomputed in the browser from the frozen signals — no
 * server call, no model call — which is what makes the weights genuinely
 * explorable rather than three canned scenarios. The scoring code is the same
 * module the evaluation ran against, so the interactive result and the reported
 * result cannot drift apart.
 */

const SERIES_COLOR: Record<CriterionId, string> = {
  cost: "var(--series-cost)",
  leadTime: "var(--series-lead)",
  quality: "var(--series-quality)",
  sustainability: "var(--series-sustain)",
};

const SHORT_LABEL: Record<CriterionId, string> = {
  cost: "Cost",
  leadTime: "Lead time",
  quality: "Quality",
  sustainability: "Sustainability",
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function RankingPanel({ snapshot }: { snapshot: UiSnapshot }) {
  const [weights, setWeights] = useState<Weights>(defaultWeights());

  const result = useMemo(
    () => rankSuppliers(snapshot.signals, weights),
    [snapshot.signals, weights],
  );

  const monte = useMemo(
    () => monteCarlo(snapshot.signals, 2000),
    [snapshot.signals],
  );

  const intervals = useMemo(
    () => CRITERIA.map((c) => stabilityInterval(snapshot.signals, c.id)),
    [snapshot.signals],
  );

  const nameById = useMemo(
    () => new Map(snapshot.signals.map((s) => [s.supplierId, s.supplierName])),
    [snapshot.signals],
  );

  const isDefault = CRITERIA.every(
    (c) => Math.abs(weights[c.id] - c.defaultWeight) < 1e-9,
  );

  return (
    <section
      id="ranking"
      className="scroll-mt-6 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Ranking the eligible suppliers
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Only suppliers that cleared every mandatory requirement appear here.
            Move a priority to see what changes.
          </p>
        </div>
        {!isDefault && (
          <button
            onClick={() => setWeights(defaultWeights())}
            className="rounded border border-[var(--hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
          >
            Reset to brief defaults
          </button>
        )}
      </div>

      {/* One control row above everything it scopes. */}
      <div className="mt-5 grid gap-4 border-y border-[var(--hairline)] py-4 sm:grid-cols-2 lg:grid-cols-4">
        {CRITERIA.map((c) => (
          <label key={c.id} className="block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm text-[var(--text-primary)]">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: SERIES_COLOR[c.id] }}
                />
                {SHORT_LABEL[c.id]}
              </span>
              <span className="tnum text-sm text-[var(--text-secondary)]">
                {pct(result.weights[c.id])}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(weights[c.id] * 100)}
              onChange={(e) =>
                setWeights({ ...weights, [c.id]: Number(e.target.value) / 100 })
              }
              className="mt-2 w-full"
              aria-label={`${SHORT_LABEL[c.id]} priority weight`}
            />
          </label>
        ))}
      </div>

      <ol className="mt-5 space-y-4">
        {result.ranked.map((r) => {
          const total = r.totalScore || 1;
          return (
            <li key={r.supplierId}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {r.rank}. {nameById.get(r.supplierId) ?? r.supplierId}
                </span>
                <span className="tnum text-sm text-[var(--text-secondary)]">
                  {r.totalScore.toFixed(3)}
                </span>
              </div>

              {/* Stacked contribution bar. Segments are separated by a 2px gap
                  in the surface colour rather than by borders. */}
              <div
                className="mt-1.5 flex h-3 w-full overflow-hidden rounded-sm"
                style={{ background: "var(--gridline)" }}
              >
                {CRITERIA.map((c) => {
                  const share = r.contributions[c.id] / total;
                  const widthPct = share * 100 * (r.totalScore / (result.ranked[0].totalScore || 1));
                  if (widthPct <= 0.4) return null;
                  return (
                    <span
                      key={c.id}
                      title={`${SHORT_LABEL[c.id]}: ${r.contributions[c.id].toFixed(3)}`}
                      style={{
                        width: `${widthPct}%`,
                        background: SERIES_COLOR[c.id],
                        marginRight: 2,
                      }}
                    />
                  );
                })}
              </div>

              {/* Values in text as well: several series colours sit below the
                  contrast threshold on the light surface, and a tooltip must
                  never be the only way to read a number. */}
              <p className="tnum mt-1 text-xs text-[var(--text-muted)]">
                {CRITERIA.map(
                  (c) =>
                    `${SHORT_LABEL[c.id]} ${r.contributions[c.id].toFixed(3)}`,
                ).join(" · ")}
              </p>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 grid gap-6 border-t border-[var(--hairline)] pt-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            How far a priority can move before the winner changes
          </h3>
          <ul className="mt-3 space-y-2">
            {intervals.map((w) => {
              const label = SHORT_LABEL[w.criterion];
              return (
                <li key={w.criterion} className="text-sm">
                  <span className="text-[var(--text-primary)]">{label}</span>{" "}
                  <span className="tnum text-[var(--text-secondary)]">
                    {w.alwaysStable ? (
                      <>
                        — {nameById.get(w.baselineWinner) ?? w.baselineWinner}{" "}
                        leads at every weight
                      </>
                    ) : (
                      <>
                        — leader holds from {pct(w.stableFrom)} to{" "}
                        {pct(w.stableTo)};{" "}
                        {nameById.get(w.crossoverTo ?? "") ?? w.crossoverTo}{" "}
                        takes over at {pct(w.crossoverWeight ?? 0)}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            Across 2,000 randomly drawn priority settings
          </h3>
          <ul className="mt-3 space-y-2">
            {snapshot.signals.map((s) => {
              const p = monte.winProbability[s.supplierId] ?? 0;
              return (
                <li key={s.supplierId} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[var(--text-primary)]">
                      {s.supplierName}
                    </span>
                    <span className="tnum text-[var(--text-secondary)]">
                      ranks first {pct(p)} of the time
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-sm"
                    style={{ background: "var(--gridline)" }}
                  >
                    <div
                      className="h-2 rounded-sm"
                      style={{
                        width: `${Math.max(p * 100, p > 0 ? 1 : 0)}%`,
                        background: "var(--series-cost)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {snapshot.sensitivity.dominance.length > 0 && (
        <div className="mt-5 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            One supplier can be set aside regardless of priorities
          </h3>
          {snapshot.sensitivity.dominance.map((d) => (
            <p
              key={d.dominatedId}
              className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]"
            >
              {d.explanation}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
