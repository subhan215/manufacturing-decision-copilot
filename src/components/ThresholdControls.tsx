"use client";

import type { Requirement } from "@/lib/eligibility/types";
import type { ThresholdOverrides } from "@/lib/eligibility/rescreen";

/**
 * Live controls for the buyer's numeric requirements.
 *
 * These are the buyer's own limits, not tuning knobs — so the brief's value is
 * always marked on the track and one click away. A changed threshold is
 * labelled as changed everywhere it has an effect, because a screen showing
 * six eligible suppliers under relaxed rules must never be mistaken for the
 * screen the brief actually asked for.
 */

/**
 * How far each requirement can be dragged.
 *
 * Ranges are anchored on the brief's own value rather than on the data, so the
 * control does not quietly reveal where the suppliers happen to sit — the point
 * is to explore a constraint, not to hunt for the setting that admits someone.
 */
function rangeFor(requirement: Requirement): {
  min: number;
  max: number;
  step: number;
} {
  const base = requirement.threshold ?? 0;
  switch (requirement.id) {
    case "MR-3": // minimum order quantity, units
      return { min: 1000, max: 20000, step: 500 };
    case "MR-4": // inspection fail rate, percent
      return { min: 5, max: 50, step: 1 };
    case "MR-5": // manufacturing lead time, calendar days
      return { min: 7, max: 35, step: 1 };
    default:
      return { min: Math.max(0, base / 2), max: base * 2, step: 1 };
  }
}

const format = (value: number, unit: string | null) =>
  `${value.toLocaleString()}${unit ? ` ${unit}` : ""}`;

export function ThresholdControls({
  requirements,
  overrides,
  onChange,
  eligibleBefore,
  eligibleAfter,
}: {
  requirements: Requirement[];
  overrides: ThresholdOverrides;
  onChange: (next: ThresholdOverrides) => void;
  eligibleBefore: number;
  eligibleAfter: number;
}) {
  const changed = Object.keys(overrides).length > 0;

  return (
    <div className="mt-5 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          What if a requirement moved?
        </h3>
        {changed && (
          <button
            onClick={() => onChange({})}
            className="rounded border border-[var(--hairline)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
          >
            Reset to the brief
          </button>
        )}
      </div>

      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-secondary)]">
        Every verdict below is re-decided as you drag — in your browser, with no
        model call. The model only ever read values out of the documents; the
        comparison against a limit was always arithmetic, so changing the limit
        costs nothing.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {requirements.map((r) => {
          const { min, max, step } = rangeFor(r);
          const brief = r.threshold ?? 0;
          const value = overrides[r.id] ?? brief;
          const isChanged = value !== brief;
          const briefPct = ((brief - min) / (max - min)) * 100;

          return (
            <label key={r.id} className="block">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-[var(--text-primary)]">
                  {r.id} · {r.title}
                </span>
                <span
                  className="tnum text-xs font-medium"
                  style={{
                    color: isChanged
                      ? "var(--status-serious)"
                      : "var(--text-secondary)",
                  }}
                >
                  {format(value, r.unit)}
                </span>
              </span>

              <span className="relative mt-2 block">
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(e) => {
                    const next = { ...overrides };
                    const n = Number(e.target.value);
                    // Returning to the brief's value removes the override
                    // rather than recording one that happens to match, so
                    // "changed" always means genuinely changed.
                    if (n === brief) delete next[r.id];
                    else next[r.id] = n;
                    onChange(next);
                  }}
                  className="w-full"
                  aria-label={`${r.title} limit`}
                />
                {/* The brief's value, marked on the track so the original is
                    never off-screen while exploring. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-0.5 h-2 w-px bg-[var(--text-muted)]"
                  style={{ left: `${briefPct}%` }}
                />
              </span>

              <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                {isChanged ? (
                  <>
                    brief says {format(brief, r.unit)} —{" "}
                    <button
                      onClick={() => {
                        const next = { ...overrides };
                        delete next[r.id];
                        onChange(next);
                      }}
                      className="underline hover:text-[var(--text-secondary)]"
                    >
                      restore
                    </button>
                  </>
                ) : (
                  "as stated in the brief"
                )}
              </span>
            </label>
          );
        })}
      </div>

      {changed && (
        <p className="mt-4 border-t border-[var(--hairline)] pt-3 text-sm text-[var(--text-primary)]">
          <span className="tnum font-medium">
            {eligibleBefore} → {eligibleAfter}
          </span>{" "}
          suppliers eligible under the changed limits.{" "}
          <span className="text-[var(--text-secondary)]">
            {eligibleAfter > eligibleBefore
              ? "The additional suppliers were blocked by a limit, not by evidence — but the limit exists for a reason the documents do not record, and relaxing it is a commercial decision rather than a finding."
              : eligibleAfter < eligibleBefore
                ? "Tightening removes suppliers that satisfied the brief as written."
                : "No supplier's eligibility changes at these limits."}
          </span>
        </p>
      )}
    </div>
  );
}
