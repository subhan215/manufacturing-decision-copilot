"use client";

import { useEffect, useRef, useState } from "react";

import { STATUS_STYLES } from "./statusStyle";
import type { VerdictStatus } from "@/lib/eligibility/types";

/**
 * Watch the pipeline run for real.
 *
 * Everything else on this page reads a frozen snapshot, which is what lets the
 * application run with no API key and no login. This panel is the one place
 * that calls the model, and it is strictly opt-in: nothing starts until the
 * button is pressed, and when no Claude Code CLI is present it says so rather
 * than failing quietly.
 *
 * What it is for is showing the architecture in motion — each verdict arriving
 * with its quote, and the label saying whether that verdict was decided in code
 * or by the model.
 */

type Line =
  | { kind: "note"; text: string }
  | {
      kind: "verdict";
      supplier: string;
      requirementId: string;
      status: VerdictStatus;
      comparison: string | null;
      quote: string | null;
      verified: boolean;
      decidedInCode: boolean;
    };

type Phase = "idle" | "checking" | "running" | "done" | "error";

export function LiveRunPanel() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [available, setAvailable] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(
    null,
  );
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/run", { method: "HEAD" })
      .then((r) => {
        if (cancelled) return;
        setAvailable(r.ok);
        setPhase("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setAvailable(false);
        setPhase("idle");
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  // Follow the tail as verdicts arrive, which is the point of watching.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  async function run() {
    setPhase("running");
    setLines([]);
    setSummary(null);
    setError(null);
    setProgress({ done: 0, total: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/run", { signal: controller.signal });
      if (!res.body) throw new Error("The server returned no stream.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; a partial frame stays in
        // the buffer until the rest arrives.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === "start") {
            setProgress({ done: 0, total: event.suppliers });
            setLines((prev) => [
              ...prev,
              {
                kind: "note",
                text: `Ingested ${event.documents} documents · assessing against ${event.asOfDate}`,
              },
            ]);
          } else if (event.type === "supplier") {
            setProgress({ done: event.done, total: event.total });
          } else if (event.type === "verdict") {
            setLines((prev) => [
              ...prev,
              {
                kind: "verdict",
                supplier: event.supplierName,
                requirementId: event.requirementId,
                status: event.status,
                comparison: event.comparison,
                quote: event.quote,
                verified: event.verified,
                decidedInCode: event.decidedInCode,
              },
            ]);
          } else if (event.type === "done") {
            setPhase("done");
            setSummary(
              `${event.eligible.length} eligible · ${(event.durationMs / 1000).toFixed(1)}s` +
                (event.cached
                  ? " — served from the committed response cache, so this is replay speed rather than a cold run"
                  : " — live model calls"),
            );
          } else if (event.type === "error") {
            setPhase("error");
            setError({ message: event.message, hint: event.hint });
          }
        }
      }
      setPhase((p) => (p === "running" ? "done" : p));
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase("error");
      setError({ message: err instanceof Error ? err.message : String(err) });
    }
  }

  const decidedInCode = lines.filter(
    (l) => l.kind === "verdict" && l.decidedInCode,
  ).length;
  const verdictCount = lines.filter((l) => l.kind === "verdict").length;

  return (
    <section
      id="live"
      className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Run the pipeline
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            Everything above reads a frozen analysis, which is why this
            application needs no API key. This runs the real thing — each verdict
            appears as it is decided, with the quote it rests on.
          </p>
        </div>

        <button
          onClick={run}
          disabled={phase === "running" || phase === "checking" || !available}
          className="rounded border border-[var(--hairline)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-opacity hover:bg-[var(--page-plane)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase === "running" ? "Running…" : "Run analysis"}
        </button>
      </div>

      {phase === "idle" && !available && (
        <p className="mt-4 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          No Claude Code CLI is available here, so a live run is not possible —
          everything else on this page still works, because it reads the
          committed snapshot. To run the pipeline yourself: install Claude Code,
          run <code className="text-[var(--text-primary)]">claude login</code>,
          and reload.
        </p>
      )}

      {phase === "running" && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs text-[var(--text-secondary)]">
            <span>
              Screening supplier {Math.min(progress.done + 1, progress.total)} of{" "}
              {progress.total}
            </span>
            <span className="tnum">{verdictCount} verdicts</span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm"
            style={{ background: "var(--gridline)" }}
          >
            <div
              className="h-1.5 rounded-sm transition-[width] duration-300"
              style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                background: "var(--series-cost)",
              }}
            />
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div
          ref={logRef}
          className="mt-4 max-h-80 overflow-y-auto rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-3"
        >
          <ul className="space-y-1.5">
            {lines.map((l, i) =>
              l.kind === "note" ? (
                <li key={i} className="text-xs text-[var(--text-muted)]">
                  {l.text}
                </li>
              ) : (
                <li key={i} className="text-xs leading-relaxed">
                  <span className="tnum flex flex-wrap items-baseline gap-x-2">
                    <span
                      className="inline-flex h-4 min-w-[1.5rem] items-center justify-center rounded-sm px-1 text-[10px] font-semibold"
                      style={{
                        color: STATUS_STYLES[l.status].color,
                        background: STATUS_STYLES[l.status].tint,
                      }}
                    >
                      {STATUS_STYLES[l.status].mark}
                    </span>
                    <span className="text-[var(--text-primary)]">
                      {l.supplier}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {l.requirementId}
                    </span>
                    {l.comparison && (
                      <span className="text-[var(--text-secondary)]">
                        {l.comparison}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {l.decidedInCode ? "decided in code" : "model judgement"}
                      {l.verified ? " · citation verified" : " · unverified"}
                    </span>
                  </span>
                  {l.quote && (
                    <span className="mt-0.5 block truncate border-l-2 border-[var(--gridline)] pl-2 text-[var(--text-muted)]">
                      “{l.quote}”
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {summary && (
        <p className="mt-3 text-sm text-[var(--text-primary)]">
          {summary}.{" "}
          <span className="text-[var(--text-secondary)]">
            {decidedInCode} of {verdictCount} verdicts were decided by code
            rather than by the model — the model reported what each document
            said, and the comparison against the limit was arithmetic.
          </span>
        </p>
      )}

      {error && (
        <div className="mt-4 rounded border border-[var(--hairline)] bg-[var(--page-plane)] p-3">
          <p className="text-sm text-[var(--status-critical)]">{error.message}</p>
          {error.hint && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {error.hint}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
