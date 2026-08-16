/**
 * Deterministic check tests.
 *
 * The audit noted coverage was thin on src/engine/checks. These cover the
 * deterministic Pillar 1 checks that carry hard gates (sanctions, payment
 * redirect) and the identity signals (domain age, TLS), by running the check
 * against a crafted merchant surface. No model is involved.
 */

import { describe, expect, it } from 'vitest';
import { p1Sanctions, p1PaymentRedirect, p1Domain } from '../src/engine/checks/pillar1';
import type { IdentitySurface, MerchantSurface } from '../src/contracts/types';
import type { CheckContext } from '../src/contracts/ports';

function identity(over: Partial<IdentitySurface> = {}): IdentitySurface {
  return {
    legalName: 'Acme LLC',
    displayName: 'Acme',
    domain: 'acme.example',
    domainAgeDays: 900,
    tls: { valid: true, issuer: 'R3', sanMatchesHost: true },
    registration: { found: true, jurisdictionClaimed: 'US-DE', status: 'active' },
    principals: [],
    sanctionsScreening: { hits: [] },
    checkoutHost: 'acme.example',
    independentExistence: true,
    category: 'tools',
    adverseMedia: [],
    ...over,
  };
}

function ctxFor(id: IdentitySurface): CheckContext {
  const merchant = {
    merchantId: 'M-TEST',
    mode: 'cold',
    identity: async () => id,
  } as unknown as MerchantSurface;
  return { merchant } as unknown as CheckContext;
}

describe('P1.sanctions (ID-01 hard gate)', () => {
  it('fires a gate finding on a screening hit', async () => {
    const out = await p1Sanctions.run(ctxFor(identity({ sanctionsScreening: { hits: ['OFAC SDN'] } })));
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe('ID-01');
    expect(out[0].gate).toBe(true);
  });

  it('is silent when there are no hits', async () => {
    expect(await p1Sanctions.run(ctxFor(identity()))).toHaveLength(0);
  });
});

describe('P1.payment_redirect (ID-02 hard gate)', () => {
  it('fires when checkout settles to a different registrable domain', async () => {
    const out = await p1PaymentRedirect.run(
      ctxFor(identity({ domain: 'acme.example', checkoutHost: 'pay.evil.test' })),
    );
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe('ID-02');
    expect(out[0].gate).toBe(true);
  });

  it('does not fire when checkout is on the same registrable domain', async () => {
    const out = await p1PaymentRedirect.run(
      ctxFor(identity({ domain: 'acme.example', checkoutHost: 'checkout.acme.example' })),
    );
    expect(out).toHaveLength(0);
  });
});

describe('P1.domain (ID-03 age, ID-04 TLS)', () => {
  it('flags a domain under 30 days old', async () => {
    const out = await p1Domain.run(ctxFor(identity({ domainAgeDays: 12 })));
    expect(out.map((f) => f.code)).toContain('ID-03');
  });

  it('flags invalid or mismatched TLS', async () => {
    const out = await p1Domain.run(ctxFor(identity({ tls: { valid: false, issuer: 'self', sanMatchesHost: false } })));
    expect(out.map((f) => f.code)).toContain('ID-04');
  });

  it('is silent for an old domain with valid TLS', async () => {
    expect(await p1Domain.run(ctxFor(identity()))).toHaveLength(0);
  });
});
