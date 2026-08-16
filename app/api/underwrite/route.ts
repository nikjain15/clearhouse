/**
 * The ACP-shaped REST endpoint. The substrate under both the MCP server and the
 * board, and the path for anyone not on MCP.
 */

import { NextResponse } from 'next/server';
import { runTool, type ToolInput } from '../../../src/mcp/tool';
import { checkRateLimit } from '../../../src/arena/ratelimit';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const limit = await checkRateLimit(req, 'rest');
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited', detail: limit.reason }, { status: 429 });
  }

  let body: Partial<ToolInput>;
  try {
    body = (await req.json()) as Partial<ToolInput>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.merchant || typeof body.amount !== 'number' || !body.buying) {
    return NextResponse.json(
      { error: 'invalid_request', detail: 'merchant, amount and buying are required.' },
      { status: 400 },
    );
  }

  try {
    const result = await runTool({
      merchant: String(body.merchant).slice(0, 300),
      amount: body.amount,
      currency: body.currency ? String(body.currency).slice(0, 8) : 'USD',
      buying: String(body.buying).slice(0, 400),
      tolerance: typeof body.tolerance === 'number' ? body.tolerance : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error: 'underwriting_failed',
        detail: e instanceof Error ? e.message : String(e),
        guidance: 'Treat this as unknown rather than as approved, and ask a human.',
      },
      { status: 502 },
    );
  }
}
