/**
 * Cost accounting tests.
 *
 * COST.md quoted an estimated cost per underwriting file because nothing
 * recorded the real one. These pin the arithmetic that replaces the estimate,
 * so a wrong rate or a dropped token class fails the build rather than
 * quietly understating what a decision costs to produce.
 */

import { describe, expect, it } from 'vitest';
import { RATES, priceCall, totalCost } from '../src/model/pricing';

const NO_CACHE = { cacheReadTokens: 0, cacheWriteTokens: 0 };

describe('priceCall', () => {
  it('prices input and output at the published rate', () => {
    // 1M input on Sonnet 5 is $2, 1M output is $10.
    const cost = priceCall('claude-sonnet-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      ...NO_CACHE,
    });
    expect(cost).toBeCloseTo(12, 10);
  });

  it('prices Opus above Sonnet for identical usage', () => {
    const usage = { inputTokens: 10_000, outputTokens: 1_000, ...NO_CACHE };
    expect(priceCall('claude-opus-5', usage)).toBeGreaterThan(priceCall('claude-sonnet-5', usage));
  });

  it('bills a cache read at a tenth of the input rate', () => {
    const read = priceCall('claude-sonnet-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 0,
    });
    expect(read).toBeCloseTo(RATES['claude-sonnet-5'].input * 0.1, 10);
  });

  it('bills a cache write above the input rate', () => {
    const write = priceCall('claude-sonnet-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 1_000_000,
    });
    expect(write).toBeCloseTo(RATES['claude-sonnet-5'].input * 1.25, 10);
  });

  it('returns zero for an unknown model rather than throwing', () => {
    // A missing rate must not fail an underwrite. Zero is visibly wrong in the
    // ledger in a way a guessed number would not be.
    expect(priceCall('claude-not-a-model', { inputTokens: 1_000, outputTokens: 100, ...NO_CACHE })).toBe(0);
  });

  it('costs nothing when no tokens were spent', () => {
    expect(priceCall('claude-sonnet-5', { inputTokens: 0, outputTokens: 0, ...NO_CACHE })).toBe(0);
  });
});

describe('totalCost', () => {
  it('sums a whole underwriting file', () => {
    const call = (costUsd: number) => ({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd,
    });
    expect(totalCost([call(0.001), call(0.002), call(0.0005)])).toBeCloseTo(0.0035, 10);
  });

  it('treats cache hits as free', () => {
    // A cache hit carries no usage, which is the whole point of the hero path
    // being independent of the network: it is also independent of the bill.
    expect(totalCost([undefined, undefined])).toBe(0);
  });

  it('prices a realistic 12-call file in cents, not dollars', () => {
    // The engine makes 12 model calls per file. At roughly 1,500 input and 150
    // output tokens each on Sonnet 5, COST.md's estimate was ~5.4 cents. This
    // pins the order of magnitude the estimate claimed.
    const perCall = priceCall('claude-sonnet-5', {
      inputTokens: 1_500,
      outputTokens: 150,
      ...NO_CACHE,
    });
    const file = perCall * 12;
    expect(file).toBeGreaterThan(0.01);
    expect(file).toBeLessThan(0.10);
  });
});
