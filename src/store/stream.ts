/**
 * Server-Sent Events as a view over the append-only log.
 *
 * The stream is never the source of truth — every finding is already in the
 * event store. This tails the log: it reads events after a sequence number,
 * emits each as an SSE frame stamped with its `seq`, and polls for more. A
 * dropped connection, function timeout or cold start loses nothing: the client
 * reconnects with `?since=<seq>` (or the `Last-Event-ID` header) and the server
 * replays from there. ARCHITECTURE.md section 9.
 */

import type { StoredEvent } from '../contracts/events';

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no', // defeat proxy buffering so frames arrive live
};

export interface SseOptions {
  /** Resume point. Events with seq greater than this are sent. */
  since: number;
  pollMs?: number;
  /** Close the stream after this long, so it stays inside the function limit; the client resumes. */
  deadlineMs?: number;
  /** When an emitted event matches, send a `done` frame and close. */
  isTerminal?: (e: StoredEvent) => boolean;
}

/**
 * Build an SSE ReadableStream from a "read events after seq" function. The
 * caller supplies how to fetch (a single stream, or a merge of types), keeping
 * this agnostic to what is being tailed.
 */
export function sseStream(
  fetchSince: (sinceSeq: number) => Promise<StoredEvent[]>,
  opts: SseOptions,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const pollMs = opts.pollMs ?? 300;
  const deadline = Date.now() + (opts.deadlineMs ?? 25_000);
  let since = opts.since;
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      send(`: connected, resuming after seq ${since}\n\n`);
      try {
        for (;;) {
          if (cancelled) return;
          const events = await fetchSince(since);
          for (const e of events) {
            since = Math.max(since, e.seq);
            send(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
            if (opts.isTerminal?.(e)) {
              send(`event: done\ndata: {"since":${since}}\n\n`);
              controller.close();
              return;
            }
          }
          if (Date.now() > deadline) {
            // Not an error: a serverless-friendly checkpoint. The client
            // reconnects with ?since to continue exactly where this left off.
            send(`event: timeout\ndata: {"since":${since}}\n\n`);
            controller.close();
            return;
          }
          await new Promise((r) => setTimeout(r, pollMs));
        }
      } catch (err) {
        send(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`);
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

/** Resume point from the SSE reconnect header or a query param. */
export function resumeFrom(req: Request): number {
  const header = req.headers.get('last-event-id');
  const param = new URL(req.url).searchParams.get('since');
  const n = Number(header ?? param ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
