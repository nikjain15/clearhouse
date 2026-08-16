/**
 * SSE view over a gauntlet run, resumable.
 *
 * GET /api/gauntlet/stream?since=<seq>
 *
 * The board is a projection of the log, so this tails the two event types the
 * board is built from — findings and issued decisions — across every file in
 * the run, in seq order. No single request runs the gauntlet; cells are
 * independent POSTs, and this is only the view. Reconnect with ?since or the
 * Last-Event-ID header. ARCHITECTURE.md section 9.
 */

import { getStore } from '../../../../src/store';
import { sseStream, resumeFrom, SSE_HEADERS } from '../../../../src/store/stream';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const store = getStore();
  const stream = sseStream(
    async (since) => {
      const [findings, decisions] = await Promise.all([
        store.readByType('check.finding', since),
        store.readByType('decision.issued', since),
      ]);
      return [...findings, ...decisions].sort((a, b) => a.seq - b.seq);
    },
    { since: resumeFrom(req) },
  );

  return new Response(stream, { headers: SSE_HEADERS });
}
