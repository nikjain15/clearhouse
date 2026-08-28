/**
 * What a model call costs.
 *
 * Latency has had a target since the first commit (CLEARHOUSE_LATENCY_TARGET_MS)
 * and a fallback when it is missed. Cost had neither, because nothing recorded
 * it: the API returns a `usage` block on every response and we discarded it.
 * For a product that prices risk for a living, the cost of producing the price
 * is not an acceptable blind spot.
 *
 * Rates are published USD per million tokens. They are versioned data like
 * everything else here (STRATEGY.md section 9): when a rate changes, add the
 * new rate rather than editing history, or previously recorded costs stop
 * meaning what they said.
 */
import type { ModelUsage } from '../contracts/ports';

export interface Rate {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

/** Published rates as of 2026-08-28. */
export const RATES: Record<string, Rate> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Cache reads bill at ~0.1x input; cache writes at ~1.25x. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

const PER_MILLION = 1_000_000;

/**
 * Price one call. An unknown model returns 0 rather than throwing: a missing
 * rate must not fail an underwrite, and a zero is visibly wrong in the ledger
 * in a way a guessed number would not be.
 */
export function priceCall(
  model: string,
  tokens: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
): number {
  const rate = RATES[model];
  if (!rate) return 0;
  const input = tokens.inputTokens * rate.input;
  const output = tokens.outputTokens * rate.output;
  const cacheRead = tokens.cacheReadTokens * rate.input * CACHE_READ_MULTIPLIER;
  const cacheWrite = tokens.cacheWriteTokens * rate.input * CACHE_WRITE_MULTIPLIER;
  return (input + output + cacheRead + cacheWrite) / PER_MILLION;
}

/** Sum the cost of many calls, for a whole underwriting file. */
export function totalCost(calls: Array<ModelUsage | undefined>): number {
  return calls.reduce((sum, c) => sum + (c?.costUsd ?? 0), 0);
}
