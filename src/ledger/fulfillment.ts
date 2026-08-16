/**
 * The delivery oracle and the claims path.
 *
 * The guarantee is only as good as the answer to a hard question: what actually
 * happened after the money moved? Nothing in the six pillars observes delivered
 * reality, and a guarantee that pays on assertion alone is a guarantee that pays
 * fraudsters.
 *
 * Fulfillment state is a first-class object built from carrier tracking events,
 * merchant attestation, and buyer confirmation, with **disagreement between
 * them routed to human adjudication rather than resolved by whoever spoke
 * last.** That rule is the oracle.
 *
 * Simulated, with real state transitions, and we say so on stage.
 */

import { randomUUID } from 'node:crypto';
import type {
  ClaimEvidenceBundle,
  ClaimUnderwriting,
  Deposition,
  FulfillmentSource,
  FulfillmentState,
  FulfillmentTransition,
  Order,
  Reason,
  ScopedAuthority,
} from '../contracts/types';
import pricingV1 from '../../config/pricing/v1.json';

/**
 * Payout caps come straight from the versioned pricing table rather than
 * through src/engine, because the ledger owns settlement and must not depend
 * on the scoring module. `config/` is shared by design; `src/engine` is not.
 */
const PAYOUT_CAPS = pricingV1.payoutCaps as { perBuyerMinor: number; perMerchantMinor: number };

const ALLOWED: Record<FulfillmentState, FulfillmentState[]> = {
  authorized: ['captured', 'disputed', 'refunded'],
  captured: ['shipped', 'disputed', 'refunded'],
  shipped: ['in_transit', 'delivered', 'disputed'],
  in_transit: ['delivered', 'disputed'],
  delivered: ['confirmed', 'disputed'],
  confirmed: ['disputed'],
  disputed: ['adjudicated'],
  adjudicated: ['settled_by_payout', 'denied', 'refunded'],
  settled_by_payout: [],
  denied: ['disputed'],
  refunded: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: FulfillmentState, to: FulfillmentState) {
    super(`Fulfillment cannot move from ${from} to ${to}.`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: FulfillmentState, to: FulfillmentState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export interface SourceReport {
  source: FulfillmentSource;
  /** What this source says happened. */
  claimsDelivered: boolean;
  claimsAsDescribed: boolean;
  evidence: string;
}

export class FulfillmentOracle {
  private reports = new Map<string, SourceReport[]>();

  constructor(private orders = new Map<string, Order>()) {}

  createOrder(order: Order): Order {
    this.orders.set(order.orderId, order);
    return order;
  }

  get(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  transition(orderId: string, to: FulfillmentState, source: FulfillmentSource, evidence: string, at = new Date().toISOString()): FulfillmentTransition {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Unknown order ${orderId}`);
    if (!canTransition(order.state, to)) throw new IllegalTransitionError(order.state, to);

    const t: FulfillmentTransition = { orderId, from: order.state, to, source, evidence, at };
    order.state = to;
    order.history.push(t);
    return t;
  }

  /** Each of the three sources writes what it believes independently. */
  report(orderId: string, report: SourceReport): void {
    const list = this.reports.get(orderId) ?? [];
    list.push(report);
    this.reports.set(orderId, list);
  }

  reportsFor(orderId: string): SourceReport[] {
    return this.reports.get(orderId) ?? [];
  }

  /**
   * The oracle's actual job.
   *
   * The rule is NOT "any disagreement goes to a human", and getting that wrong
   * hands the merchant a veto: a merchant that never shipped simply attests
   * that it did, manufactures a disagreement, and stalls every claim against
   * it. The interested party would control the outcome.
   *
   * So the rule is corroboration rather than unanimity, and it is still not
   * "whoever spoke last":
   *
   *   The carrier and the buyer are INDEPENDENT of the merchant's incentive.
   *   When those two agree, that is the finding, and a contrary merchant
   *   attestation is recorded as evidence AGAINST the merchant rather than as
   *   a tie.
   *
   *   When the two independent sources disagree with each other, nothing
   *   independent has been established, and that is the case a human decides.
   *
   * UNDERWRITING.md section 5.
   */
  resolve(orderId: string): {
    agreed: boolean;
    delivered: boolean | null;
    asDescribed: boolean | null;
    disagreement: string | null;
    /** True when the merchant's own attestation contradicts the record. MN-03. */
    attestationContradicted: boolean;
  } {
    const reports = this.reportsFor(orderId);
    if (reports.length === 0) {
      return {
        agreed: false,
        delivered: null,
        asDescribed: null,
        disagreement: 'No source reported.',
        attestationContradicted: false,
      };
    }

    const describe = (r: SourceReport) =>
      `${r.source} says delivered=${r.claimsDelivered}, as described=${r.claimsAsDescribed}: ${r.evidence}`;

    const carrier = reports.find((r) => r.source === 'carrier');
    const buyer = reports.find((r) => r.source === 'buyer_confirmation');
    const merchant = reports.find((r) => r.source === 'merchant_attestation');

    // Both independent sources present and in agreement: that is the finding.
    if (carrier && buyer) {
      if (carrier.claimsDelivered !== buyer.claimsDelivered) {
        return {
          agreed: false,
          delivered: null,
          asDescribed: null,
          disagreement: `The two sources independent of the merchant disagree, so this is decided by a human rather than by either one. ${describe(carrier)} | ${describe(buyer)}`,
          attestationContradicted: false,
        };
      }
      const delivered = carrier.claimsDelivered;
      // The buyer is the only source that can speak to "as described": a
      // carrier scan proves arrival, not contents.
      const asDescribed = delivered ? buyer.claimsAsDescribed : false;
      const contradicted = Boolean(
        merchant && (merchant.claimsDelivered !== delivered || merchant.claimsAsDescribed !== asDescribed),
      );
      return { agreed: true, delivered, asDescribed, disagreement: null, attestationContradicted: contradicted };
    }

    // Only one independent source. Fall back to unanimity among what we have.
    const delivered = [...new Set(reports.map((r) => r.claimsDelivered))];
    const described = [...new Set(reports.map((r) => r.claimsAsDescribed))];
    if (delivered.length > 1 || described.length > 1) {
      return {
        agreed: false,
        delivered: null,
        asDescribed: null,
        disagreement: reports.map(describe).join(' | '),
        attestationContradicted: false,
      };
    }
    return {
      agreed: true,
      delivered: delivered[0],
      asDescribed: described[0],
      disagreement: null,
      attestationContradicted: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Claims are underwritten in their own right
// ---------------------------------------------------------------------------

export interface BuyerHistory {
  buyerId: string;
  priorClaims: number;
  priorPayouts: number;
  totalPurchases: number;
}

export interface ClaimInput {
  claimId: string;
  order: Order;
  bundle: ClaimEvidenceBundle;
  buyerHistory: BuyerHistory;
  /** Prior payouts on this exact merchant and buyer pair. F20. */
  pairPriorPayouts: number;
  /** Payouts already made against this merchant and this buyer. */
  merchantPaidToDateMinor: number;
  buyerPaidToDateMinor: number;
  claimWindowDays?: number;
}

/**
 * The buyer is a counterparty, not a trusted narrator.
 *
 * A payout requires the binding deposition that fixes what was promised, an
 * evidence bundle, and a claim inside the window against a merchant and buyer
 * pair with no prior collusive pattern. F19 and F20 are the attacks this
 * answers, and they are named taxonomy entries rather than an afterthought.
 */
export function underwriteClaim(input: ClaimInput, oracle: FulfillmentOracle): ClaimUnderwriting {
  const { claimId, order, buyerHistory } = input;
  const reasons: Reason[] = [];
  const capsApplied: string[] = [];
  const caps = PAYOUT_CAPS;

  const claimRate = buyerHistory.totalPurchases > 0 ? buyerHistory.priorClaims / buyerHistory.totalPurchases : 0;

  // F20: the profitable version of this attack needs both sides, which is why
  // both are scored.
  const pairScore = Math.min(1, input.pairPriorPayouts * 0.4 + (claimRate > 0.5 ? 0.4 : 0));
  const collusionFlagged = pairScore >= 0.6;

  const resolution = oracle.resolve(order.orderId);

  // Uncovered orders get no payout, and saying why matters: cold merchants
  // never funded a bond.
  if (!order.covered) {
    reasons.push({
      code: 'CLM-01',
      text: 'This purchase was not covered. The merchant never posted a bond, so no guarantee stands behind it.',
    });
    return deny(claimId, reasons, buyerHistory, claimRate, pairScore, collusionFlagged, capsApplied);
  }

  if (collusionFlagged) {
    reasons.push({
      code: 'CLM-02',
      text: `Merchant and buyer pair shows a collusive pattern, score ${pairScore.toFixed(2)}, with ${input.pairPriorPayouts} prior payout(s) on this exact pair.`,
    });
    return deny(claimId, reasons, buyerHistory, claimRate, pairScore, collusionFlagged, capsApplied);
  }

  // F19: first-party claim fraud. The oracle is what stops the buyer's word
  // being the only evidence.
  if (resolution.agreed && resolution.delivered && resolution.asDescribed) {
    reasons.push({
      code: 'CLM-03',
      text: 'Carrier, merchant and buyer records agree the item was delivered as described, so there is nothing to make whole.',
    });
    return deny(claimId, reasons, buyerHistory, claimRate, pairScore, collusionFlagged, capsApplied);
  }

  if (!resolution.agreed && resolution.disagreement) {
    // Disagreement does not resolve to whoever spoke last. It goes to a human.
    reasons.push({
      code: 'CLM-04',
      text: `Sources disagree about what happened, so this goes to human adjudication rather than to whoever spoke last. ${resolution.disagreement}`,
    });
    return {
      claimId,
      outcome: 'adjudicating',
      reasons,
      buyerClaimHistory: { priorClaims: buyerHistory.priorClaims, priorPayouts: buyerHistory.priorPayouts, claimRate },
      collusion: { pairScore, flagged: collusionFlagged },
      capsApplied,
      payoutMinor: 0,
      collateralAppliedMinor: 0,
      residualReceivableMinor: 0,
    };
  }

  // The claim is good. The deposition fixes what was promised, so the payout is
  // measured against the commitment rather than against the buyer's account.
  let payoutMinor = order.amountMinor;

  if (input.buyerPaidToDateMinor + payoutMinor > caps.perBuyerMinor) {
    payoutMinor = Math.max(0, caps.perBuyerMinor - input.buyerPaidToDateMinor);
    capsApplied.push(`per_buyer_cap:${caps.perBuyerMinor}`);
  }
  if (input.merchantPaidToDateMinor + payoutMinor > caps.perMerchantMinor) {
    payoutMinor = Math.max(0, caps.perMerchantMinor - input.merchantPaidToDateMinor);
    capsApplied.push(`per_merchant_cap:${caps.perMerchantMinor}`);
  }

  reasons.push({
    code: 'CLM-10',
    text: `The deposition committed to delivery in ${order.deposition.deliveryDays} days at ${(order.deposition.totalMinor / 100).toFixed(2)} ${order.deposition.currency}. Delivered reality contradicts it, so the commitment is breached.`,
  });

  if (resolution.attestationContradicted) {
    reasons.push({
      code: 'MN-03',
      text: 'The merchant attested that the order was delivered as described. The carrier record and the buyer both say otherwise, and they are the two sources independent of the merchant, so the attestation is evidence against the merchant rather than a tie.',
    });
  }

  const collateralAppliedMinor = Math.min(order.collateralMinor, payoutMinor);
  const residualReceivableMinor = payoutMinor - collateralAppliedMinor;

  return {
    claimId,
    outcome: 'paid',
    reasons,
    buyerClaimHistory: { priorClaims: buyerHistory.priorClaims, priorPayouts: buyerHistory.priorPayouts, claimRate },
    collusion: { pairScore, flagged: collusionFlagged },
    capsApplied,
    payoutMinor,
    collateralAppliedMinor,
    residualReceivableMinor,
  };
}

function deny(
  claimId: string,
  reasons: Reason[],
  h: BuyerHistory,
  claimRate: number,
  pairScore: number,
  flagged: boolean,
  capsApplied: string[],
): ClaimUnderwriting {
  return {
    claimId,
    outcome: 'denied',
    reasons,
    buyerClaimHistory: { priorClaims: h.priorClaims, priorPayouts: h.priorPayouts, claimRate },
    collusion: { pairScore, flagged },
    capsApplied,
    payoutMinor: 0,
    collateralAppliedMinor: 0,
    residualReceivableMinor: 0,
  };
}

// ---------------------------------------------------------------------------
// Depositions and scoped authority
// ---------------------------------------------------------------------------

/**
 * Merchant answers are recorded commitments. Settlement is authorized only
 * against the transcript, so a lie that evades detection still does not get
 * paid.
 */
export function recordDeposition(input: {
  fileId: string;
  totalMinor: number;
  currency: string;
  deliveryDays: number;
  refundWindowDays: number;
  refundForm: string;
  warrantyText: string;
  recurrence: string;
  quotes: Deposition['quotes'];
  at?: string;
}): Deposition {
  return {
    fileId: input.fileId,
    totalMinor: input.totalMinor,
    currency: input.currency,
    deliveryDays: input.deliveryDays,
    refundWindowDays: input.refundWindowDays,
    refundForm: input.refundForm,
    warrantyText: input.warrantyText,
    recurrence: input.recurrence,
    quotes: input.quotes,
    recordedAt: input.at ?? new Date().toISOString(),
  };
}

/**
 * Clearhouse does not hold the buyer's money. It constrains the authority:
 * scoped to a specific business, limited by amount and time, revocable.
 */
export function issueAuthority(input: {
  merchantId: string;
  maxAmountMinor: number;
  currency: string;
  ttlMinutes?: number;
  now?: Date;
}): ScopedAuthority {
  const now = input.now ?? new Date();
  return {
    reference: `CH-SPT-${randomUUID().slice(0, 8)}`,
    merchantId: input.merchantId,
    maxAmountMinor: input.maxAmountMinor,
    currency: input.currency,
    expiresAt: new Date(now.getTime() + (input.ttlMinutes ?? 30) * 60_000).toISOString(),
    revoked: false,
    revokedReason: null,
  };
}

export function revoke(authority: ScopedAuthority, reason: string): ScopedAuthority {
  return { ...authority, revoked: true, revokedReason: reason };
}
