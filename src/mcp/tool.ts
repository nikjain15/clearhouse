/**
 * One tool, one decision.
 *
 * Not a suite. A six-tool integration is a project, and in an agent context it
 * also crowds the model's tool list and gets called wrong. Everything else
 * (claims, appeals, re-underwriting, registry lookup) is secondary surface the
 * common path never touches.
 *
 * The tool is named for the moment it belongs to rather than the mechanism it
 * implements, because that is what determines whether a model calls it at the
 * right time. PLATFORM.md section 2.
 */

import type { Decision, MerchantSurface } from '../contracts/types';
import type { RegistryRecord } from '../contracts/ports';
import { loadPersonas, merchantFor, registryFor, type Persona } from '../merchants';
import { coldIntakeFromUrl, liveFetchEnabled, looksLikeUrl } from '../merchants/coldIntake';
import { underwrite } from '../engine/underwrite';
import { getRuntime, measureVarianceFloor } from '../runtime/context';

export const TOOL_NAME = 'check_merchant_before_buying';

export const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    'Underwrite a merchant BEFORE authorizing any payment to them, and get a decision you can act on. ' +
    'Call this whenever you are about to buy something from a merchant the user has not previously ' +
    'transacted with, or whenever money is about to move to a party you have not verified. ' +
    'Returns a decision (clear, conditional, refer, decline), a score with its mode, the reasons in ' +
    'plain language, and whether the purchase is covered by a guarantee. ' +
    'A "decline" means do not buy. A "refer" means stop and ask the human the question in the escalation field.',
  inputSchema: {
    type: 'object',
    properties: {
      merchant: {
        type: 'string',
        description:
          'The merchant endpoint, domain, or storefront URL you are about to buy from. For example "northgate-outlet.shop".',
      },
      amount: {
        type: 'number',
        description: 'The purchase amount in major units, for example 249.99.',
      },
      currency: {
        type: 'string',
        description: 'ISO 4217 currency code, for example "USD".',
        default: 'USD',
      },
      buying: {
        type: 'string',
        description: 'What is being bought, in plain words. For example "Apple Watch Series 10, 45mm".',
      },
      tolerance: {
        type: 'number',
        description:
          'Optional. The maximum the user is willing to have at risk without being asked, in major units. ' +
          'Defaults to the policy in the Clearhouse skill if omitted.',
      },
    },
    required: ['merchant', 'amount', 'buying'],
  },
} as const;

export interface ToolInput {
  merchant: string;
  amount: number;
  currency?: string;
  buying: string;
  tolerance?: number;
}

/**
 * The response, shaped so an agent can act on it without further reasoning.
 * `fee` and `guarantee_reference` appear only when `covered` is true, and
 * `escalation` only on `refer`.
 */
export interface ToolResponse {
  decision: 'clear' | 'conditional' | 'refer' | 'decline';
  score: number;
  mode: 'cold' | 'bonded';
  covered: boolean;
  reasons: Array<{ code: string; text: string }>;
  fee?: { amount: number; currency: string };
  guarantee_reference?: string;
  escalation?: {
    question: string;
    amount_at_risk: number;
    options: Array<{ action: string; terms: string }>;
  };
  /** What the agent should do, in one sentence, so it does not have to infer. */
  guidance: string;
  file_id: string;
  latency_ms: number;
  versions: { scorecard: string; checks: string; pricing: string };
  /** Present when we could not underwrite, rather than a fabricated score. */
  unavailable?: { reason: string };
}

/** Resolve a merchant string against the registry: id, domain, or display name. */
export function resolveMerchant(input: string): Persona | undefined {
  const needle = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');

  // Only the public registry (config/personas). The labeled eval set
  // (config/eval) is graded material and must never be resolvable through the
  // public tool, or a caller could enumerate and probe it.
  const personas = loadPersonas();

  const exact =
    personas.find((p) => p.id.toLowerCase() === needle) ??
    personas.find((p) => p.identity.domain.toLowerCase() === needle) ??
    personas.find((p) => p.display.name.toLowerCase() === needle);
  if (exact) return exact;

  // Substring fallback, but only when it is UNAMBIGUOUS. Two personas matching
  // the same needle used to resolve to whichever sorted first, silently handing
  // back a merchant the caller did not ask about. An ambiguous needle is "no
  // file", not a guess.
  if (needle.length > 4) {
    const partial = personas.filter((p) => p.identity.domain.toLowerCase().includes(needle));
    if (partial.length === 1) return partial[0];
  }
  return undefined;
}

function guidanceFor(d: Decision): string {
  switch (d.decision) {
    case 'decline':
      return 'Do not buy from this merchant. Tell the user why, using the reasons above.';
    case 'refer':
      return 'Stop and ask the human the question in the escalation field before authorizing anything. Do not proceed on your own judgment.';
    case 'conditional':
      return d.covered
        ? 'Proceed under scoped, revocable authority limited to this amount. The purchase is covered by a bond, so the buyer is made whole if the merchant breaches.'
        : 'Proceed under scoped, revocable authority limited to this amount, and tell the user this purchase is NOT covered: this merchant never applied for a bond, so no guarantee stands behind it.';
    case 'clear':
      return d.covered
        ? 'Proceed. The purchase is covered by a bond.'
        : 'Proceed under scoped authority, and tell the user this purchase is not covered by a guarantee.';
  }
}

export async function runTool(input: ToolInput): Promise<ToolResponse> {
  const currency = input.currency ?? 'USD';
  const persona = resolveMerchant(input.merchant);
  const rt = getRuntime();

  // The merchant surface comes from the registry, or from a guarded live fetch
  // of an unknown URL when CLEARHOUSE_LIVE_FETCH is on. A fetch failure (blocked
  // address, timeout, unparseable page) falls through to the unavailable
  // response rather than fabricating a score.
  let merchant: MerchantSurface | null = persona ? merchantFor(persona, rt.canaries) : null;
  let registry: RegistryRecord | null = persona ? registryFor(persona) : null;

  if (!merchant && liveFetchEnabled() && looksLikeUrl(input.merchant)) {
    try {
      const intake = await coldIntakeFromUrl(input.merchant, rt.model);
      if (intake) {
        merchant = intake.surface;
        registry = intake.registry;
      }
    } catch {
      // Leave merchant null; the unavailable response below handles it.
    }
  }

  // No fabricated score for a merchant whose surfaces we never read. An
  // underwriter that invents a file is the thing we exist to replace.
  if (!merchant || !registry) {
    const fetchNote = liveFetchEnabled()
      ? 'Live fetch is enabled but this input could not be fetched and read (not a reachable public URL, or the page could not be parsed).'
      : 'This deployment does not fetch arbitrary merchant endpoints (CLEARHOUSE_LIVE_FETCH is off).';
    return {
      decision: 'refer',
      score: 0,
      mode: 'cold',
      covered: false,
      reasons: [
        {
          code: 'SYS-01',
          text: `Clearhouse holds no file for "${input.merchant}" and produced no score. ${fetchNote} Absence of a file is not a pass.`,
        },
      ],
      guidance:
        'Stop and ask the human. Clearhouse has no file for this merchant and did not score it, so treat this as unknown rather than as approved.',
      escalation: {
        question: `Clearhouse has no file for ${input.merchant}. Approve a ${currency} ${input.amount.toFixed(2)} purchase from an ununderwritten merchant?`,
        amount_at_risk: input.amount,
        options: [
          { action: 'approve_scoped', terms: 'Approve under scoped, revocable authority. Uncovered.' },
          { action: 'decline', terms: 'Do not buy.' },
        ],
      },
      file_id: 'none',
      latency_ms: 0,
      versions: { scorecard: 'n/a', checks: 'n/a', pricing: 'n/a' },
      unavailable: { reason: fetchNote },
    };
  }

  const varianceFloor = await measureVarianceFloor(rt);

  const result = await underwrite(
    {
      merchant,
      amountMinor: Math.round(input.amount * 100),
      currency,
      purpose: input.buying,
      toleranceMinor: input.tolerance !== undefined ? Math.round(input.tolerance * 100) : null,
      registry,
      canaries: rt.canaries,
      holdout: rt.holdout,
      varianceFloor,
    },
    rt.store,
    rt.model,
    rt.clock,
  );

  const d = result.decision;
  const res: ToolResponse = {
    decision: d.decision,
    score: d.score,
    mode: d.mode,
    covered: d.covered,
    reasons: d.reasons.slice(0, 4).map((r) => ({ code: r.code, text: r.text })),
    guidance: guidanceFor(d),
    file_id: d.fileId,
    latency_ms: d.latencyMs,
    versions: d.versions,
  };

  // Present only when covered. An agent must be able to tell advice from
  // coverage without inferring it.
  if (d.covered && d.feeMinor !== null) {
    res.fee = { amount: d.feeMinor / 100, currency: d.currency };
    if (d.guaranteeReference) res.guarantee_reference = d.guaranteeReference;
  }

  if (d.escalation) {
    res.escalation = {
      question: d.escalation.question,
      amount_at_risk: d.escalation.amountAtRiskMinor / 100,
      options: d.escalation.options.map((o) => ({ action: o.action, terms: o.terms })),
    };
  }

  return res;
}
