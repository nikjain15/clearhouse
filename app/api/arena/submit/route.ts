/**
 * Scam our agent.
 *
 * Every control from PLATFORM.md section 3 applies: the window, the rate limit,
 * the size cap, the content filter before rendering, and the submission
 * reaching the underwriter as untrusted data rather than as instructions.
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkRateLimit, clientHash, windowState } from '../../../../src/arena/ratelimit';
import { outcomeFromDecision, recordSubmission, submissionToPersona } from '../../../../src/arena/submit';
import { underwrite } from '../../../../src/engine/underwrite';
import { getRuntime, measureVarianceFloor } from '../../../../src/runtime/context';
import { registryFor } from '../../../../src/merchants';
import { ScriptedMerchant } from '../../../../src/merchants/scripted';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 1. The window. Outside it the endpoint is read only, so an unauthenticated
  //    endpoint calling a paid API is not left open on the indexed internet.
  const win = windowState();
  if (!win.open) {
    return NextResponse.json({ error: 'arena_closed', phase: win.phase, detail: win.message }, { status: 403 });
  }

  // 2. Rate limit.
  const limit = await checkRateLimit(req, 'arena');
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited', detail: limit.reason }, { status: 429 });
  }

  let body: { handle?: string; persona?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const text = String(body.persona ?? '');
  if (text.trim().length < 20) {
    return NextResponse.json(
      { error: 'too_short', detail: 'Describe the merchant and what it is trying to get away with, in at least a sentence or two.' },
      { status: 400 },
    );
  }

  const mode = body.mode === 'bonded' ? 'bonded' : 'cold';
  const rt = getRuntime();

  // 3. Filter before anything renders, and record the attempt either way.
  const { record, filtered } = await recordSubmission(
    { handle: String(body.handle ?? ''), personaText: text, submitterHash: clientHash(req) },
    rt.store,
  );

  if (!filtered.clean) {
    return NextResponse.json({ submission: record, detail: filtered.reasons.join(' ') }, { status: 400 });
  }

  try {
    // 4. The submission reaches the model as untrusted data inside a delimited
    //    envelope, and comes back through a constrained schema. An injection
    //    attempt produces a validation failure, not an executed instruction.
    const { persona, draft } = await submissionToPersona(record.id, text, rt.model, mode);

    const varianceFloor = await measureVarianceFloor(rt);
    const result = await underwrite(
      {
        merchant: new ScriptedMerchant(persona, rt.canaries),
        amountMinor: Math.round(persona.catalog[0].feed_price * 100),
        currency: 'USD',
        purpose: persona.catalog[0].title,
        registry: registryFor(persona),
        canaries: rt.canaries,
        holdout: rt.holdout,
        varianceFloor,
      },
      rt.store,
      rt.model,
      rt.clock,
    );

    const scored = {
      ...record,
      outcome: outcomeFromDecision(result.decision.decision),
      score: result.decision.score,
      topReasons: result.decision.reasons.slice(0, 3),
      provisionalTaxonomy: draft.suggested_taxonomy && draft.suggested_taxonomy !== 'new' ? draft.suggested_taxonomy : null,
    };

    await rt.store.append([
      {
        eventId: randomUUID(),
        type: 'arena.scored',
        streamId: 'arena',
        payload: {
          submissionId: record.id,
          fileId: result.fileId,
          score: result.decision.score,
          outcome: scored.outcome,
        },
      },
      // A submission that beats the score becomes a CANDIDATE case. It does not
      // enter the eval set: that requires a human, and the gate is the security
      // boundary. F22.
      ...(scored.outcome === 'cleared'
        ? [
            {
              eventId: randomUUID(),
              type: 'case.candidate' as const,
              streamId: 'eval',
              payload: {
                caseId: `CASE-${record.id}`,
                merchantId: persona.id,
                source: 'arena' as const,
                label: 'fraud' as const,
                provisionalTaxonomy: scored.provisionalTaxonomy,
              },
            },
          ]
        : []),
    ]);

    return NextResponse.json({
      submission: scored,
      decision: {
        decision: result.decision.decision,
        score: result.decision.score,
        mode: result.decision.mode,
        covered: result.decision.covered,
        reasons: result.decision.reasons.slice(0, 4),
      },
      intendedAttack: draft.intended_attack,
      candidateCase: scored.outcome === 'cleared',
      note:
        scored.outcome === 'cleared'
          ? 'This beat the score. It is now a candidate eval case awaiting human promotion. Nothing enters the eval set automatically, because auto-ingesting adversary-submitted cases would make the label come from our own verdict.'
          : null,
    });
  } catch (e) {
    return NextResponse.json(
      {
        submission: record,
        error: 'could_not_build_persona',
        detail:
          e instanceof Error
            ? e.message
            : 'The submission did not produce a persona that passes validation, which is the schema boundary doing its job.',
      },
      { status: 422 },
    );
  }
}

export async function GET() {
  const win = windowState();
  return NextResponse.json({ window: win, maxChars: Number(process.env.CLEARHOUSE_ARENA_MAX_CHARS ?? 4000) });
}
