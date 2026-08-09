import type { UiSnapshot } from "@/lib/snapshot";
import { ORDER_QUANTITIES } from "@/lib/scenarios/types";

/**
 * Supply-risk planning: what happens when the recommendation stops holding.
 *
 * A shortlist answers "who", not "what if". This section covers the questions a
 * buyer asks next — what a requirement is costing, who takes over if the
 * preferred supplier cannot, and whether the order can be split at all.
 *
 * Where a scenario produces an attractive number, its caveats are shown beside
 * it rather than beneath the section. A saving is exactly the figure someone
 * acts on without reading further.
 */

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Boundary ratios are not round numbers — 62.5/37.5 must not be shown as 63/38,
// because the whole point of that split is that it sits exactly on a minimum.
const share = (n: number) => `${Number((n * 100).toFixed(1))}%`;

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

export function ScenarioPanel({ snapshot }: { snapshot: UiSnapshot }) {
  const { baseline, scenarios, splits } = snapshot.scenarios;
  const launch = splits.find((s) => s.orderQuantity === ORDER_QUANTITIES.launch);
  const scale = splits.find((s) => s.orderQuantity === ORDER_QUANTITIES.scaleUp);

  const costOf = (supplierId: string) =>
    [...snapshot.signals, ...snapshot.nearMissSignals].find(
      (s) => s.supplierId === supplierId,
    )?.cost.value ?? null;

  const nameOf = (supplierId: string) =>
    [...snapshot.signals, ...snapshot.nearMissSignals].find(
      (s) => s.supplierId === supplierId,
    )?.supplierName ??
    snapshot.screen.suppliers.find((s) => s.supplierId === supplierId)
      ?.supplierName ??
    supplierId;

  return (
    <section
      id="scenarios"
      className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        If the plan has to change
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
        A shortlist is only useful while nothing moves. These are the same
        constraints re-checked under conditions that differ from the ones
        assumed.
      </p>

      {baseline && (
        <div className="mt-5 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            Current plan
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
            {baseline.description}
          </p>
          <p className="tnum mt-2 text-sm text-[var(--text-secondary)]">
            {money(baseline.totalCost)} · {baseline.leadTimeDays} days ·
            effectively{" "}
            {baseline.concentration.effectiveSuppliers.toFixed(1)} supplier
          </p>
        </div>
      )}

      {/* ---------------------------------------------- dual sourcing */}
      <div className="mt-6 border-t border-[var(--hairline)] pt-5">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Can the order be split across two suppliers?
        </h3>

        {launch && (
          <div className="mt-3">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              <strong className="font-medium text-[var(--text-primary)]">
                At {launch.orderQuantity.toLocaleString()} units —{" "}
                {launch.feasibleCount === 0
                  ? "no"
                  : `${launch.feasibleCount} workable arrangement${launch.feasibleCount === 1 ? "" : "s"}`}
                .
              </strong>{" "}
              {launch.headline}
            </p>

            {launch.options.filter((o) => o.feasible).length > 0 && (
              <table className="tnum mt-3 w-full border-collapse text-sm">
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
                  {launch.options
                    .filter((o) => o.feasible)
                    .map((o) => (
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
            )}

            <Caveats items={launch.caveats} />
          </div>
        )}

        {scale && (
          <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
            <strong className="font-medium text-[var(--text-primary)]">
              At {scale.orderQuantity.toLocaleString()} units —{" "}
              {scale.feasibleCount} workable arrangements.
            </strong>{" "}
            {scale.headline} The constraint at launch volume is order size, not
            supplier willingness.
          </p>
        )}
      </div>

      {/* ------------------------------------------------- scenarios */}
      <div className="mt-6 border-t border-[var(--hairline)] pt-5">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          What each requirement is costing, and what happens if things move
        </h3>

        <ul className="mt-3 space-y-5">
          {scenarios.map((s) => {
            // The cheapest supplier the scenario admits, which is the number a
            // reader will anchor on. A scenario can admit more than one.
            const cheapest = s.entered
              .map((id) => ({ id, cost: costOf(id) }))
              .filter((x): x is { id: string; cost: number } => x.cost !== null)
              .sort((a, b) => a.cost - b.cost)[0];
            const saving =
              cheapest && baseline
                ? (baseline.unitCost - cheapest.cost) * baseline.orderQuantity
                : null;

            return (
              <li
                key={s.id}
                className="border-l-2 border-[var(--gridline)] pl-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {s.label}
                  </p>
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    {s.eligibleAfter.length} eligible after
                  </span>
                </div>

                <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {s.impact}
                </p>

                {saving !== null && saving > 0 && cheapest && (
                  <p className="tnum mt-1.5 text-sm text-[var(--text-primary)]">
                    {s.entered.length > 1
                      ? `The cheapest of the ${s.entered.length} suppliers this admits, ${nameOf(cheapest.id)}, quotes `
                      : `${nameOf(cheapest.id)} quotes `}
                    {money(cheapest.cost)} per unit against{" "}
                    {money(baseline!.unitCost)} — a difference of{" "}
                    {money(saving)} across the launch order,{" "}
                    <span className="text-[var(--text-secondary)]">
                      before the costs noted below.
                    </span>
                  </p>
                )}

                {s.rankingAfter.length > 0 &&
                  s.winnerChanged &&
                  s.rankingAfter[0] && (
                    <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                      Recommendation becomes{" "}
                      <strong className="font-medium text-[var(--text-primary)]">
                        {nameOf(s.rankingAfter[0])}
                      </strong>
                      .
                    </p>
                  )}

                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  {s.constraintChecks.length} constraint checks re-run.
                </p>

                <Caveats items={s.caveats} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
