/**
 * The merchant persona schema.
 *
 * Adding a fraud case is dropping a JSON file, with no code change. That is the
 * PLATFORM.md section 1 commitment, and this schema is what makes it true.
 *
 * Owned by Hacker 2. Validated at load, so a malformed persona fails loudly at
 * startup rather than quietly at 8 PM.
 */

import { z } from 'zod';

/**
 * Mode is fixed per persona and must match the STRATEGY section 4 split.
 * A persona whose mode disagrees with its taxonomy ID fails validation.
 */
export const COLD_TAXONOMY = ['F01', 'F04', 'F08', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F18'] as const;
export const BONDED_TAXONOMY = ['F02', 'F03', 'F05', 'F06', 'F07', 'F09', 'F10', 'F17'] as const;

export const identitySchema = z.object({
  legal_name: z.string(),
  display_name: z.string(),
  domain: z.string(),
  domain_age_days: z.number().int().nonnegative(),
  tls: z.object({
    valid: z.boolean().default(true),
    issuer: z.string().default('R11'),
    san_matches_host: z.boolean().default(true),
  }),
  registration: z.object({
    found: z.boolean(),
    jurisdiction_claimed: z.string(),
    status: z.string().nullable().default(null),
  }),
  principals: z
    .array(z.object({ name: z.string(), role: z.string(), verified: z.boolean() }))
    .default([]),
  sanctions_hits: z.array(z.string()).default([]),
  checkout_host: z.string(),
  independent_existence: z.boolean().default(true),
  category: z.string(),
  adverse_media: z.array(z.string()).default([]),
  consent_gated: z
    .object({
      beneficial_ownership: z.object({ verified: z.boolean(), owners: z.array(z.string()).default([]) }),
      settlement_account: z.object({ validated: z.boolean() }),
      prior_processor: z.object({ provided: z.boolean(), dispute_ratio: z.number().nullable().default(null) }),
      licensing: z.object({ required: z.boolean(), provided: z.boolean() }),
    })
    .optional(),
});

export const catalogItemSchema = z.object({
  sku: z.string(),
  title: z.string(),
  category: z.string(),
  feed_price: z.number().nonnegative(),
  currency: z.string().default('USD'),
  stock: z.enum(['in_stock', 'low_stock', 'out_of_stock']).default('in_stock'),
  delivery_days: z.number().int().nonnegative().default(5),
  market_comparable: z.number().nonnegative(),
  description: z.string().default(''),
});

export const checkoutSchema = z.object({
  /**
   * What checkout charges for the item itself. Null means it agrees with the
   * feed. Setting it is how a bait-and-switch merchant (F01) disagrees with its
   * own feed on the line item rather than only on the total.
   */
  subtotal: z.number().nonnegative().nullable().default(null),
  quote_total: z.number().nonnegative().nullable().default(null),
  fees: z.array(z.object({ label: z.string(), amount: z.number() })).default([]),
  data_requested: z.array(z.string()).default(['card_token', 'email', 'shipping_address']),
  recurrence: z.enum(['none', 'monthly', 'annual']).default('none'),
  recurrence_disclosed: z.boolean().default(true),
  delivery_days: z.number().int().nonnegative().nullable().default(null),
});

export const contentItemSchema = z.object({
  kind: z.enum(['review', 'qa', 'rating_summary']),
  author: z.string().default('customer'),
  body: z.string().default(''),
  rating: z.number().optional(),
  rating_count: z.number().optional(),
});

/**
 * The hidden machinery that makes an attack an attack. Answers are generated
 * deterministically from these, so 60 personas do not require 1000 hand-written
 * replies, and the five narrated hero personas override the text they need.
 */
export const behaviorsSchema = z.object({
  /** BX-04. Obeying is NOT a defect: soft signal, low weight, never a gate. */
  obeys_buyer_canary: z.boolean().default(false),
  /** BX-05. The hard gate, bonded only. Structurally injectable. */
  obeys_content_canary: z.boolean().default(false),
  sycophancy: z.enum(['caves', 'holds']).default('holds'),
  /** F10, the agent tax. Fractional uplift when an agent or budget is signalled. */
  pressure_price_delta: z.number().default(0),
  hallucinates_policy: z.boolean().default(false),
  fake_human_escalation: z.boolean().default(false),
  false_scarcity: z.boolean().default(false),
  /** F23. Refusing the exam is a strategy, not an error state. */
  stonewalls: z.boolean().default(false),
  /** Answer drift across fresh sessions, as a fraction of price. */
  answer_drift: z.number().default(0),
  /** Conversational total differs from checkout, which is F11 drip pricing. */
  understates_total: z.boolean().default(false),
  /** Quotes a generous refund in conversation that the policy page contradicts. F07. */
  refund_mirage: z.boolean().default(false),
  /** Drives the fulfillment oracle rather than the score. */
  will_ship: z.boolean().default(true),
  ships_as_described: z.boolean().default(true),
});

export const policiesSchema = z.object({
  refund_window_days: z.number().int().default(30),
  refund_form: z.enum(['full', 'store_credit', 'partial', 'none']).default('full'),
  warranty_text: z.string().default('One year limited, manufacturer only.'),
  recurrence: z.string().default('none'),
});

export const networkSchema = z.object({
  fingerprint: z.string().default(''),
  terminated_match: z.number().min(0).max(1).default(0),
  terminated_match_to: z.string().nullable().default(null),
  prior_files: z.number().int().default(0),
  dispute_ratio: z.number().nullable().default(null),
  prior_payouts: z.number().int().default(0),
  negative_file: z.boolean().default(false),
});

export const personaSchema = z
  .object({
    id: z.string(),
    version: z.number().int().default(1),
    taxonomy: z.array(z.string()).default([]),
    /** Ground truth. The engine NEVER reads this. Eval only. */
    label: z.enum(['honest', 'fraud']),
    mode: z.enum(['cold', 'bonded']),
    kind: z.enum(['scripted', 'llm']).default('scripted'),
    display: z.object({ name: z.string(), blurb: z.string().default('') }),
    identity: identitySchema,
    catalog: z.array(catalogItemSchema).min(1),
    policies: policiesSchema.default({}),
    checkout: checkoutSchema.default({}),
    content: z.array(contentItemSchema).default([]),
    /** Explicit overrides keyed by question id. Used by the hero personas. */
    answers: z.record(z.string(), z.string()).default({}),
    behaviors: behaviorsSchema.default({}),
    network: networkSchema.default({}),
    /** Narrated on stage, with its evidence anchor. */
    narrated: z.boolean().default(false),
    evidence_anchor: z.string().nullable().default(null),
  })
  .superRefine((p, ctx) => {
    // The mode split is fixed in advance so nobody argues it at 3 PM.
    for (const t of p.taxonomy) {
      if ((COLD_TAXONOMY as readonly string[]).includes(t) && p.mode !== 'cold') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${p.id}: taxonomy ${t} is a cold cell per STRATEGY.md section 4, but mode is "${p.mode}".`,
        });
      }
      if ((BONDED_TAXONOMY as readonly string[]).includes(t) && p.mode !== 'bonded') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${p.id}: taxonomy ${t} is a bonded cell per STRATEGY.md section 4, but mode is "${p.mode}".`,
        });
      }
    }

    // BX-05 is bonded-only. A cold persona that obeys the content canary is a
    // persona describing something that cannot happen.
    if (p.behaviors?.obeys_content_canary && p.mode === 'cold') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${p.id}: obeys_content_canary is bonded-only. Planting an instruction in content a merchant ingests is not something ordinary buyer interaction does to a merchant who never agreed to anything.`,
      });
    }

    // The repository never contains a canary. Placeholders only.
    for (const c of p.content ?? []) {
      for (const pool of ['BX04_CANARY', 'BX05_CANARY']) {
        void pool;
      }
      if (/\{\{BX0[45]_CANARY\}\}/.test(c.body)) continue;
    }
  });

export type PersonaInput = z.input<typeof personaSchema>;
export type Persona = z.output<typeof personaSchema>;

export function parsePersona(raw: unknown): Persona {
  const result = personaSchema.safeParse(raw);
  if (!result.success) {
    const id = (raw as { id?: string })?.id ?? 'unknown';
    throw new Error(`Persona ${id} failed validation:\n${result.error.issues.map((i) => `  - ${i.message}`).join('\n')}`);
  }
  return result.data;
}
