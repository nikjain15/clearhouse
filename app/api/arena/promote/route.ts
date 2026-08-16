/**
 * The human promotion gate.
 *
 * This gate is not bureaucracy, it is the security boundary. Auto-ingesting
 * adversary-submitted cases means the label comes from our own verdict, which
 * makes the loop self-confirming, and it lets anyone with a form submission
 * steer or freeze future versions through the eval gate. F22.
 *
 * Token-gated, and the token is a shared secret in environment configuration.
 * Appropriate for a hackathon build, and it would not be in production. Saying
 * so costs nothing.
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getStore } from '../../../../src/store';
import { nextProvisionalId } from '../../../../src/arena/submit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const expected = process.env.CLEARHOUSE_PROMOTION_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'promotion_disabled', detail: 'No promotion token is configured in this deployment.' },
      { status: 503 },
    );
  }

  const provided = req.headers.get('x-clearhouse-promotion-token') ?? '';
  if (provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { caseId?: string; taxonomy?: string; promotedBy?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.caseId) {
    return NextResponse.json({ error: 'invalid_request', detail: 'caseId is required.' }, { status: 400 });
  }

  const store = getStore();
  const candidates = await store.readByType('case.candidate');
  const candidate = candidates.find((e) => (e.payload as { caseId: string }).caseId === body.caseId);
  if (!candidate) {
    return NextResponse.json({ error: 'unknown_case', caseId: body.caseId }, { status: 404 });
  }

  const promoted = await store.readByType('case.promoted');
  if (promoted.some((e) => (e.payload as { caseId: string }).caseId === body.caseId)) {
    return NextResponse.json({ error: 'already_promoted', caseId: body.caseId }, { status: 409 });
  }

  // Provisional IDs run from F24 onward. The taxonomy growing live on stage is
  // a feature, and a provisional ID becomes permanent exactly here.
  const existing = promoted.map((e) => (e.payload as { taxonomy: string }).taxonomy);
  const taxonomy = body.taxonomy || nextProvisionalId(existing);

  await store.append([
    {
      eventId: randomUUID(),
      type: 'case.promoted',
      streamId: 'eval',
      payload: { caseId: body.caseId, promotedBy: body.promotedBy || 'human', taxonomy },
    },
  ]);

  return NextResponse.json({
    promoted: true,
    caseId: body.caseId,
    taxonomy,
    next:
      'The case is now in the eval set. A new scorecard version must clear the recall floor on EVERY attack class, including this one, before it ships.',
  });
}

export async function GET() {
  const store = getStore();
  const candidates = await store.readByType('case.candidate');
  const promoted = await store.readByType('case.promoted');
  const promotedIds = new Set(promoted.map((e) => (e.payload as { caseId: string }).caseId));

  return NextResponse.json({
    pending: candidates
      .map((e) => e.payload as { caseId: string; merchantId: string; source: string; provisionalTaxonomy: string | null })
      .filter((c) => !promotedIds.has(c.caseId)),
    promoted: promoted.map((e) => e.payload),
    note: 'Nothing enters the eval set without a human here. That is the security boundary, not bureaucracy.',
  });
}
