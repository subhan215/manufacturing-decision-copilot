"use client";

import { useMemo, useState } from "react";

// Imported from the specific modules, never the package barrel: the barrel
// pulls in the report builder, which reads the filesystem. Everything below is
// pure arithmetic over data the snapshot already carries.
import { analyseSplits, concentration } from "@/lib/scenarios/split";
import { relaxByDropping, relaxByThreshold } from "@/lib/scenarios/relax";
import { supplierUnavailable, leadTimeSlip } from "@/lib/scenarios/disrupt";
import {
  ORDER_QUANTITIES,
  SECONDARY_VIABILITY_FLOOR,
  type ScenarioOutcome,
  type SplitAnalysis,
} from "@/lib/scenarios/types";
import type { UiSnapshot } from "@/lib/snapshot";

/**
 * Supply-risk planning: what happens when the recommendation stops holding.
 *
 * Every scenario here is recomputed live, in the browser, from evidence the
 * snapshot already holds — no model call, no server round trip. That is a
 * direct consequence of the architecture: because the model only ever read
 * values and code made every comparison, replaying the decision under different
 * conditions is arithmetic.
 *
 * Where a scenario produces an attractive number, its caveats sit beside it
 * rather than beneath the section. A saving is exactly the figure someone acts
 * on without reading further.
 */

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Boundary ratios are not round numbers — 62.5/37.5 must not render as 63/38,
// because the whole point of that split is that it sits exactly on a minimum.
const share = (n: number) => `${Number((n * 100).toFixed(1))}%`;

/**
 * The cheapest workable pairing at each ratio.
 *
 * Listing every feasible arrangement means the cross-product of eligible
 * suppliers — nineteen rows at launch volume, most of them the same split with
 * a dearer partner. A buyer asks "can we split, and what does it cost?", which
 * four rows answer and nineteen bury. The full count is still stated.
 */
function bestPerRatio(analysis: SplitAnalysis) {
  const byRatio = new Map<number, SplitAnalysis["options"][number]>();
  for (const o of analysis.options) {
    if (!o.feasible) continue;
    const current = byRatio.get(o.secondary.share);
    if (!current || o.totalCost < current.totalCost) {
      byRatio.set(o.secondary.share, o);
    }
  }
  return [...byRatio.values()].sort(
    (a, b) => a.secondary.share - b.secondary.share,
  );
}

function Caveats({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((c) => (
        <li
          key={c}
          className="flex gap-2 text-xs leading-relaxed text-[var(--text-secondary)]"
        >
          <span aria-hidden className="text-[var(--status-serious)]">
            !
          </span>
          <span>{c}</span>
        </li>
      ))}
    </ul>
  );
}

const QUANTITY_CHOICES = [
  { value: ORDER_QUANTITIES.launch, label: "8,000 — launch" },
  { value: 20000, label: "20,000" },
  { value: ORDER_QUANTITIES.scaleUp, label: "40,000 — scale-up" },
];

export function ScenarioPanel({ snapshot }: { snapshot: UiSnapshot }) {
  const [quantity, setQuantity] = useState<number>(ORDER_QUANTITIES.launch);
  const [relaxedId, setRelaxedId] = useState<string>("none");
  const [unavailableId, setUnavailableId] = useState<string>("none");
  const [slipPct, setSlipPct] = useState<number>(0);

  const { screen, signals, requirements } = snapshot;
  const allSignals = useMemo(
    () => [...signals, ...snapshot.nearMissSignals],
    [signals, snapshot.nearMissSignals],
  );

  const nameOf = (id: string) =>
    allSignals.find((s) => s.supplierId === id)?.supplierName ??
    screen.suppliers.find((s) => s.supplierId === id)?.supplierName ??
    id;

  const moqs = useMemo(
    () =>
      screen.suppliers.flatMap((s) => {
        const moq = s.verdicts.find((v) => v.requirementId === "MR-3")?.evidence
          .numericValue;
        return moq === null || moq === undefined
          ? []
          : [{ supplierId: s.supplierId, moq }];
      }),
    [screen.suppliers],
  );

  // Requirements worth offering: those blocking a supplier that would otherwise
  // qualify. Relaxing anything else changes nothing.
  const relaxable = useMemo(() => {
    const blocking = new Set(
      screen.suppliers
        .filter((s) => !s.eligible && s.blockingRequirements.length === 1)
        .map((s) => s.blockingRequirements[0]),
    );
    return requirements.filter((r) => blocking.has(r.id));
  }, [screen.suppliers, requirements]);

  const split = useMemo(
    () => analyseSplits({ signals, moqs, orderQuantity: quantity }),
    [signals, moqs, quantity],
  );

  const baseline = useMemo(() => {
    const top = snapshot.baseline.ranked[0];
    const s = signals.find((x) => x.supplierId === top?.supplierId);
    if (!s) return null;
    return {
      supplierName: s.supplierName,
      unitCost: s.cost.value,
      totalCost: s.cost.value * quantity,
      leadTimeDays: s.leadTime.value,
      concentration: concentration([1]),
    };
  }, [snapshot.baseline.ranked, signals, quantity]);

  // Each control produces a scenario from the same functions the verification
  // suite exercises, so what the interface shows and what the suite asserts
  // cannot diverge.
  const active = useMemo(() => {
    const out: ScenarioOutcome[] = [];

    if (relaxedId !== "none") {
      const requirement = requirements.find((r) => r.id === relaxedId);
      if (requirement) {
        if (
          requirement.kind === "numeric-threshold" &&
          requirement.threshold !== null
        ) {
          const blocked = screen.suppliers.find(
            (s) =>
              !s.eligible &&
              s.blockingRequirements.length === 1 &&
              s.blockingRequirements[0] === requirement.id,
          );
          const needed =
            blocked?.verdicts.find((v) => v.requirementId === requirement.id)
              ?.evidence.numericValue ?? requirement.threshold;
          out.push(
            relaxByThreshold({
              screen,
              requirement,
              newThreshold: needed,
              asOfDate: screen.asOfDate,
            }),
          );
        } else {
          out.push(relaxByDropping({ screen, requirement }));
        }
      }
    }

    if (unavailableId !== "none") {
      out.push(supplierUnavailable({ screen, signals, supplierId: unavailableId }));
    }

    if (slipPct > 0) {
      const mr5 = requirements.find((r) => r.id === "MR-5");
      if (mr5) {
        out.push(
          leadTimeSlip({
            screen,
            signals,
            requirement: mr5,
            slipFactor: 1 + slipPct / 100,
            asOfDate: screen.asOfDate,
          }),
        );
      }
    }
    return out;
  }, [relaxedId, unavailableId, slipPct, screen, signals, requirements]);

  // The combined effect, which is what a buyer actually faces — several things
  // rarely go wrong one at a time. Intersecting the survivor sets is honest
  // here because each scenario is computed against the same baseline screen.
  const survivors = useMemo(() => {
    if (active.length === 0) return null;
    let ids = new Set(
      screen.suppliers.filter((s) => s.eligible).map((s) => s.supplierId),
    );
    for (const sc of active) {
      const after = new Set(sc.eligibleAfter);
      ids = new Set([...ids].filter((id) => after.has(id)));
      for (const id of sc.entered) ids.add(id);
    }
    return [...ids];
  }, [active, screen.suppliers]);

  const changed =
    relaxedId !== "none" || unavailableId !== "none" || slipPct > 0;

  const caveats = useMemo(
    () => [...new Set(active.flatMap((s) => s.caveats))],
    [active],
  );

  const rows = bestPerRatio(split);

  return (
    <section
      id="scenarios"
      className="scroll-mt-6 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            If the plan has to change
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            A shortlist is only useful while nothing moves. Change a condition
            and every constraint is re-checked live — no model call, because the
            values were extracted once and the comparisons are arithmetic.
          </p>
        </div>
        {changed && (
          <button
            onClick={() => {
              setRelaxedId("none");
              setUnavailableId("none");
              setSlipPct(0);
            }}
            className="rounded border border-[var(--hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
          >
            Clear scenario
          </button>
        )}
      </div>

      {/* ------------------------------------------------------- controls */}
      <div className="mt-5 grid gap-4 border-y border-[var(--hairline)] py-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs text-[var(--text-primary)]">
            Order quantity
          </span>
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="mt-1.5 w-full rounded border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            {QUANTITY_CHOICES.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-[var(--text-primary)]">
            Requirement relaxed
          </span>
          <select
            value={relaxedId}
            onChange={(e) => setRelaxedId(e.target.value)}
            className="mt-1.5 w-full rounded border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="none">None — as the brief states</option>
            {relaxable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-[var(--text-primary)]">
            Supplier unavailable
          </span>
          <select
            value={unavailableId}
            onChange={(e) => setUnavailableId(e.target.value)}
            className="mt-1.5 w-full rounded border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="none">None</option>
            {signals.map((s) => (
              <option key={s.supplierId} value={s.supplierId}>
                {s.supplierName}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-[var(--text-primary)]">
              Lead times slip
            </span>
            <span className="tnum text-xs text-[var(--text-secondary)]">
              {slipPct}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={slipPct}
            onChange={(e) => setSlipPct(Number(e.target.value))}
            className="mt-2 w-full"
            aria-label="Lead-time slip percentage"
          />
        </label>
      </div>

      {/* ------------------------------------------------------- outcome */}
      {changed && survivors && (
        <div className="mt-5 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-4">
          <p className="text-sm text-[var(--text-primary)]">
            <span className="tnum font-medium">
              {screen.suppliers.filter((s) => s.eligible).length} →{" "}
              {survivors.length}
            </span>{" "}
            eligible under these conditions
            {survivors.length > 0 && (
              <span className="text-[var(--text-secondary)]">
                {" "}
                — {survivors.map(nameOf).join(", ")}
              </span>
            )}
            .
          </p>
          <ul className="mt-2 space-y-1">
            {active.map((s) => (
              <li
                key={s.id}
                className="text-sm leading-relaxed text-[var(--text-secondary)]"
              >
                <strong className="font-medium text-[var(--text-primary)]">
                  {s.label}:
                </strong>{" "}
                {s.impact}{" "}
                <span className="text-[var(--text-muted)]">
                  ({s.constraintChecks.length} constraint checks re-run)
                </span>
              </li>
            ))}
          </ul>
          <Caveats items={caveats} />
        </div>
      )}

      {/* --------------------------------------------------- current plan */}
      {baseline && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            Sole-source plan at {quantity.toLocaleString()} units
          </h3>
          <p className="tnum mt-1 text-sm text-[var(--text-secondary)]">
            {baseline.supplierName} · {money(baseline.totalCost)} ·{" "}
            {baseline.leadTimeDays} days · effectively{" "}
            {baseline.concentration.effectiveSuppliers.toFixed(1)} supplier. The
            entire order depends on one supplier, which is what a concentration
            of 1.0 means.
          </p>
        </div>
      )}

      {/* -------------------------------------------------- dual sourcing */}
      <div className="mt-6 border-t border-[var(--hairline)] pt-5">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Can the order be split across two suppliers?
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          <strong className="font-medium text-[var(--text-primary)]">
            {split.feasibleCount === 0
              ? "No workable arrangement"
              : `${split.feasibleCount} workable arrangement${split.feasibleCount === 1 ? "" : "s"}`}{" "}
            at {quantity.toLocaleString()} units.
          </strong>{" "}
          {split.headline}
        </p>

        {rows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="tnum w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-1 pr-3 font-medium">Allocation</th>
                  <th className="py-1 pr-3 font-medium">Cost</th>
                  <th className="py-1 pr-3 font-medium">Lead time</th>
                  <th className="py-1 pr-3 font-medium">Defect exposure</th>
                  <th className="py-1 font-medium">Suppliers, effectively</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={`${o.primary.supplierId}-${o.secondary.supplierId}-${o.secondary.share}`}
                    className="border-t border-[var(--gridline)]"
                  >
                    <td className="py-1.5 pr-3">
                      {share(o.primary.share)} {o.primary.supplierName} /{" "}
                      {share(o.secondary.share)} {o.secondary.supplierName}
                      {o.derivedFromMoq && (
                        <span className="ml-1.5 text-xs text-[var(--status-serious)]">
                          exactly on a minimum
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      {money(o.totalCost)}{" "}
                      <span className="text-[var(--text-muted)]">
                        ({o.costDeltaVsSoleSource >= 0 ? "+" : ""}
                        {money(o.costDeltaVsSoleSource)})
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{o.leadTimeDays} days</td>
                    <td className="py-1.5 pr-3">
                      {o.blendedFailRate.toFixed(1)}%
                    </td>
                    <td className="py-1.5">
                      {o.concentration.effectiveSuppliers.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {split.feasibleCount > rows.length && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Showing the cheapest pairing at each ratio. {split.feasibleCount}{" "}
            arrangements are workable in total; the rest are the same ratios with
            more expensive partners. Allocations below{" "}
            {Math.round(SECONDARY_VIABILITY_FLOOR * 100)}% to the second supplier
            are excluded — a token share does not buy resilience.
          </p>
        )}

        <Caveats items={split.caveats} />
      </div>
    </section>
  );
}
