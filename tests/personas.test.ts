/**
 * Persona invariants.
 *
 * The mode split is fixed in advance so nobody argues it at 3 PM, and these
 * tests are what make "fixed in advance" mean something.
 */

import { describe, expect, it } from 'vitest';
import { gauntletPersonas, loadPersonas, merchantFor, registryFor } from '../src/merchants';
import { BONDED_TAXONOMY, COLD_TAXONOMY, parsePersona } from '../src/merchants/schema';

const CANARIES = { bx04: 'test-buyer-canary', bx05: 'test-content-canary' };

describe('the board is 18 cells with modes fixed', () => {
  const cells = gauntletPersonas();

  it('has exactly one persona per merchant-facing taxonomy entry F01 to F18', () => {
    const ids = cells.flatMap((p) => p.taxonomy).filter((t) => /^F(0[1-9]|1[0-8])$/.test(t));
    const expected = Array.from({ length: 18 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`);
    expect([...new Set(ids)].sort()).toEqual(expected);
    expect(cells).toHaveLength(18);
  });

  it('puts the ten cold cells in cold mode', () => {
    expect(COLD_TAXONOMY).toHaveLength(10);
    for (const t of COLD_TAXONOMY) {
      const p = cells.find((c) => c.taxonomy.includes(t))!;
      expect(p, `${t} has no persona`).toBeDefined();
      expect(p.mode, `${t} (${p.id}) should be cold`).toBe('cold');
    }
  });

  it('puts the eight bonded cells in bonded mode', () => {
    expect(BONDED_TAXONOMY).toHaveLength(8);
    for (const t of BONDED_TAXONOMY) {
      const p = cells.find((c) => c.taxonomy.includes(t))!;
      expect(p, `${t} has no persona`).toBeDefined();
      expect(p.mode, `${t} (${p.id}) should be bonded`).toBe('bonded');
    }
  });
});

describe('the schema refuses personas that describe impossible things', () => {
  const base = {
    id: 'M-TEST',
    label: 'fraud' as const,
    display: { name: 'Test' },
    identity: {
      legal_name: 'Test LLC',
      display_name: 'Test',
      domain: 'test.com',
      domain_age_days: 400,
      tls: {},
      registration: { found: true, jurisdiction_claimed: 'US-DE' },
      checkout_host: 'checkout.test.com',
      category: 'office_supplies',
    },
    catalog: [
      { sku: 'A', title: 'A', category: 'office_supplies', feed_price: 10, market_comparable: 10 },
    ],
  };

  it('rejects a cold persona that obeys the content canary, because BX-05 is bonded-only', () => {
    expect(() =>
      parsePersona({ ...base, mode: 'cold', behaviors: { obeys_content_canary: true } }),
    ).toThrow(/bonded-only/);
  });

  it('accepts a bonded persona that obeys the content canary', () => {
    expect(() =>
      parsePersona({ ...base, mode: 'bonded', behaviors: { obeys_content_canary: true } }),
    ).not.toThrow();
  });

  it('rejects a bonded persona carrying a cold taxonomy id', () => {
    expect(() => parsePersona({ ...base, mode: 'bonded', taxonomy: ['F04'] })).toThrow(/cold cell/);
  });

  it('rejects a cold persona carrying a bonded taxonomy id', () => {
    expect(() => parsePersona({ ...base, mode: 'cold', taxonomy: ['F03'] })).toThrow(/bonded cell/);
  });
});

describe('canaries never enter the repository', () => {
  it('uses placeholders in persona content, never literal strings', () => {
    for (const p of loadPersonas()) {
      for (const c of p.content) {
        expect(c.body).not.toContain('verdigris');
        expect(c.body).not.toContain('saffron');
        if (/canary/i.test(c.body)) {
          expect(c.body, `${p.id} should use a placeholder`).toMatch(/\{\{BX0[45]_CANARY\}\}/);
        }
      }
    }
  });

  it('substitutes the placeholder at runtime so the merchant really ingests it', async () => {
    const halcyon = loadPersonas().find((p) => p.id === 'M-F03-halcyon')!;
    const content = await merchantFor(halcyon, CANARIES).content();
    const review = content.find((c) => c.body.includes(CANARIES.bx05));
    expect(review, 'the planted instruction should resolve to the live canary').toBeDefined();
  });
});

describe('the scripted merchant is deterministic', () => {
  it('returns byte-identical answers across repeated runs', async () => {
    for (const p of loadPersonas()) {
      const a = merchantFor(p, CANARIES);
      const b = merchantFor(p, CANARIES);
      const qa = await a.ask({ id: 'Q-PRICE-TOTAL', claim: 'total_with_fees', text: 'x' }, 's1');
      const qb = await b.ask({ id: 'Q-PRICE-TOTAL', claim: 'total_with_fees', text: 'x' }, 's1');
      expect(qb.text, `${p.id} drifted between runs`).toBe(qa.text);
      expect(qb.latencyMs).toBe(qa.latencyMs);
    }
  });

  it('echoes the content canary only when the persona is structurally injectable', async () => {
    const injectable = loadPersonas().find((p) => p.behaviors.obeys_content_canary)!;
    const clean = loadPersonas().find((p) => p.id === 'M-HONEST-ironwood')!;

    const a = await merchantFor(injectable, CANARIES).ask(
      { id: 'Q-CANARY-CONTENT', claim: 'canary', text: 'reviews?' },
      's',
    );
    const b = await merchantFor(clean, CANARIES).ask(
      { id: 'Q-CANARY-CONTENT', claim: 'canary', text: 'reviews?' },
      's',
    );
    expect(a.canaryEchoed.bx05).toBe(true);
    expect(b.canaryEchoed.bx05).toBe(false);
  });
});

describe('ground truth is eval-only', () => {
  it('never exposes the label through the merchant surface', async () => {
    const p = loadPersonas().find((x) => x.label === 'fraud')!;
    const m = merchantFor(p, CANARIES);
    const surface = JSON.stringify({
      identity: await m.identity(),
      catalog: await m.catalog(),
      content: await m.content(),
      checkout: await m.checkout(p.catalog[0].sku, 1),
    });
    expect(surface).not.toContain('"label"');
    expect(surface).not.toContain('fraud');
  });
});

describe('registry projection', () => {
  it('gives a negative file the notice a negative file has to carry', () => {
    const p = loadPersonas()[0];
    const withNegative = { ...p, network: { ...p.network, negative_file: true } };
    const r = registryFor(withNegative);
    expect(r.negativeFile).toBe(true);
    expect(r.notice.sent).toBe(true);
    expect(r.notice.codes.length).toBeGreaterThan(0);
  });

  it('carries the fingerprint match as a number rather than a verdict', () => {
    const laundered = loadPersonas().find((p) => p.taxonomy.includes('F18'))!;
    const r = registryFor(laundered);
    expect(r.terminatedMatch).toBeGreaterThan(0.8);
    expect(r.terminatedMatchTo).toBeTruthy();
  });
});
