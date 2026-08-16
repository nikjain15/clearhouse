/**
 * SSE view over a single underwriting file, resumable.
 *
 * GET /api/underwrite/stream?fileId=UF-0007&since=<seq>
 *
 * Tails `file:<fileId>`: findings as they land, then the decision. The stream is
 * a view over the log, so a drop is recoverable — reconnect with ?since or the
 * Last-Event-ID header. ARCHITECTURE.md section 9.
 */

import { getStore } from '../../../../src/store';
import { sseStream, resumeFrom, SSE_HEADERS } from '../../../../src/store/stream';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const fileId = new URL(req.url).searchParams.get('fileId');
  if (!fileId) {
    return new Response(JSON.stringify({ error: 'fileId is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const store = getStore();
  const stream = sseStream((since) => store.read(`file:${fileId}`, since), {
    since: resumeFrom(req),
    // The issued decision is the terminal event for a file.
    isTerminal: (e) => e.type === 'decision.issued',
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
