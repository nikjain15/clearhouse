/**
 * Settlement: what happens after a decision clears.
 *
 * Ties the decision to the ledger, the oracle, and the claims path, so a
 * gauntlet run produces a fund that reconciles rather than a fund that is
 * displayed.
 */

import { randomUUID } from 'node:crypto';
import type { ClaimUnderwriting, Decision, Deposition, Order } from '../contracts/types';
import { Ledger } from './ledger';
import {
  FulfillmentOracle,
  issueAuthority,
  recordDeposition,
  underwriteClaim,
  type BuyerHistory,
  type SourceReport,
} from './fulfillment';

export interface SettleInput {
  decision: Decision;
  collateralMinor: number;
  deliveryDays: number;
  refundWindowDays: number;
  refundForm: string;
  warrantyText: string;
  recurrence: string;
  quotes: Deposition['quotes'];
  buyerId: string;
  /** From the persona's declared behavior. Drives what the sources report. */
  willShip: boolean;
  shipsAsDescribed: boolean;
}

export interface SettleResult {
  order: Order;
  deposition: Deposition;
  claim: ClaimUnderwriting | null;
  paidOut: boolean;
}

/**
 * Run one purchase all the way through: authorize, capture, ship or fail to
 * ship, let the three sources report, and file a claim when the buyer is out of
 * pocket.
 */
export function settle(
  input: SettleInput,
  ledger: Ledger,
  oracle: FulfillmentOracle,
  buyerHistory: BuyerHistory,
  paidToDate: { merchant: number; buyer: number } = { merchant: 0, buyer: 0 },
): SettleResult {
  const d = input.decision;
  const orderId = `ORD-${randomUUID().slice(0, 8)}`;

  const deposition = recordDeposition({
    fileId: d.fileId,
    totalMinor: d.amountMinor,
    currency: d.currency,
    deliveryDays: input.deliveryDays,
    refundWindowDays: input.refundWindowDays,
    refundForm: input.refundForm,
    warrantyText: input.warrantyText,
    recurrence: input.recurrence,
    quotes: input.quotes,
  });

  const authority = issueAuthority({
    merchantId: d.merchantId,
    maxAmountMinor: d.amountMinor,
    currency: d.currency,
  });

  const order: Order = {
    orderId,
    fileId: d.fileId,
    merchantId: d.merchantId,
    buyerId: input.buyerId,
    amountMinor: d.amountMinor,
    currency: d.currency,
    state: 'authorized',
    deposition,
    covered: d.covered,
    collateralMinor: input.collateralMinor,
    authority,
    history: [],
  };
  oracle.createOrder(order);

  // Money moves. Fee and collateral only exist when a bond is in force.
  if (d.covered && d.feeMinor) ledger.collectFee(d.merchantId, d.feeMinor, d.fileId);
  if (d.covered && input.collateralMinor > 0) {
    ledger.postCollateral(d.merchantId, input.collateralMinor, d.fileId);
  }

  oracle.transition(orderId, 'captured', 'system', 'Scoped authority exercised within its amount and time limits.');

  // ------------------------------------------------------------------------
  // The three sources report independently.
  // ------------------------------------------------------------------------
  const merchantAttestation: SourceReport = {
    source: 'merchant_attestation',
    // A merchant that will not ship still attests that it did. That is the
    // whole reason the oracle exists.
    claimsDelivered: true,
    claimsAsDescribed: true,
    evidence: 'Merchant marked the order shipped and delivered in its own system.',
  };
  const carrier: SourceReport = {
    source: 'carrier',
    claimsDelivered: input.willShip,
    claimsAsDescribed: input.willShip,
    evidence: input.willShip
      ? 'Carrier scan recorded delivery at the destination address.'
      : 'No carrier scan was ever recorded against this tracking number.',
  };
  const buyer: SourceReport = {
    source: 'buyer_confirmation',
    claimsDelivered: input.willShip,
    claimsAsDescribed: input.willShip && input.shipsAsDescribed,
    evidence: !input.willShip
      ? 'Buyer states nothing arrived.'
      : input.shipsAsDescribed
        ? 'Buyer confirms the item arrived as described.'
        : 'Buyer states the item arrived but is not what was described.',
  };

  oracle.report(orderId, merchantAttestation);
  oracle.report(orderId, carrier);
  oracle.report(orderId, buyer);

  if (input.willShip) {
    oracle.transition(orderId, 'shipped', 'merchant_attestation', 'Merchant marked shipped.');
    oracle.transition(orderId, 'delivered', 'carrier', carrier.evidence);
  } else {
    oracle.transition(orderId, 'disputed', 'buyer_confirmation', buyer.evidence);
  }

  const everythingFine = input.willShip && input.shipsAsDescribed;
  if (everythingFine) {
    oracle.transition(orderId, 'confirmed', 'buyer_confirmation', buyer.evidence);
    return { order, deposition, claim: null, paidOut: false };
  }

  // ------------------------------------------------------------------------
  // Something went wrong. The claim is underwritten in its own right.
  // ------------------------------------------------------------------------
  if (order.state === 'delivered') {
    oracle.transition(orderId, 'disputed', 'buyer_confirmation', buyer.evidence);
  }

  const claimId = `CLM-${randomUUID().slice(0, 8)}`;
  const claim = underwriteClaim(
    {
      claimId,
      order,
      bundle: {
        orderRecord: order,
        fulfillmentState: order.state,
        fulfillmentHistory: order.history,
        merchantCommunications: [merchantAttestation.evidence],
        buyerStatement: buyer.evidence,
        deposition,
      },
      buyerHistory,
      pairPriorPayouts: 0,
      merchantPaidToDateMinor: paidToDate.merchant,
      buyerPaidToDateMinor: paidToDate.buyer,
    },
    oracle,
  );

  oracle.transition(orderId, 'adjudicated', 'system', claim.reasons[0]?.text ?? 'Claim underwritten.');

  if (claim.outcome === 'paid' && claim.payoutMinor > 0) {
    // The fund pays the obligee first, then recovers from the principal.
    ledger.payout(claimId, orderId, d.merchantId, claim.payoutMinor);
    if (claim.collateralAppliedMinor > 0) {
      ledger.applyCollateral(claimId, d.merchantId, claim.collateralAppliedMinor);
    }
    if (claim.residualReceivableMinor > 0) {
      ledger.bookReceivable(claimId, d.merchantId, claim.residualReceivableMinor);
    }
    oracle.transition(orderId, 'settled_by_payout', 'system', `Fund paid the buyer ${claim.payoutMinor} minor units.`);
    return { order, deposition, claim, paidOut: true };
  }

  if (claim.outcome === 'denied') {
    oracle.transition(orderId, 'denied', 'system', claim.reasons[0]?.text ?? 'Claim denied.');
  }
  return { order, deposition, claim, paidOut: false };
}
