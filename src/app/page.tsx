import { loadSnapshot } from "@/lib/snapshot";
import { SafetyBanner } from "@/components/SafetyBanner";
import { SideNav, type Section } from "@/components/SideNav";
import { MetricStrip } from "@/components/MetricStrip";
import { DecisionHeader } from "@/components/DecisionHeader";
import { CounterExplanation } from "@/components/CounterExplanation";
import { EligibilityMatrix } from "@/components/EligibilityMatrix";
import { RankingPanel } from "@/components/RankingPanel";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { LiveRunPanel } from "@/components/LiveRunPanel";
import { IntegrityPanel } from "@/components/IntegrityPanel";
import { AssumptionsPanel } from "@/components/AssumptionsPanel";

/**
 * The analysis is read from a frozen snapshot rather than executed here.
 *
 * Running the pipeline needs an authenticated Claude Code CLI; reading a
 * committed snapshot needs nothing. That is what lets anyone clone the
 * repository and see the whole system work. The one place that does call the
 * model — the live run panel — asks for it explicitly and says so when it
 * cannot.
 *
 * Layout follows the pattern that holds up for decision tools: a persistent
 * section rail, a short strip of numbers that qualify everything below them,
 * then the argument in the order a buyer actually needs it — who is eligible,
 * how they rank, what breaks the plan, and whether any of it can be trusted.
 * Detail stays behind a click rather than competing for the same screen.
 */
export const dynamic = "force-static";

const SECTIONS: Section[] = [
  { id: "decision", label: "Recommendation", hint: "and why it might be wrong" },
  { id: "eligibility", label: "Eligibility", hint: "every constraint, per supplier" },
  { id: "ranking", label: "Ranking", hint: "and how stable it is" },
  { id: "scenarios", label: "Supply risk", hint: "when the plan changes" },
  { id: "live", label: "Run it", hint: "watch the pipeline work" },
  { id: "integrity", label: "Evidence checks", hint: "how it was measured" },
  { id: "assumptions", label: "Assumptions", hint: "ours, not the documents'" },
];

export default async function Home() {
  const snapshot = await loadSnapshot();

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <SafetyBanner />

      <header className="border-b border-[var(--hairline)] bg-[var(--surface-1)]">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Manufacturing Decision Copilot
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            Supplier shortlisting · {snapshot.screen.suppliers.length} suppliers
            against 7 mandatory requirements
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[88rem] gap-8 px-6 py-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="mb-6 lg:mb-0">
          <SideNav sections={SECTIONS} />
        </div>

        <main className="min-w-0 space-y-6">
          <MetricStrip snapshot={snapshot} />

          <div id="decision" className="scroll-mt-6 space-y-6">
            <DecisionHeader snapshot={snapshot} />
            <CounterExplanation snapshot={snapshot} />
          </div>

          <EligibilityMatrix snapshot={snapshot} />
          <RankingPanel snapshot={snapshot} />
          <ScenarioPanel snapshot={snapshot} />
          <LiveRunPanel />
          <IntegrityPanel snapshot={snapshot} />
          <AssumptionsPanel snapshot={snapshot} />

          <footer className="pb-4 pt-2 text-xs leading-relaxed text-[var(--text-muted)]">
            Supplier documents in this prototype are constructed for evaluation
            and do not describe real companies. Analysis frozen{" "}
            {new Date(snapshot.generatedAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            .
          </footer>
        </main>
      </div>
    </div>
  );
}
