/**
 * Cumulative exposure tracking.
 *
 * The per-merchant and per-attack-class caps in pricing.ts are only real if
 * something remembers what is already outstanding. Without it, every underwrite
 * sees zero prior exposure and the caps degrade to single-transaction size
 * limits — the exact gap the audit found. This is that memory: covered exposure
 * accumulates per merchant and per attack class, and a snapshot taken before a
 * decision lets the caps bind across files, not just within one.
 *
 * Scope: this is a session/run accumulator, updated synchronously as covered
 * decisions are issued. A serverless deployment that must survive cold starts
 * would project the same numbers from the event log (covered decisions minus
 * settlements); `fromCoveredDecisions` builds a tracker from such a projection.
 *
 * Exposure is recorded only for COVERED purchases, because those are the only
 * ones the fund is actually on the hook for. A referred or declined purchase
 * carries no bond, so it adds nothing to outstanding exposure.
 */

import type { ExposureState } from '../contracts/types';
import { PRICING_V1, type PricingVersion } from './pricing';

export class ExposureTracker {
  private perMerchant = new Map<string, number>();
  private perClass = new Map<string, number>();

  constructor(private v: PricingVersion = PRICING_V1) {}

  /** Outstanding exposure as pricing expects it, for this merchant and classes. */
  snapshot(merchantId: string, attackClasses: string[]): ExposureState {
    const perClassOutstandingMinor: Record<string, number> = {};
    for (const cls of attackClasses) perClassOutstandingMinor[cls] = this.perClass.get(cls) ?? 0;
    return {
      perMerchantOutstandingMinor: this.perMerchant.get(merchantId) ?? 0,
      // Sized from the score in pricing.ts; not carried here.
      perMerchantCapMinor: 0,
      perClassOutstandingMinor,
      perClassCapMinor: this.v.exposureCaps.perAttackClassAggregateMinor,
      fundCapitalMinor: this.v.fund.statedCapitalMinor,
    };
  }

  /** Add covered exposure once a decision is issued and it is covered. */
  record(merchantId: string, attackClasses: string[], amountMinor: number): void {
    this.perMerchant.set(merchantId, (this.perMerchant.get(merchantId) ?? 0) + amountMinor);
    for (const cls of attackClasses) {
      this.perClass.set(cls, (this.perClass.get(cls) ?? 0) + amountMinor);
    }
  }

  /** Release exposure when a covered purchase settles cleanly or is refunded. */
  release(merchantId: string, attackClasses: string[], amountMinor: number): void {
    this.perMerchant.set(merchantId, Math.max(0, (this.perMerchant.get(merchantId) ?? 0) - amountMinor));
    for (const cls of attackClasses) {
      this.perClass.set(cls, Math.max(0, (this.perClass.get(cls) ?? 0) - amountMinor));
    }
  }

  perMerchantOutstanding(merchantId: string): number {
    return this.perMerchant.get(merchantId) ?? 0;
  }

  perClassOutstanding(cls: string): number {
    return this.perClass.get(cls) ?? 0;
  }
}

/**
 * Build a tracker from a projection of covered exposure, e.g. one derived from
 * the event log so a stateless request enforces the same cumulative caps.
 */
export function fromCoveredExposure(
  entries: Array<{ merchantId: string; attackClasses: string[]; amountMinor: number }>,
  v: PricingVersion = PRICING_V1,
): ExposureTracker {
  const t = new ExposureTracker(v);
  for (const e of entries) t.record(e.merchantId, e.attackClasses, e.amountMinor);
  return t;
}
