/**
 * Pricing. Pure functions over the scorecard and a versioned pricing table, so
 * a price is replayable for the same reason a decision is.
 *
 *   EL  = PD(score, mode) x LGD(protection) x amount
 *   fee = EL x base_loading x (1 + correlation_load)
 *
 * UNDERWRITING.md section 3.
 */

import type { ExposureState, Mode, Pricing, Scorecard, Tier } from '../contracts/types';
import pricingV1 from '../../config/pricing/v1.json';

export interface PricingVersion {
  version: string;
  pdPrior: {
    bands: Array<{ from: number; to: number; pd: number }>;
    modeAdjustment: { bonded: number; cold: number };
  };
  lgd: Record<string, { value: number; detail: string } | string>;
  loading: { base: number; correlationLoad: number };
  feeCap: { rate: number; action: string };
  collateral: { conditionalReserveRate: number; clearReserveRate: number; releaseAfterCleanTransactions: number };
  exposureCaps: {
    perMerchantBaseMinor: number;
    perMerchantThinFileMinor: number;
    perMerchantScoreMultiplier: Array<{ from: number; to: number; multiplier: number }>;
    perAttackClassAggregateMinor: number;
  };
  fund: { statedCapitalMinor: number; currency: string; simulated: boolean };
  payoutCaps: { perBuyerMinor: number; perMerchantMinor: number };
  escalation: { defaultToleranceMinor: number; thinColdAmountRatio: number };
}

export const PRICING_V1 = pricingV1 as unknown as PricingVersion;

/**
 * PD is a STATED PRIOR from published card-industry fraud rates by band,
 * adjusted by mode. It is not a curve fitted to our own eval set, because 40
 * to 60 self-authored personas can demonstrate separation and cannot calibrate
 * a price. The eval measures discrimination and says so.
 */
export function pd(scoreValue: number, mode: Mode, v: PricingVersion = PRICING_V1): number {
  const band = v.pdPrior.bands.find((b) => scoreValue >= b.from && scoreValue <= b.to);
  const base = band?.pd ?? v.pdPrior.bands[v.pdPrior.bands.length - 1].pd;
  return base * v.pdPrior.modeAdjustment[mode];
}

export type Protection = 'none_captured' | 'scoped_token' | 'scoped_token_plus_reserve';

/** Loss given default is not 1. Protection cuts the loss, and the formula says so. */
export function lgd(protection: Protection, v: PricingVersion = PRICING_V1): number {
  const entry = v.lgd[protection];
  if (typeof entry === 'object' && entry !== null && 'value' in entry) return entry.value;
  return 1.0;
}

/** Which protection is actually in force for a decision. */
export function protectionFor(tier: Tier, mode: Mode, covered: boolean): Protection {
  if (!covered || mode === 'cold') {
    // A cold conditional still gets scoped, revocable authority: that is a
    // buyer-side control needing no merchant participation. It is just not
    // covered by a bond.
    return tier === 'conditional' || tier === 'clear' ? 'scoped_token' : 'none_captured';
  }
  return tier === 'conditional' ? 'scoped_token_plus_reserve' : 'scoped_token';
}

export function perMerchantCapMinor(
  scoreValue: number,
  thinFile: boolean,
  v: PricingVersion = PRICING_V1,
): number {
  const base = thinFile ? v.exposureCaps.perMerchantThinFileMinor : v.exposureCaps.perMerchantBaseMinor;
  const tierMul =
    v.exposureCaps.perMerchantScoreMultiplier.find((m) => scoreValue >= m.from && scoreValue <= m.to)
      ?.multiplier ?? 0;
  return Math.round(base * tierMul);
}

export interface PriceInput {
  scorecard: Scorecard;
  amountMinor: number;
  thinFile: boolean;
  /** Taxonomy classes this file's findings touch, for the aggregate class cap. */
  attackClasses: string[];
  exposure: ExposureState;
}

export function price(input: PriceInput, v: PricingVersion = PRICING_V1): Pricing {
  const { scorecard, amountMinor } = input;
  const protection = protectionFor(scorecard.tier, scorecard.mode, scorecard.covered);
  const pdValue = pd(scorecard.score, scorecard.mode, v);
  const lgdValue = lgd(protection, v);

  const expectedLossMinor = Math.round(pdValue * lgdValue * amountMinor);

  const loading = v.loading.base;
  const correlationLoad = v.loading.correlationLoad;
  const rawFee = expectedLossMinor * loading * (1 + correlationLoad);

  // Cold files carry no fee, because nobody has agreed to pay one. What a cold
  // file produces is the decision and the escalation judgment, both of which
  // still run. UNDERWRITING.md section 3.
  const feeApplies = scorecard.covered;
  const feeMinor = feeApplies ? Math.max(1, Math.round(rawFee)) : null;
  const feeRate = amountMinor > 0 ? rawFee / amountMinor : 0;
  const feeCapBreached = feeApplies && feeRate > v.feeCap.rate;

  const reserveRate =
    scorecard.tier === 'conditional'
      ? v.collateral.conditionalReserveRate
      : v.collateral.clearReserveRate;
  const collateralMinor = scorecard.covered ? Math.round(amountMinor * reserveRate) : 0;

  // Exposure limits, which reserves do not replace. Reserves are recovery, not
  // prevention: a merchant with $1,000 of clean history at a 10% reserve has
  // $100 posted, and nothing about that stops a $5,000 strike. The cap does.
  const capsApplied: string[] = [];
  const merchantCap = perMerchantCapMinor(scorecard.score, input.thinFile, v);
  if (input.exposure.perMerchantOutstandingMinor + amountMinor > merchantCap) {
    capsApplied.push(`per_merchant_cap:${merchantCap}`);
  }
  for (const cls of input.attackClasses) {
    const outstanding = input.exposure.perClassOutstandingMinor[cls] ?? 0;
    if (outstanding + amountMinor > v.exposureCaps.perAttackClassAggregateMinor) {
      capsApplied.push(`per_class_cap:${cls}`);
    }
  }
  if (feeCapBreached) capsApplied.push(`fee_cap:${v.feeCap.rate}`);

  return {
    expectedLossMinor,
    pd: pdValue,
    lgd: lgdValue,
    lgdBasis: protection,
    loading,
    correlationLoad,
    feeMinor,
    feeRate,
    feeCapBreached,
    collateralMinor,
    pricingVersion: v.version,
    capsApplied,
  };
}
