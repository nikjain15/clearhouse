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
  const version = url.searchParams.get('scorecard');

  const scorecard = version ? scorecardByVersion(version) : ACTIVE_SCORECARD;
  if (!scorecard) {
    return NextResponse.json({ error: 'unknown_scorecard_version', version }, { status: 400 });
  }

  const result = await replay(fileId, getStore(), scorecard);
  if (!result) {
    return NextResponse.json({ error: 'unknown_file', fileId }, { status: 404 });
  }

  return NextResponse.json({
    fileId,
    mode: result.mode,
    scorecardVersion: scorecard.version,
    findingCount: result.findings.length,
    findings: result.findings,
    scorecard: result.scorecard,
    note:
      'Recomputed from stored findings alone. No model was called at any layer, which is what makes a decision auditable years after the model that produced the findings has changed.',
  });
}
