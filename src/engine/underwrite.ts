/**
 * The underwriting orchestrator: build one Merchant Underwriting File.
 *
 * Deterministic checks resolve first and instantly, so the board fills with
 * Pillar 1 and Pillar 5 reason codes in the first second, which is also the
 * right demo behavior. LLM-backed checks run behind them in a bounded pool and
 * each yields findings as it completes.
 *
 * Every finding is appended to the log the moment it is produced. The stream is
 * a tail of that log rather than the source of truth, so a dropped connection
 * or a function timeout costs nothing. ARCHITECTURE.md section 9.
 */

import { randomUUID } from 'node:crypto';
import type { Check, CheckContext, Clock, EventStore, ModelClient, RegistryRecord } from '../contracts/ports';
import type {
  ContradictionView,
  Decision,
  ExposureState,
  FileId,
  Finding,
  MerchantSurface,
  Mode,
  Reason,
  Versions,
} from '../contracts/types';
import type { NewEvent } from '../contracts/events';
import { CHECKS_VERSION } from './codes';
import { PILLAR1_CHECKS } from './checks/pillar1';
import { PILLAR2_CHECKS } from './checks/pillar2';
import { PILLAR3_CHECKS } from './checks/pillar3';
import { PILLAR4_CHECKS, PILLAR5_CHECKS, PILLAR6_CHECKS } from './checks/pillar456';
import { ACTIVE_SCORECARD, score, type ScorecardVersion } from './scorecard';
import { PRICING_V1, price, type PricingVersion } from './pricing';
import { ExposureTracker } from './exposure';
import { applyPolicy } from './policy';

export const ALL_CHECKS: Check[] = [
  ...PILLAR1_CHECKS,
  ...PILLAR2_CHECKS,
  ...PILLAR3_CHECKS,
  ...PILLAR4_CHECKS,
  ...PILLAR5_CHECKS,
  ...PILLAR6_CHECKS,
];

export const systemClock: Clock = {
  now: () => new Date(),
  iso: () => new Date().toISOString(),
};

export interface UnderwriteInput {
  fileId?: FileId;
  merchant: MerchantSurface;
  amountMinor: number;
  currency: string;
  purpose: string;
  toleranceMinor?: number | null;
  registry: RegistryRecord;
  /** A one-off exposure snapshot. Prefer `exposureTracker` for cumulative caps. */
  exposure?: ExposureState;
  /**
   * Cumulative exposure across files. When present, the caps bind against
   * everything already outstanding for this merchant and attack class, not just
   * this single purchase, and covered exposure from this decision is recorded
   * back into it.
   */
  exposureTracker?: ExposureTracker;
  cumulativeExpectedLossMinor?: number;
  varianceFloor?: number;
  canaries?: { bx04: string; bx05: string };
  holdout?: Array<{ id: string; claim: string; text: string }>;
  /** Run the unannounced re-audit. Off for an initial file by construction. */
  includeReaudit?: boolean;
  scorecard?: ScorecardVersion;
  pricing?: PricingVersion;
  onFinding?: (f: Finding) => void;
  onProgress?: (p: { checkId: string; done: number; total: number }) => void;
}

export interface UnderwriteResult {
  fileId: FileId;
  decision: Decision;
  findings: Finding[];
  events: NewEvent[];
  latencyMs: number;
  errors: Array<{ checkId: string; message: string }>;
}

let fileCounter = 0;

export function canariesFromEnv(): { bx04: string; bx05: string } {
  const pick = (pool: string | undefined, fallback: string) => {
    const items = (pool ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return items.length > 0 ? items[0] : fallback;
  };
  return {
    // Fallbacks are obviously fake and only used when env is unset, which keeps
    // the repository free of anything that has to stay unknown.
    bx04: pick(process.env.CLEARHOUSE_CANARY_BX04_POOL, 'unset-buyer-canary'),
    bx05: pick(process.env.CLEARHOUSE_CANARY_BX05_POOL, 'unset-content-canary'),
  };
}

export function holdoutFromEnv(): Array<{ id: string; claim: string; text: string }> {
  try {
    const raw = process.env.CLEARHOUSE_HOLDOUT_QUESTIONS;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * A zeroed exposure state, used when no cumulative tracking is threaded in.
 *
 * For cumulative caps, pass `input.exposureTracker` instead: it carries
 * per-merchant and per-attack-class outstanding exposure across files, so the
 * caps bind against the whole book rather than a single transaction. The run
 * path (runGauntlet) shares one tracker across cells; a serverless request can
 * build one from the event log with `fromCoveredExposure`.
 */
export function emptyExposure(): ExposureState {
  return {
    perMerchantOutstandingMinor: 0,
    perMerchantCapMinor: 0,
    perClassOutstandingMinor: {},
    perClassCapMinor: PRICING_V1.exposureCaps.perAttackClassAggregateMinor,
    fundCapitalMinor: PRICING_V1.fund.statedCapitalMinor,
  };
}

export async function underwrite(
  input: UnderwriteInput,
  store: EventStore,
  model: ModelClient,
  clock: Clock = systemClock,
): Promise<UnderwriteResult> {
  const started = Date.now();
  const fileId = input.fileId ?? `UF-${String(++fileCounter).padStart(4, '0')}-${randomUUID().slice(0, 6)}`;
  const mode: Mode = input.merchant.mode;
  const scorecardVersion = input.scorecard ?? ACTIVE_SCORECARD;
  const pricingVersion = input.pricing ?? PRICING_V1;
  const versions: Versions = {
    scorecard: scorecardVersion.version,
    checks: CHECKS_VERSION,
    pricing: pricingVersion.version,
  };

  const findings: Finding[] = [];
  const events: NewEvent[] = [];
  const errors: Array<{ checkId: string; message: string }> = [];

  const emit = (f: Finding) => {
    findings.push(f);
    events.push({
      eventId: randomUUID(),
      type: 'check.finding',
      streamId: `file:${fileId}`,
      payload: { fileId, merchantId: input.merchant.merchantId, finding: f },
      versions,
    });
    input.onFinding?.(f);
  };

  events.push({
    eventId: randomUUID(),
    type: 'file.opened',
    streamId: `file:${fileId}`,
    payload: {
      fileId,
      merchantId: input.merchant.merchantId,
      mode,
      amountMinor: input.amountMinor,
      currency: input.currency,
      purpose: input.purpose,
      toleranceMinor: input.toleranceMinor ?? null,
    },
    versions,
  });

  const ctx: CheckContext = {
    merchant: input.merchant,
    model,
    clock,
    canaries: input.canaries ?? canariesFromEnv(),
    holdout: input.holdout ?? holdoutFromEnv(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    purpose: input.purpose,
    varianceFloor: input.varianceFloor ?? 0.02,
    registry: input.registry,
    emit,
  };

  // Only checks that run in this mode. A cold file never even attempts BX-05.
  const applicable = ALL_CHECKS.filter(
    (c) => c.modes.includes(mode) && (input.includeReaudit || c.id !== 'P6.reaudit'),
  );
  const deterministic = applicable.filter((c) => c.deterministic);
  const llmBacked = applicable.filter((c) => !c.deterministic);
  let done = 0;
  const total = applicable.length;

  const runCheck = async (check: Check) => {
    try {
      const produced = await check.run(ctx);
      for (const f of produced) emit(f);
    } catch (err) {
      // A failing check must never take the file down. It is recorded as an
      // error and the file proceeds with the evidence it does have, which is
      // the same treatment as absent evidence: a lower score, not a neutral one.
      errors.push({ checkId: check.id, message: err instanceof Error ? err.message : String(err) });
    } finally {
      input.onProgress?.({ checkId: check.id, done: ++done, total });
    }
  };

  // Deterministic first: the board fills in the first second.
  for (const check of deterministic) await runCheck(check);

  // Then the LLM-backed pool, bounded so we do not open 12 sockets at once.
  await pool(llmBacked, 4, runCheck);

  // -------------------------------------------------------------------------
  // Scoring. Pure function over the findings we just persisted.
  // -------------------------------------------------------------------------
  const scorecard = score(findings, scorecardVersion, mode);

  const attackClasses = [...new Set(findings.flatMap((f) => f.taxonomy))];
  // Cumulative exposure if a tracker is threaded through the run; otherwise the
  // one-off snapshot (or none). The tracker snapshot is taken BEFORE this
  // decision, so the caps bind against what is already outstanding.
  const exposure = input.exposureTracker
    ? input.exposureTracker.snapshot(input.merchant.merchantId, attackClasses)
    : input.exposure ?? emptyExposure();
  const pricing = price(
    {
      scorecard,
      amountMinor: input.amountMinor,
      thinFile: input.registry.priorFiles === 0,
      attackClasses,
      exposure,
    },
    pricingVersion,
  );

  const reasons: Reason[] = rankReasons(findings);
  const contradictions: ContradictionView[] = findings
    .filter((f) => f.code.startsWith('CL-'))
    .slice(0, 3)
    .map((f) => ({
      claim: f.code,
      left: { channel: 'feed' as const, value: f.text },
      right: { channel: 'checkout' as const, value: f.evidence },
      materiality: 4,
    }));

  const policy = applyPolicy(
    {
      scorecard,
      pricing,
      amountMinor: input.amountMinor,
      currency: input.currency,
      toleranceMinor: input.toleranceMinor ?? null,
      cumulativeExpectedLossMinor: input.cumulativeExpectedLossMinor ?? 0,
      thinFile: input.registry.priorFiles === 0,
      reasons,
      contradictions,
      evidenceIncomplete: errors.length > 0,
    },
    pricingVersion,
  );

  const latencyMs = Date.now() - started;

  const decision: Decision = {
    fileId,
    merchantId: input.merchant.merchantId,
    decision: policy.tier,
    score: scorecard.score,
    mode,
    covered: policy.covered,
    reasons: reasons.slice(0, 5),
    // Fee and guarantee reference exist only when covered. An agent must be
    // able to tell advice from coverage without inferring it.
    feeMinor: policy.covered ? pricing.feeMinor : null,
    currency: input.currency,
    guaranteeReference: policy.covered ? `CH-BOND-${fileId}` : null,
    escalation: policy.escalation,
    amountMinor: input.amountMinor,
    expectedLossMinor: pricing.expectedLossMinor,
    latencyMs,
    versions,
    issuedAt: clock.iso(),
    served: 'live',
  };

  // Record covered exposure so later files in this run see it. Only covered
  // purchases add exposure: those are the ones the fund is on the hook for.
  if (decision.covered) {
    input.exposureTracker?.record(input.merchant.merchantId, attackClasses, input.amountMinor);
  }

  events.push({
    eventId: randomUUID(),
    type: 'file.closed',
    streamId: `file:${fileId}`,
    payload: { fileId, latencyMs, findingCount: findings.length },
    versions,
  });
  events.push({
    eventId: randomUUID(),
    type: 'decision.issued',
    streamId: `file:${fileId}`,
    payload: { fileId, decision, scorecard, pricing },
    versions,
  });

  await store.append(events);

  return { fileId, decision, findings, events, latencyMs, errors };
}

/**
 * Replay: rerun the scorecard over stored findings and reproduce the decision
 * with ZERO model calls, at any layer. This is a different thing from the
 * cache. The cache avoids repeating a model call; replay never makes one.
 */
export async function replay(
  fileId: FileId,
  store: EventStore,
  scorecardVersion: ScorecardVersion = ACTIVE_SCORECARD,
): Promise<{ findings: Finding[]; scorecard: ReturnType<typeof score>; mode: Mode } | null> {
  const events = await store.read(`file:${fileId}`);
  if (events.length === 0) return null;

  const opened = events.find((e) => e.type === 'file.opened');
  const mode = ((opened?.payload as { mode?: Mode })?.mode ?? 'cold') as Mode;

  const findings = events
    .filter((e) => e.type === 'check.finding')
    .map((e) => (e.payload as { finding: Finding }).finding);

  return { findings, scorecard: score(findings, scorecardVersion, mode), mode };
}

/** Reason codes ranked by points lost, so the top three are the ones that mattered. */
export function rankReasons(findings: readonly Finding[]): Reason[] {
  return [...findings]
    .sort((a, b) => {
      if (a.gate !== b.gate) return a.gate ? -1 : 1; // gates first, always
      return Math.abs(b.points) - Math.abs(a.points);
    })
    .map((f) => ({ code: f.code, text: f.text }));
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
