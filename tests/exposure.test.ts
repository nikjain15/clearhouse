/**
 * Exposure caps must bind ACROSS files, not just within one.
 *
 * The audit found the caps degraded to single-transaction size limits because
 * every underwrite saw zero prior exposure. These tests pin the fix: an
 * ExposureTracker threaded through repeated pricing calls makes the per-merchant
 * and per-attack-class caps accumulate.
 */

import { describe, expect, it } from 'vitest';
import { ExposureTracker } from '../src/engine/exposure';
import { price, PRICING_V1, perMerchantCapMinor } from '../src/engine/pricing';
import type { Scorecard } from '../src/contracts/types';

function coveredScore(score: number): Scorecard {
  return {
    score,
    tier: 'conditional',
    mode: 'bonded',
    covered: true,
    pillars: [],
    gatesFired: [],
    scorecardVersion: 'scorecard-v2',
    coldCeilingApplied: false,
    materialityOverride: false,
  } as unknown as Scorecard;
}

describe('cumulative per-merchant exposure cap', () => {
  it('does not bind on a single purchase under the cap', () => {
    const tracker = new ExposureTracker();
    const scorecard = coveredScore(820); // 700-899 -> 2x multiplier, base 250000
    const cap = perMerchantCapMinor(820, false); // 500000
    const amount = cap - 1;
    const p = price({
      scorecard,
      amountMinor: amount,
      thinFile: false,
      attackClasses: ['F07'],
      exposure: tracker.snapshot('M-1', ['F07']),
    });
    expect(p.capsApplied.some((c) => c.startsWith('per_merchant_cap'))).toBe(false);
  });

  it('binds once accumulated exposure plus this purchase exceeds the cap', () => {
    const tracker = new ExposureTracker();
    const scorecard = coveredScore(820);
    const cap = perMerchantCapMinor(820, false); // 500000
    const half = Math.floor(cap / 2) + 100;

    // First covered purchase: under the cap, recorded.
    const first = price({
      scorecard,
      amountMinor: half,
      thinFile: false,
      attackClasses: ['F07'],
      exposure: tracker.snapshot('M-1', ['F07']),
    });
    expect(first.capsApplied.some((c) => c.startsWith('per_merchant_cap'))).toBe(false);
    tracker.record('M-1', ['F07'], half); // covered => recorded

    // Second purchase of the same size now pushes outstanding over the cap.
    const second = price({
      scorecard,
      amountMinor: half,
      thinFile: false,
      attackClasses: ['F07'],
      exposure: tracker.snapshot('M-1', ['F07']),
    });
    expect(second.capsApplied.some((c) => c.startsWith('per_merchant_cap'))).toBe(true);
  });
});

describe('cumulative per-attack-class aggregate cap', () => {
  it('binds when several merchants in one class together exceed the aggregate', () => {
    const tracker = new ExposureTracker();
    const scorecard = coveredScore(820);
    // Aggregate (1,000,000) is 2x the per-merchant cap (500,000), so use three
    // merchants each well under the per-merchant cap; the third tips the class
    // aggregate over without any per-merchant cap firing.
    const chunk = 340_000; // < 500_000 per-merchant cap; 3 * 340_000 = 1,020,000 > 1,000,000
    const merchants = ['M-A', 'M-B', 'M-C'];
    const results = merchants.map((m) => {
      const p = price({
        scorecard,
        amountMinor: chunk,
        thinFile: false,
        attackClasses: ['F07'],
        exposure: tracker.snapshot(m, ['F07']),
      });
      tracker.record(m, ['F07'], chunk);
      return p;
    });

    // No per-merchant cap fired (each purchase is under it).
    expect(results.every((p) => !p.capsApplied.some((c) => c.startsWith('per_merchant_cap')))).toBe(true);
    // First two are under the aggregate; the third trips it.
    expect(results[0].capsApplied.some((c) => c.startsWith('per_class_cap'))).toBe(false);
    expect(results[1].capsApplied.some((c) => c.startsWith('per_class_cap'))).toBe(false);
    expect(results[2].capsApplied.some((c) => c.startsWith('per_class_cap'))).toBe(true);
  });
});
