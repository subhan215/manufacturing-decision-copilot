import { loadSnapshot } from "@/lib/snapshot";
import { SafetyBanner } from "@/components/SafetyBanner";
import { DecisionHeader } from "@/components/DecisionHeader";
import { CounterExplanation } from "@/components/CounterExplanation";
import { EligibilityMatrix } from "@/components/EligibilityMatrix";
import { RankingPanel } from "@/components/RankingPanel";
import { IntegrityPanel } from "@/components/IntegrityPanel";
import { AssumptionsPanel } from "@/components/AssumptionsPanel";

/**
 * The analysis is read from a frozen snapshot rather than executed here.
 *
 * Running the pipeline needs an authenticated Claude Code CLI; reading a
 * committed snapshot needs nothing. That is what lets anyone clone the
 * repository and see the whole system work.
 */
export const dynamic = "force-static";

const SECTIONS = [
  { id: "cautions", label: "Cautions" },
  { id: "eligibility", label: "Eligibility" },
  { id: "ranking", label: "Ranking" },
  { id: "integrity", label: "Evidence checks" },
  { id: "assumptions", label: "Assumptions" },
];

export default async function Home() {
  const snapshot = await loadSnapshot();

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <SafetyBanner />

      <nav className="sticky top-0 z-20 border-b border-[var(--hairline)] bg-[var(--page-plane)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-6 py-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Manufacturing Decision Copilot
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            Supplier shortlisting
          </span>
          <ul className="ml-auto flex flex-wrap gap-4">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <DecisionHeader snapshot={snapshot} />
        <CounterExplanation snapshot={snapshot} />
        <EligibilityMatrix snapshot={snapshot} />
        <RankingPanel snapshot={snapshot} />
        <IntegrityPanel snapshot={snapshot} />
        <AssumptionsPanel snapshot={snapshot} />

        <footer className="pb-4 pt-2 text-xs leading-relaxed text-[var(--text-muted)]">
          Supplier documents in this prototype are constructed for evaluation and
          do not describe real companies. Analysis frozen{" "}
          {new Date(snapshot.generatedAt).toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          .
        </footer>
      </main>
    </div>
  );
}
