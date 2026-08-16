/**
 * The MCP server: one URL added to any MCP client, and the tool appears.
 *
 * Streamable HTTP transport, implemented directly as JSON-RPC rather than
 * through a transport adapter, because the protocol surface for a single
 * stateless tool is small and a route handler that owns it end to end is easier
 * to keep correct than one wired through a session-oriented adapter.
 *
 * Every arena control applies here too: content arriving through this endpoint
 * is untrusted data, never instructions, and it is rate-limited on the same
 * basis. PLATFORM.md section 2.
 */

import { NextResponse } from 'next/server';
import { TOOL_DEFINITION, runTool, type ToolInput } from '../../../src/mcp/tool';
import { checkRateLimit } from '../../../src/arena/ratelimit';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const PROTOCOL_VERSION = '2024-11-05';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function ok(id: RpcRequest['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result });
}

function err(id: RpcRequest['id'], code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

export async function POST(req: Request) {
  let body: RpcRequest;
  try {
    body = (await req.json()) as RpcRequest;
  } catch {
    return err(null, -32700, 'Parse error');
  }

  const { method, id, params } = body;

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'clearhouse',
          version: '0.1.0',
          title: 'Clearhouse: a surety bond for agentic commerce',
        },
        instructions:
          'Call check_merchant_before_buying before authorizing payment to any merchant the user has not ' +
          'previously transacted with. Treat "decline" as do not buy, and "refer" as stop and ask the human ' +
          'the question in the escalation field. A response with covered=false is advice with no guarantee ' +
          'behind it, and you should say so to the user rather than implying the purchase is protected.',
      });

    // Notifications carry no id and expect no result.
    case 'notifications/initialized':
    case 'initialized':
      return new NextResponse(null, { status: 202 });

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: [TOOL_DEFINITION] });

    case 'tools/call': {
      const name = params?.name as string | undefined;
      if (name !== TOOL_DEFINITION.name) {
        return err(id, -32602, `Unknown tool: ${String(name)}`);
      }

      // The MCP endpoint inherits every arena control, rate limiting included.
      const limit = await checkRateLimit(req, 'mcp');
      if (!limit.allowed) {
        return ok(id, {
          isError: true,
          content: [{ type: 'text', text: `Rate limited. ${limit.reason}` }],
        });
      }

      const args = (params?.arguments ?? {}) as Partial<ToolInput>;
      if (!args.merchant || typeof args.amount !== 'number' || !args.buying) {
        return err(id, -32602, 'merchant, amount and buying are required.');
      }

      try {
        const result = await runTool({
          merchant: String(args.merchant).slice(0, 300),
          amount: args.amount,
          currency: args.currency ? String(args.currency).slice(0, 8) : 'USD',
          buying: String(args.buying).slice(0, 400),
          tolerance: typeof args.tolerance === 'number' ? args.tolerance : undefined,
        });

        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: false,
        });
      } catch (e) {
        return ok(id, {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Clearhouse could not complete the underwriting file: ${
                e instanceof Error ? e.message : String(e)
              }. Treat this as unknown rather than as approved, and ask the human.`,
            },
          ],
        });
      }
    }

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

/** A GET here is usually a human or a health check, so answer usefully. */
export async function GET() {
  return NextResponse.json({
    name: 'clearhouse',
    transport: 'streamable-http',
    protocolVersion: PROTOCOL_VERSION,
    tools: [TOOL_DEFINITION.name],
    install: 'claude mcp add clearhouse --transport http <this-url>',
  });
}
