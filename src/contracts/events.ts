/**
 * The event union.
 *
 * The append-only log is the only authoritative state in Clearhouse. Scores,
 * the registry, the ledger balance, fulfillment state, eval results and the
 * board are all projections, and every one of them can be rebuilt from these
 * events alone. ARCHITECTURE.md section 2.
 */

import type {
  ArenaSubmission,
  ClaimId,
  ClaimUnderwriting,
  Decision,
  Deposition,
  Finding,
  FileId,
  FulfillmentState,
  FulfillmentSource,
  LedgerPosting,
  MerchantId,
  Mode,
  OrderId,
  Reason,
  ScopedAuthority,
  Scorecard,
  Pricing,
  Versions,
} from './types';

export type EventType =
  | 'file.opened'
  | 'check.finding'
  | 'file.closed'
  | 'decision.issued'
  | 'authority.issued'
  | 'authority.revoked'
  | 'deposition.recorded'
  | 'ledger.posted'
  | 'order.created'
  | 'fulfillment.transitioned'
  | 'claim.filed'
  | 'claim.underwritten'
  | 'claim.paid'
  | 'claim.denied'
  | 'adjudication.recorded'
  | 'arena.submitted'
  | 'arena.filtered'
  | 'arena.scored'
  | 'case.candidate'
  | 'case.promoted'
  | 'version.published'
  | 'reaudit.run';

interface Base<T extends EventType, P> {
  type: T;
  streamId: string;
  payload: P;
  versions?: Partial<Versions>;
}

export type ClearhouseEvent =
  | Base<'file.opened', { fileId: FileId; merchantId: MerchantId; mode: Mode; amountMinor: number; currency: string; purpose: string; toleranceMinor: number | null }>
  /** The load-bearing event. Everything about determinism rests on this one. */
  | Base<'check.finding', { fileId: FileId; merchantId: MerchantId; finding: Finding }>
  | Base<'file.closed', { fileId: FileId; latencyMs: number; findingCount: number }>
  | Base<'decision.issued', { fileId: FileId; decision: Decision; scorecard: Scorecard; pricing: Pricing }>
  | Base<'authority.issued', { fileId: FileId; authority: ScopedAuthority }>
  | Base<'authority.revoked', { fileId: FileId; reference: string; reason: string }>
  | Base<'deposition.recorded', { fileId: FileId; deposition: Deposition }>
  | Base<'ledger.posted', { posting: LedgerPosting }>
  | Base<'order.created', { orderId: OrderId; fileId: FileId; merchantId: MerchantId; buyerId: string; amountMinor: number; currency: string; covered: boolean }>
  | Base<'fulfillment.transitioned', { orderId: OrderId; from: FulfillmentState; to: FulfillmentState; source: FulfillmentSource; evidence: string }>
  | Base<'claim.filed', { claimId: ClaimId; orderId: OrderId; buyerId: string; buyerStatement: string }>
  | Base<'claim.underwritten', { claimId: ClaimId; underwriting: ClaimUnderwriting }>
  | Base<'claim.paid', { claimId: ClaimId; orderId: OrderId; merchantId: MerchantId; payoutMinor: number; collateralAppliedMinor: number }>
  | Base<'claim.denied', { claimId: ClaimId; reasons: Reason[] }>
  | Base<'adjudication.recorded', { fileId: FileId | null; claimId: ClaimId | null; verdict: 'approve_scoped' | 'decline' | 'pay' | 'deny'; adjudicator: string; note: string }>
  | Base<'arena.submitted', { submission: ArenaSubmission }>
  | Base<'arena.filtered', { submissionId: string; reasons: string[] }>
  | Base<'arena.scored', { submissionId: string; fileId: FileId; score: number; outcome: string }>
  /** A payout is a fraud that beat the score, so it auto-creates a candidate case. */
  | Base<'case.candidate', { caseId: string; merchantId: MerchantId; source: 'payout' | 'arena'; label: 'fraud' | 'honest'; provisionalTaxonomy: string | null }>
  /** The human promotion gate. This is the security boundary, not bureaucracy. */
  | Base<'case.promoted', { caseId: string; promotedBy: string; taxonomy: string }>
  | Base<'version.published', { kind: 'scorecard' | 'checks' | 'pricing'; version: string; gatePassed: boolean; note: string }>
  | Base<'reaudit.run', { fileId: FileId; merchantId: MerchantId; passed: boolean; findings: Finding[] }>;

/** An event on its way in. `eventId` makes append idempotent. */
export interface NewEvent {
  eventId: string;
  type: EventType;
  streamId: string;
  payload: unknown;
  versions?: Partial<Versions>;
}

/** An event as stored. `seq` is the global order and the SSE resume cursor. */
export interface StoredEvent extends NewEvent {
  seq: number;
  ts: string;
}

export type PayloadOf<T extends EventType> = Extract<ClearhouseEvent, { type: T }>['payload'];
