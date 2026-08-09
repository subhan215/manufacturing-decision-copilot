import type { SupplierSignals } from "../ranking/types.ts";
import {
  ORDER_QUANTITIES,
  SECONDARY_VIABILITY_FLOOR,
  SPLIT_CANDIDATES,
  type AllocationLeg,
  type ConcentrationMetric,
  type SplitAnalysis,
  type SplitOption,
} from "./types.ts";

/**
 * Split allocation between two suppliers.
 *
 * The interesting result at this order size is not which split is best but
 * that most of them are unavailable: the ratios procurement teams normally use
 * leave the second supplier below every candidate's minimum order quantity.
 * Infeasible options are therefore reported with their reason rather than
 * filtered out — the infeasibility is the finding.
 */

/** Herfindahl-Hirschman Index over allocation shares. */
export function concentration(shares: number[]): ConcentrationMetric {
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);
  return {
    hhi,
    effectiveSuppliers: hhi === 0 ? 0 : 1 / hhi,
  };
}

export interface MoqLookup {
  supplierId: string;
  moq: number;
}

function leg(
  signals: SupplierSignals,
  share: number,
  quantity: number,
  moq: number,
): AllocationLeg {
  const units = Math.round(share * quantity);
  return {
    supplierId: signals.supplierId,
    supplierName: signals.supplierName,
    share,
    units,
    moq,
    meetsMoq: units >= moq,
    unitCost: signals.cost.value,
  };
}

export function analyseSplits(params: {
  signals: SupplierSignals[];
  moqs: MoqLookup[];
  orderQuantity: number;
}): SplitAnalysis {
  const { signals, moqs, orderQuantity } = params;
  const moqOf = (id: string) =>
    moqs.find((m) => m.supplierId === id)?.moq ?? Number.POSITIVE_INFINITY;

  // Sole-source baseline: the cheapest single supplier that can take the whole
  // order on its own. Concentration is 1.0 by definition, which is the honest
  // framing of what a single-supplier recommendation actually is.
  const soleCandidates = signals
    .filter((s) => orderQuantity >= moqOf(s.supplierId))
    .sort((a, b) => a.cost.value - b.cost.value);
  const best = soleCandidates[0];

  // Beyond the standard ratios, the exact boundary each supplier's minimum
  // forces. Without these, a supplier whose minimum lands between two candidate
  // ratios looks impossible to split with when in fact one arrangement exists —
  // a tight one, which is precisely what a buyer needs told.
  const derivedShares = [
    ...new Set(
      signals
        .map((s) => 1 - moqOf(s.supplierId) / orderQuantity)
        .filter(
          (share) =>
            Number.isFinite(share) &&
            share >= SECONDARY_VIABILITY_FLOOR &&
            share <= 0.5 &&
            !SPLIT_CANDIDATES.some((c) => Math.abs(c - share) < 1e-9),
        ),
    ),
  ].sort((a, b) => a - b);

  const options: SplitOption[] = [];

  // Standard ratios first: presenting a boundary-derived split ahead of the
  // ratios teams actually use would misrepresent which is the normal choice.
  for (const secondaryShare of [...SPLIT_CANDIDATES, ...derivedShares]) {
    const derivedFromMoq = !SPLIT_CANDIDATES.some(
      (c) => Math.abs(c - secondaryShare) < 1e-9,
    );
    for (const primary of signals) {
      for (const secondary of signals) {
        if (primary.supplierId === secondary.supplierId) continue;
        // A pair is considered once, with the larger share to `primary`.
        if (secondaryShare === 0.5 && primary.supplierId > secondary.supplierId)
          continue;

        const primaryLeg = leg(
          primary,
          1 - secondaryShare,
          orderQuantity,
          moqOf(primary.supplierId),
        );
        const secondaryLeg = leg(
          secondary,
          secondaryShare,
          orderQuantity,
          moqOf(secondary.supplierId),
        );

        const reasons: string[] = [];
        if (!primaryLeg.meetsMoq) {
          reasons.push(
            `${primaryLeg.supplierName} would receive ${primaryLeg.units.toLocaleString()} units, below its ${primaryLeg.moq.toLocaleString()}-unit minimum`,
          );
        }
        if (!secondaryLeg.meetsMoq) {
          reasons.push(
            `${secondaryLeg.supplierName} would receive ${secondaryLeg.units.toLocaleString()} units, below its ${secondaryLeg.moq.toLocaleString()}-unit minimum`,
          );
        }
        if (secondaryShare < SECONDARY_VIABILITY_FLOOR) {
          reasons.push(
            `a ${Math.round(secondaryShare * 100)}% allocation is below the ${Math.round(SECONDARY_VIABILITY_FLOOR * 100)}% floor at which a second supplier stays commercially engaged`,
          );
        }

        const blendedUnitCost =
          primaryLeg.share * primary.cost.value +
          secondaryLeg.share * secondary.cost.value;

        options.push({
          orderQuantity,
          primary: primaryLeg,
          secondary: secondaryLeg,
          feasible: reasons.length === 0,
          infeasibleReason: reasons.length > 0 ? reasons.join("; ") : null,
          derivedFromMoq,
          blendedUnitCost,
          totalCost: blendedUnitCost * orderQuantity,
          // Both suppliers must deliver before the order is complete, so the
          // slower one governs. Our data gives a fixed lead time per supplier
          // that does not vary with the quantity allocated.
          leadTimeDays: Math.max(
            primary.leadTime.value,
            secondary.leadTime.value,
          ),
          blendedFailRate:
            primaryLeg.share * primary.quality.value +
            secondaryLeg.share * secondary.quality.value,
          blendedSustainability:
            primaryLeg.share * primary.sustainability.value +
            secondaryLeg.share * secondary.sustainability.value,
          concentration: concentration([primaryLeg.share, secondaryLeg.share]),
          costDeltaVsSoleSource: best
            ? (blendedUnitCost - best.cost.value) * orderQuantity
            : 0,
        });
      }
    }
  }

  // Ratios where the secondary allocation is below every supplier's minimum.
  const ratiosBlockedByMoq = SPLIT_CANDIDATES.filter((share) => {
    const units = share * orderQuantity;
    return signals.every((s) => units < moqOf(s.supplierId));
  }).map((s) => s);

  const feasible = options.filter((o) => o.feasible);
  const standardBlocked = ratiosBlockedByMoq.filter((r) => r <= 0.3);

  const headline =
    feasible.length === 0
      ? `No dual-source arrangement is possible for ${orderQuantity.toLocaleString()} units: every candidate split leaves one supplier below its minimum order quantity.`
      : standardBlocked.length > 0
        ? `Dual sourcing is possible for ${orderQuantity.toLocaleString()} units, but not at the ratios normally used. ` +
          `At ${standardBlocked.map((r) => `${100 - r * 100}/${r * 100}`).join(" and ")} the second supplier's share falls below every candidate's minimum order quantity, ` +
          `so only more even splits remain — and those forfeit the volume concentration that earns the better unit price.`
        : `Dual sourcing is available at ${orderQuantity.toLocaleString()} units across the full range of standard ratios.`;

  const caveats = [
    "Blended cost assumes each supplier charges its stated unit price regardless of the volume allocated. In practice a smaller allocation attracts a premium — commonly 10–20% — so the modelled cost of splitting is a best case. The supplied documents contain no volume-pricing data.",
    "Lead time is taken as the slower of the two suppliers, since the order is not complete until both have delivered. Our data gives one lead time per supplier and does not model how it might change with a smaller batch.",
    "Splitting is modelled on stated minimums and prices only. Qualification cost, tooling duplication and the overhead of managing a second relationship are real and are not represented here.",
  ];

  if (feasible.some((o) => o.derivedFromMoq)) {
    caveats.push(
      // "available", not "shown": this module does not know what the interface
      // chose to display, and a caveat that describes a table it cannot see
      // will eventually describe a table that isn't there.
      "One or more workable arrangements at this quantity are not standard ratios but the exact boundary a supplier's minimum order quantity allows. Those work only at that precise allocation: any reduction, and the order falls below a minimum.",
    );
  }

  return {
    orderQuantity,
    soleSourceBest: best
      ? {
          supplierId: best.supplierId,
          supplierName: best.supplierName,
          unitCost: best.cost.value,
          totalCost: best.cost.value * orderQuantity,
          leadTimeDays: best.leadTime.value,
          concentration: concentration([1]),
        }
      : null,
    options,
    feasibleCount: feasible.length,
    ratiosBlockedByMoq,
    headline,
    caveats,
  };
}

export function analyseAllQuantities(params: {
  signals: SupplierSignals[];
  moqs: MoqLookup[];
}): SplitAnalysis[] {
  return [ORDER_QUANTITIES.launch, ORDER_QUANTITIES.scaleUp].map((q) =>
    analyseSplits({ ...params, orderQuantity: q }),
  );
}
