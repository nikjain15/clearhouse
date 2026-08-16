/**
 * The self-improving loop.
 *
 * "Scam it once, it pays you. Try the same scam twice, it is already in the
 * immune system."
 *
 * The honest mechanism matters here, because it would be easy to fake. F05 is
 * "takes the money and never ships", and TAXONOMY.md is explicit that there is
 * no pre-purchase tell: a merchant that intends not to ship looks exactly like
 * one that intends to. So the loop does NOT invent a detector that spots
 * intent. What changes is the FILE.
 *
 * A payout is a fact about this merchant. It enters the registry, and Pillar 4
 * reads the registry. The second attempt is scored against a merchant with a
 * payout against it, which is a different merchant from the underwriter's point
 * of view even though nothing about the storefront changed.
 *
 * That is how consortium data actually works at card-network scale, and it is
 * the compounding moat rather than a cleverer classifier.
 */

import { randomUUID } from 'node:crypto';
import type { EventStore, RegistryRecord } from '../contracts/ports';

export interface RegistryDelta {
  merchantId: string;
  priorPayouts: number;
  totalPaidMinor: number;
  negativeFile: boolean;
  noticeCodes: string[];
  attestationContradicted: number;
}

/**
 * Project the registry from the append-only log.
 *
 * Every view is a projection that can be rebuilt, which is what makes replay,
 * audit and recalibration cheap. ARCHITECTURE.md section 4.
 */
export async function registryProjection(store: EventStore): Promise<Map<string, RegistryDelta>> {
  const out = new Map<string, RegistryDelta>();
  const paid = await store.readByType('claim.paid');

  for (const e of paid) {
    const p = e.payload as { merchantId: string; payoutMinor: number };
    const prior = out.get(p.merchantId) ?? {
      merchantId: p.merchantId,
      priorPayouts: 0,
      totalPaidMinor: 0,
      negativeFile: false,
      noticeCodes: [],
      attestationContradicted: 0,
    };
    prior.priorPayouts++;
    prior.totalPaidMinor += p.payoutMinor;
    prior.negativeFile = true;
    // A negative file is a serious thing to hold, so it carries the codes that
    // caused it and the merchant is entitled to notice of them.
    prior.noticeCodes = ['NW-04', 'MN-03'];
    // The payout only happened because the carrier and the buyer together
    // contradicted the merchant's attestation. That is a monitoring outcome.
    prior.attestationContradicted++;
    out.set(p.merchantId, prior);
  }

  return out;
}

/** Fold the projection into a persona's seeded registry record. */
export function applyRegistryDelta(base: RegistryRecord, delta: RegistryDelta | undefined): RegistryRecord {
  if (!delta) return base;
  const priorFiles = base.priorFiles + delta.priorPayouts;
  return {
    ...base,
    priorPayouts: base.priorPayouts + delta.priorPayouts,
    priorFiles,
    negativeFile: true,
    attestationContradicted: base.attestationContradicted + delta.attestationContradicted,
    // A payout IS a dispute, so the ratio moves. This is the Visa
    // monitoring-program mechanic: crossing the threshold triggers automatic
    // re-underwriting rather than waiting for someone to notice.
    disputeRatio: Math.min(
      1,
      ((base.disputeRatio ?? 0) * Math.max(base.priorFiles, 1) + delta.priorPayouts) / Math.max(priorFiles, 1),
    ),
    notice: {
      sent: true,
      at: new Date().toISOString(),
      codes: delta.noticeCodes,
    },
    // Correction and appeal stay open, because a registry without them is just
    // a list of accusations.
    appeal: { open: true, merchantResponse: null },
  };
}

/** A payout is a fraud that beat the score, so it auto-creates a candidate case. */
export async function candidateFromPayout(
  store: EventStore,
  input: { merchantId: string; claimId: string; taxonomy: string | null },
): Promise<string> {
  const caseId = `CASE-${input.claimId}`;
  await store.append([
    {
      eventId: randomUUID(),
      type: 'case.candidate',
      streamId: 'eval',
      payload: {
        caseId,
        merchantId: input.merchantId,
        source: 'payout',
        label: 'fraud',
        provisionalTaxonomy: input.taxonomy,
      },
    },
  ]);
  return caseId;
}

export async function promoteCase(
  store: EventStore,
  caseId: string,
  taxonomy: string,
  promotedBy = 'human',
): Promise<void> {
  await store.append([
    {
      eventId: randomUUID(),
      type: 'case.promoted',
      streamId: 'eval',
      payload: { caseId, promotedBy, taxonomy },
    },
  ]);
}

export async function publishVersion(
  store: EventStore,
  input: { kind: 'scorecard' | 'checks' | 'pricing'; version: string; gatePassed: boolean; note: string },
): Promise<void> {
  await store.append([
    {
      eventId: randomUUID(),
      type: 'version.published',
      streamId: 'versions',
      payload: input,
    },
  ]);
}
