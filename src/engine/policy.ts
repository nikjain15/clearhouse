/**
 * The escalation policy, and the final tier after caps.
 *
 * Amount-sensitivity is the point. Worked against the formula with a $25
 * tolerance: a $12 purchase at a conditional score clears with a scoped token;
 * the same merchant at $400 breaches tolerance and goes to the human; a second
 * $400 purchase in the same session breaches the cumulative limit even if the
 * first cleared.
 *
 * UNDERWRITING.md section 3, "Escalation".
 */

import type {
  ContradictionView,
  Escalation,
  Pricing,
  Reason,
  Scorecard,
  Tier,
} from '../contracts/types';
import { PRICING_V1, type PricingVersion } from './pricing';

export interface PolicyInput {
  scorecard: Scorecard;
  pricing: Pricing;
  amountMinor: number;
  currency: string;
  /** The buyer's set tolerance, e.g. "$25 max at risk without asking me". */
  toleranceMinor: number | null;
  /** Expected loss already committed this session or against this merchant. */
  cumulativeExpectedLossMinor: number;
  thinFile: boolean;
  reasons: Reason[];
  contradictions: ContradictionView[];
}

export interface PolicyResult {
  tier: Tier;
  escalated: boolean;
  escalationReasons: string[];
  escalation: Escalation | null;
  covered: boolean;
}

export function applyPolicy(input: PolicyInput, v: PricingVersion = PRICING_V1): PolicyResult {
  const { scorecard, pricing, amountMinor } = input;
  const tolerance = input.toleranceMinor ?? v.escalation.defaultToleranceMinor;
  const escalationReasons: string[] = [];

  let tier = scorecard.tier;

  // A decline stays a decline. Nothing below can rescue it, and escalating a
  // declined merchant to a human wastes the human's attention.
  if (tier !== 'decline') {
    // 1. Expected loss above the buyer's tolerance.
    if (pricing.expectedLossMinor > tolerance) {
      escalationReasons.push(
        `Expected loss ${fmt(pricing.expectedLossMinor, input.currency)} exceeds the ${fmt(
          tolerance,
          input.currency,
        )} tolerance set for unattended purchases.`,
      );
    }

    // 2. Cumulative expected loss across the session or the merchant. This is
    //    what stops a series of just-under-threshold purchases from walking
    //    under the bar.
    const cumulative = input.cumulativeExpectedLossMinor + pricing.expectedLossMinor;
    if (pricing.expectedLossMinor <= tolerance && cumulative > tolerance) {
      escalationReasons.push(
        `Cumulative expected loss ${fmt(cumulative, input.currency)} across this session exceeds the ${fmt(
          tolerance,
          input.currency,
        )} tolerance, even though this purchase alone does not.`,
      );
    }

    // 3. Any unresolved high-materiality contradiction. The scorecard already
    //    moved the tier; this records why for the human.
    if (scorecard.materialityOverride) {
      escalationReasons.push(
        'A high-materiality contradiction is unresolved, which routes to a human regardless of score or mode.',
      );
    }

    // 4. Thin file, cold mode, and an amount large relative to the file.
    if (
      scorecard.mode === 'cold' &&
      input.thinFile &&
      amountMinor > v.escalation.defaultToleranceMinor * v.escalation.thinColdAmountRatio
    ) {
      escalationReasons.push(
        `The file is thin, the merchant never applied, and ${fmt(
          amountMinor,
          input.currency,
        )} is large relative to what is known about them.`,
      );
    }

    // 5. Caps. A cap binding the decision is not a score judgment, and the
    //    human is told which one bound it.
    for (const cap of pricing.capsApplied) {
      if (cap.startsWith('per_merchant_cap')) {
        escalationReasons.push('This purchase would exceed the per-merchant exposure cap sized to this file.');
      } else if (cap.startsWith('per_class_cap')) {
        escalationReasons.push(
          'This purchase would exceed the aggregate cap for its attack class across the whole book.',
        );
      }
    }

    // Above the fee cap we refuse to bond outright rather than escalate.
    if (pricing.feeCapBreached) {
      tier = tier === 'clear' || tier === 'conditional' ? 'refer' : tier;
      escalationReasons.push(
        `The priced guarantee fee exceeds the ${(v.feeCap.rate * 100).toFixed(0)}% cap, so we refuse to bond at this amount.`,
      );
    }

    if (escalationReasons.length > 0 && (tier === 'clear' || tier === 'conditional')) {
      tier = 'refer';
    }
  }

  const escalated = tier === 'refer';
  const covered = scorecard.mode === 'bonded' && (tier === 'clear' || tier === 'conditional');

  const escalation: Escalation | null = escalated
    ? {
        question: buildQuestion(input, escalationReasons),
        amountAtRiskMinor: amountMinor,
        topReasons: input.reasons.slice(0, 3),
        contradictions: input.contradictions,
        options: [
          {
            action: 'approve_scoped',
            terms: covered
              ? `Approve under scoped, revocable authority capped at ${fmt(amountMinor, input.currency)}, with ${fmt(
                  pricing.collateralMinor,
                  input.currency,
                )} held as rolling reserve.`
              : `Approve under scoped, revocable authority capped at ${fmt(
                  amountMinor,
                  input.currency,
                )}. Uncovered: this merchant never applied, so no bond stands behind it.`,
          },
          { action: 'decline', terms: 'Do not buy from this merchant.' },
        ],
      }
    : null;

  return { tier, escalated, escalationReasons, escalation, covered };
}

/**
 * Exactly what the human is being asked to decide, so the agent renders the
 * adjudication card rather than inventing a question. PLATFORM.md section 2.
 */
function buildQuestion(input: PolicyInput, reasons: string[]): string {
  const amount = fmt(input.amountMinor, input.currency);
  const mode = input.scorecard.mode === 'cold' ? 'never applied to Clearhouse' : 'is bonded';
  const head = `Approve a ${amount} purchase from a merchant that ${mode} and scored ${input.scorecard.score}?`;
  return reasons.length > 0 ? `${head} ${reasons[0]}` : head;
}

export function fmt(minor: number, currency: string): string {
  const major = (minor / 100).toFixed(2);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '';
  return symbol ? `${symbol}${major}` : `${major} ${currency}`;
}
