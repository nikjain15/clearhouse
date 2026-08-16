/**
 * Replay.
 *
 * Reruns the scorecard over stored findings and reproduces the decision with
 * ZERO model calls, at any layer. This is a different thing from the cache: the
 * cache avoids repeating a model call, replay never makes one.
 */

import { NextResponse } from 'next/server';
import { replay } from '../../../../src/engine/underwrite';
import { scorecardByVersion, ACTIVE_SCORECARD } from '../../../../src/engine/scorecard';
import { getStore } from '../../../../src/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const url = new URL(req.url);
  const requested = url.searchParams.get('scorecard');

  // The default MUST be the version the decision was issued under, read from the
  // log, not the currently-active version. "A decision issued under v1 replays
  // under v1 forever" is then an invariant the endpoint enforces, rather than a
  // convention that happens to hold. An explicit ?scorecard= is still honored
  // for the cross-version demonstration, and the response flags when the result
  // no longer reproduces the version of record.
  const store = getStore();
  const stream = await store.read(`file:${fileId}`);
  const issued = stream.find((e) => e.type === 'decision.issued');
  if (!issued) {
    return NextResponse.json({ error: 'unknown_file', fileId }, { status: 404 });
  }
  const issuedVersion =
    (issued.payload as { decision?: { versions?: { scorecard?: string } } }).decision?.versions?.scorecard ??
    ACTIVE_SCORECARD.version;

  const version = requested ?? issuedVersion;
  const scorecard = scorecardByVersion(version);
  if (!scorecard) {
    return NextResponse.json({ error: 'unknown_scorecard_version', version }, { status: 400 });
  }

  const result = await replay(fileId, store, scorecard);
  if (!result) {
    return NextResponse.json({ error: 'unknown_file', fileId }, { status: 404 });
  }

  return NextResponse.json({
    fileId,
    mode: result.mode,
    scorecardVersion: scorecard.version,
    issuedScorecardVersion: issuedVersion,
    reproducesVersionOfRecord: scorecard.version === issuedVersion,
    findingCount: result.findings.length,
    findings: result.findings,
    scorecard: result.scorecard,
    note:
      'Recomputed from stored findings alone. No model was called at any layer, which is what makes a decision auditable years after the model that produced the findings has changed.',
  });
}
