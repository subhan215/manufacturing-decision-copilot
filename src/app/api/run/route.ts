import "server-only";

import { getCorpus } from "@/lib/ingestion/loader";
import {
  loadRequirements,
  requirementsVersion,
  screenSupplier,
} from "@/lib/eligibility/index";
import { assertClaudeCodeAvailable } from "@/lib/llm/preflight";
import { DEFAULT_AS_OF_DATE } from "@/lib/eligibility/screen";
import type { SupplierScreen } from "@/lib/eligibility/types";

/**
 * Live pipeline run, streamed as Server-Sent Events.
 *
 * A Route Handler rather than a Server Action, deliberately. Next.js waits for
 * an action to return before sending anything, so progress over a run of this
 * length would arrive in one lump at the end — which is not progress. Returning
 * a ReadableStream immediately and writing into it from a background task is
 * the pattern that actually streams.
 *
 * This is strictly additive: the interface reads the committed snapshot and
 * works with no CLI at all. This endpoint only exists to show the pipeline
 * running for real, and it fails loudly rather than silently degrading, so a
 * reviewer without a Claude Code login gets a clear message instead of a hang.
 */

export const dynamic = "force-dynamic";
// Node runtime, not edge: the SDK spawns the Claude Code CLI as a subprocess.
export const runtime = "nodejs";

type Event =
  | { type: "start"; documents: number; suppliers: number; asOfDate: string }
  | { type: "supplier"; done: number; total: number; supplierId: string; name: string }
  | {
      type: "verdict";
      supplierId: string;
      supplierName: string;
      requirementId: string;
      status: string;
      comparison: string | null;
      quote: string | null;
      verified: boolean;
      decidedInCode: boolean;
    }
  | { type: "done"; eligible: string[]; durationMs: number; cached: boolean }
  | { type: "error"; message: string; hint?: string };

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: Event) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      // Not awaited: the Response must be returned before this work begins,
      // or nothing streams.
      void (async () => {
        const startedAt = Date.now();
        try {
          assertClaudeCodeAvailable();

          const corpus = await getCorpus();
          const requirementsFile = await loadRequirements();
          const requirements = requirementsFile.requirements;

          send({
            type: "start",
            documents: corpus.suppliers.length + 1,
            suppliers: corpus.suppliers.length,
            asOfDate: DEFAULT_AS_OF_DATE,
          });

          const screens: SupplierScreen[] = [];
          let done = 0;

          // Sequential on purpose. The screening path caps concurrency at 2 to
          // stay clear of rate limiting, and here a readable progression
          // matters more than wall-clock: this endpoint exists to be watched.
          for (const supplier of corpus.suppliers) {
            const name = supplier.doc.supplierName ?? supplier.doc.docId;
            send({
              type: "supplier",
              done,
              total: corpus.suppliers.length,
              supplierId: supplier.doc.docId,
              name,
            });

            const result = await screenSupplier({
              supplier,
              requirements,
              corpus,
              asOfDate: DEFAULT_AS_OF_DATE,
            });
            screens.push(result);
            done++;

            for (const v of result.verdicts) {
              send({
                type: "verdict",
                supplierId: result.supplierId,
                supplierName: result.supplierName,
                requirementId: v.requirementId,
                status: v.status,
                comparison: v.comparison,
                quote: v.citationQuote,
                verified: !v.citationUnverified,
                // Everything except a qualitative judgement was decided by
                // code, which is the property the run is meant to show.
                decidedInCode: v.kind !== "qualitative",
              });
            }
          }

          const elapsed = Date.now() - startedAt;
          send({
            type: "done",
            eligible: screens.filter((s) => s.eligible).map((s) => s.supplierId),
            durationMs: elapsed,
            // A full 161-verdict run takes minutes uncached and seconds from
            // the committed cache. Saying which happened keeps the reported
            // duration from being read as a cold-run benchmark.
            cached: elapsed < 20_000,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send({
            type: "error",
            message,
            hint: "The interface reads a committed snapshot and needs none of this. A live run additionally requires the Claude Code CLI, installed and logged in.",
          });
        } finally {
          finish();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Proxies that buffer would defeat the point.
      "X-Accel-Buffering": "no",
    },
  });
}

export async function HEAD() {
  // Cheap capability probe for the interface, so the run control can say
  // whether a live run is possible before anyone clicks it.
  try {
    assertClaudeCodeAvailable();
    const version = requirementsVersion(await loadRequirements());
    return new Response(null, {
      status: 204,
      headers: { "X-Requirements-Version": version },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
