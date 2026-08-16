/**
 * Ledger and oracle tests.
 *
 * The fund is simulated, and it is the one place a judge may add up the
 * numbers, so reconciling arithmetic matters more than a convincing figure.
 */

import { describe, expect, it } from 'vitest';
import { Ledger, UnbalancedPostingError } from '../src/ledger/ledger';
import {
  FulfillmentOracle,
  IllegalTransitionError,
  canTransition,
  issueAuthority,
  revoke,
  underwriteClaim,
} from '../src/ledger/fulfillment';
import { settle } from '../src/ledger/settlement';
import type { Decision, Order } from '../src/contracts/types';

function decision(over: Partial<Decision> = {}): Decision {
  return {
    fileId: 'UF-TEST',
    merchantId: 'M-TEST',
    decision: 'conditional',
    score: 820,
    mode: 'bonded',
    covered: true,
    reasons: [],
    feeMinor: 240,
    currency: 'USD',
    guaranteeReference: 'CH-BOND-UF-TEST',
    escalation: null,
    amountMinor: 50_000,
    expectedLossMinor: 120,
    latencyMs: 2000,
    versions: { scorecard: 'scorecard-v1', checks: 'checks-v1', pricing: 'pricing-v1' },
    issuedAt: '2026-08-16T00:00:00Z',
    served: 'live',
    ...over,
  };
}

const buyerHistory = { buyerId: 'B-1', priorClaims: 0, priorPayouts: 0, totalPurchases: 4 };

const settleInput = {
  decision: decision(),
  collateralMinor: 5_000,
  deliveryDays: 5,
  refundWindowDays: 30,
  refundForm: 'full',
  warrantyText: 'One year limited.',
  recurrence: 'none',
  quotes: [],
  buyerId: 'B-1',
  willShip: true,
  shipsAsDescribed: true,
};

describe('double entry', () => {
  it('refuses a single-sided posting', () => {
    const l = new Ledger();
    expect(() =>
      l.post('bad', [{ account: 'fund.cash', debitMinor: 100, creditMinor: 0 }]),
    ).toThrow(UnbalancedPostingError);
  });

  it('refuses an unknown account', () => {
    const l = new Ledger();
    expect(() =>
      l.post('bad', [
        { account: 'not.a.real.account', debitMinor: 100, creditMinor: 0 },
        { account: 'fund.cash', debitMinor: 0, creditMinor: 100 },
      ]),
    ).toThrow(/Unknown account/);
  });

  it('keeps the trial balance at zero across every flow', () => {
    const l = new Ledger();
    l.capitalize(5_000_000);
    l.collectFee('M-1', 240, 'UF-1');
    l.postCollateral('M-1', 5_000, 'UF-1');
    l.payout('CLM-1', 'ORD-1', 'M-1', 50_000);
    l.applyCollateral('CLM-1', 'M-1', 5_000);
    l.bookReceivable('CLM-1', 'M-1', 45_000);
    l.releaseCollateral('M-1', 1_000);

    const tb = l.trialBalance();
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebitsMinor).toBe(tb.totalCreditsMinor);
  });

  it('nets claims expense to the part not recovered from the principal', () => {
    const l = new Ledger();
    l.capitalize(5_000_000);
    l.postCollateral('M-1', 5_000, 'UF-1');
    l.payout('CLM-1', 'ORD-1', 'M-1', 50_000);
    l.applyCollateral('CLM-1', 'M-1', 5_000);
    l.bookReceivable('CLM-1', 'M-1', 45_000);

    // The fund paid 50,000. Collateral covered 5,000 and the principal owes
    // the rest, so the net expense is zero and the exposure sits in a
    // receivable. That is the surety structure in accounting form.
    expect(l.balance('claims.expense')).toBe(0);
    expect(l.balance('recovery.receivable.M-1')).toBe(45_000);
    expect(l.balance('collateral.M-1')).toBe(0);
    expect(l.balance('fund.cash')).toBe(5_000_000 + 5_000 - 50_000);
  });

  it('reports gross payouts to buyers even when the expense account nets to zero', () => {
    const l = new Ledger();
    l.capitalize(5_000_000);
    l.postCollateral('M-1', 5_000, 'UF-1');
    l.payout('CLM-1', 'ORD-1', 'M-1', 50_000);
    l.applyCollateral('CLM-1', 'M-1', 5_000);
    l.bookReceivable('CLM-1', 'M-1', 45_000);

    // claims.expense nets to 0, but 50,000 was actually paid to the buyer.
    expect(l.summary().claimsExpenseMinor).toBe(0);
    expect(l.summary().grossPayoutsMinor).toBe(50_000);
  });

  it('rejects a negative-amount posting even though it "balances"', () => {
    const l = new Ledger();
    // debit -100 == credit -100 passes a naive debits===credits check.
    expect(() => l.post('bad', [
      { account: 'fund.cash', debitMinor: -100, creditMinor: 0 },
      { account: 'fees.income', debitMinor: 0, creditMinor: -100 },
    ])).toThrow(UnbalancedPostingError);
  });

  it('rejects a line that is both a debit and a credit', () => {
    const l = new Ledger();
    expect(() => l.post('bad', [
      { account: 'fund.cash', debitMinor: 100, creditMinor: 40 },
      { account: 'fees.income', debitMinor: 0, creditMinor: 60 },
    ])).toThrow(UnbalancedPostingError);
  });
});

describe('fulfillment state machine', () => {
  it('permits only legal transitions', () => {
    expect(canTransition('authorized', 'captured')).toBe(true);
    expect(canTransition('captured', 'shipped')).toBe(true);
    expect(canTransition('delivered', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'shipped')).toBe(false);
    expect(canTransition('settled_by_payout', 'disputed')).toBe(false);
  });

  it('throws rather than silently accepting an impossible history', () => {
    const oracle = new FulfillmentOracle();
    const order = { orderId: 'O-1', state: 'authorized', history: [] } as unknown as Order;
    oracle.createOrder(order);
    expect(() => oracle.transition('O-1', 'delivered', 'carrier', 'x')).toThrow(IllegalTransitionError);
  });
});

describe('the oracle does not resolve to whoever spoke last', () => {
  it('routes disagreement to adjudication', () => {
    const oracle = new FulfillmentOracle();
    oracle.createOrder({ orderId: 'O-2', state: 'captured', history: [] } as unknown as Order);
    oracle.report('O-2', { source: 'merchant_attestation', claimsDelivered: true, claimsAsDescribed: true, evidence: 'shipped' });
    oracle.report('O-2', { source: 'carrier', claimsDelivered: false, claimsAsDescribed: false, evidence: 'no scan' });

    const r = oracle.resolve('O-2');
    expect(r.agreed).toBe(false);
    expect(r.delivered).toBeNull();
    expect(r.disagreement).toContain('carrier');
  });

  it('does not let a merchant veto the carrier and the buyer together', () => {
    // The failure this guards against: a merchant that never shipped simply
    // attests that it did, manufactures a disagreement, and stalls every claim
    // against it. The interested party would control the outcome.
    const oracle = new FulfillmentOracle();
    oracle.createOrder({ orderId: 'O-8', state: 'captured', history: [] } as unknown as Order);
    oracle.report('O-8', { source: 'merchant_attestation', claimsDelivered: true, claimsAsDescribed: true, evidence: 'we shipped it' });
    oracle.report('O-8', { source: 'carrier', claimsDelivered: false, claimsAsDescribed: false, evidence: 'no scan ever recorded' });
    oracle.report('O-8', { source: 'buyer_confirmation', claimsDelivered: false, claimsAsDescribed: false, evidence: 'nothing arrived' });

    const r = oracle.resolve('O-8');
    expect(r.agreed).toBe(true);
    expect(r.delivered).toBe(false);
    expect(r.attestationContradicted).toBe(true);
  });

  it('goes to a human when the two independent sources disagree with each other', () => {
    const oracle = new FulfillmentOracle();
    oracle.createOrder({ orderId: 'O-7', state: 'captured', history: [] } as unknown as Order);
    oracle.report('O-7', { source: 'carrier', claimsDelivered: true, claimsAsDescribed: true, evidence: 'scanned delivered' });
    oracle.report('O-7', { source: 'buyer_confirmation', claimsDelivered: false, claimsAsDescribed: false, evidence: 'never received it' });

    const r = oracle.resolve('O-7');
    expect(r.agreed).toBe(false);
    expect(r.disagreement).toMatch(/independent of the merchant disagree/);
  });

  it('resolves when every source agrees', () => {
    const oracle = new FulfillmentOracle();
    oracle.createOrder({ orderId: 'O-3', state: 'captured', history: [] } as unknown as Order);
    for (const source of ['merchant_attestation', 'carrier', 'buyer_confirmation'] as const) {
      oracle.report('O-3', { source, claimsDelivered: true, claimsAsDescribed: true, evidence: 'ok' });
    }
    expect(oracle.resolve('O-3').agreed).toBe(true);
    expect(oracle.resolve('O-3').delivered).toBe(true);
  });

  it('does not believe the merchant on its own word (no independent source)', () => {
    const oracle = new FulfillmentOracle();
    oracle.createOrder({ orderId: 'O-9', state: 'captured', history: [] } as unknown as Order);
    oracle.report('O-9', { source: 'merchant_attestation', claimsDelivered: true, claimsAsDescribed: true, evidence: 'we shipped it' });

    const r = oracle.resolve('O-9');
    expect(r.agreed).toBe(false);
    expect(r.delivered).toBeNull();
    expect(r.disagreement).toMatch(/not an independent source/);
  });

  it('routes a source that contradicts itself to a human rather than first-report-wins', () => {
    const oracle = new FulfillmentOracle();
    oracle.createOrder({ orderId: 'O-10', state: 'captured', history: [] } as unknown as Order);
    oracle.report('O-10', { source: 'carrier', claimsDelivered: true, claimsAsDescribed: true, evidence: 'scanned' });
    oracle.report('O-10', { source: 'carrier', claimsDelivered: false, claimsAsDescribed: false, evidence: 'correction: no scan' });
    oracle.report('O-10', { source: 'buyer_confirmation', claimsDelivered: false, claimsAsDescribed: false, evidence: 'nothing arrived' });

    const r = oracle.resolve('O-10');
    expect(r.agreed).toBe(false);
    expect(r.disagreement).toMatch(/reported inconsistently/);
  });
});

describe('claims are underwritten in their own right', () => {
  it('pays the buyer when the merchant took the money and never shipped', () => {
    const ledger = new Ledger();
    ledger.capitalize(5_000_000);
    const oracle = new FulfillmentOracle();

    const r = settle({ ...settleInput, willShip: false, shipsAsDescribed: false }, ledger, oracle, buyerHistory);

    expect(r.paidOut).toBe(true);
    expect(r.claim?.outcome).toBe('paid');
    expect(r.claim?.payoutMinor).toBe(50_000);
    expect(r.claim?.collateralAppliedMinor).toBe(5_000);
    expect(r.claim?.residualReceivableMinor).toBe(45_000);
    expect(r.order.state).toBe('settled_by_payout');
    expect(ledger.trialBalance().balanced).toBe(true);
  });

  it('denies a claim when every source says the item arrived as described. F19', () => {
    const ledger = new Ledger();
    ledger.capitalize(5_000_000);
    const oracle = new FulfillmentOracle();

    // A buyer claiming otherwise cannot move this: the oracle has three
    // agreeing sources and the buyer is one of them.
    const r = settle(settleInput, ledger, oracle, buyerHistory);
    expect(r.paidOut).toBe(false);
    expect(r.claim).toBeNull();
    expect(r.order.state).toBe('confirmed');
  });

  it('denies a claim on an uncovered order, because a cold merchant funded nothing', () => {
    const ledger = new Ledger();
    ledger.capitalize(5_000_000);
    const oracle = new FulfillmentOracle();

    const r = settle(
      { ...settleInput, decision: decision({ covered: false, mode: 'cold', feeMinor: null }), collateralMinor: 0, willShip: false, shipsAsDescribed: false },
      ledger,
      oracle,
      buyerHistory,
    );
    expect(r.paidOut).toBe(false);
    expect(r.claim?.outcome).toBe('denied');
    expect(r.claim?.reasons[0].text).toMatch(/never posted a bond/);
  });

  it('denies a collusive merchant and buyer pair. F20', () => {
    const oracle = new FulfillmentOracle();
    const order = {
      orderId: 'O-9',
      merchantId: 'M-1',
      buyerId: 'B-9',
      amountMinor: 10_000,
      covered: true,
      collateralMinor: 0,
      state: 'disputed',
      history: [],
      deposition: { deliveryDays: 5, totalMinor: 10_000, currency: 'USD' },
    } as unknown as Order;
    oracle.createOrder(order);
    oracle.report('O-9', { source: 'carrier', claimsDelivered: false, claimsAsDescribed: false, evidence: 'no scan' });
    oracle.report('O-9', { source: 'merchant_attestation', claimsDelivered: false, claimsAsDescribed: false, evidence: 'lost' });
    oracle.report('O-9', { source: 'buyer_confirmation', claimsDelivered: false, claimsAsDescribed: false, evidence: 'nothing came' });

    const claim = underwriteClaim(
      {
        claimId: 'CLM-9',
        order,
        bundle: {} as never,
        buyerHistory: { buyerId: 'B-9', priorClaims: 8, priorPayouts: 5, totalPurchases: 9 },
        pairPriorPayouts: 3,
        merchantPaidToDateMinor: 0,
        buyerPaidToDateMinor: 0,
      },
      oracle,
    );

    expect(claim.outcome).toBe('denied');
    expect(claim.collusion.flagged).toBe(true);
    expect(claim.reasons[0].text).toMatch(/collusive/);
  });

  it('caps a payout rather than paying an unlimited facility', () => {
    const ledger = new Ledger();
    ledger.capitalize(5_000_000);
    const oracle = new FulfillmentOracle();

    const r = settle(
      { ...settleInput, decision: decision({ amountMinor: 400_000 }), willShip: false, shipsAsDescribed: false },
      ledger,
      oracle,
      buyerHistory,
      { merchant: 0, buyer: 190_000 },
    );
    // Per-buyer cap is 200,000 minor units and 190,000 is already paid.
    expect(r.claim?.payoutMinor).toBe(10_000);
    expect(r.claim?.capsApplied.some((c) => c.startsWith('per_buyer_cap'))).toBe(true);
  });
});

describe('scoped, revocable authority', () => {
  it('is scoped to a business, limited by amount and time, and revocable', () => {
    const a = issueAuthority({ merchantId: 'M-1', maxAmountMinor: 5_000, currency: 'USD', ttlMinutes: 30, now: new Date('2026-08-16T00:00:00Z') });
    expect(a.merchantId).toBe('M-1');
    expect(a.maxAmountMinor).toBe(5_000);
    expect(a.expiresAt).toBe('2026-08-16T00:30:00.000Z');
    expect(a.revoked).toBe(false);

    const r = revoke(a, 'Commitment breached before finality.');
    expect(r.revoked).toBe(true);
    expect(r.revokedReason).toMatch(/breached/);
  });
});
