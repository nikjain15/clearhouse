/**
 * The eval harness.
 *
 * Runs every labeled persona, derives the tier bands from where the set
 * actually separates, then re-tiers every row under the derived bands. Two
 * passes, because a score does not depend on a threshold but a tier does.
 */

import type { EvalReport, EvalRow, Mode } from '../contracts/types';
import { loadEvalPersonas, merchantFor, registryFor, CONTROL_MERCHANT_ID, type Persona } from '../merchants';
import { underwrite } from '../engine/underwrite';
import { score as scoreOf, ACTIVE_SCORECARD, type ScorecardVersion } from '../engine/scorecard';
import { getRuntime, measureVarianceFloor } from '../runtime/context';
import { Ledger } from '../ledger/ledger';
import { FulfillmentOracle } from '../ledger/fulfillment';
import { settle } from '../ledger/settlement';
import { PRICING_V1 } from '../engine/pricing';
import {
  confusion,
  deriveThresholds,
  EVAL_CAVEAT,
  perClassRecall,
  tierFor,
  DEFAULT_CLASS_FLOOR,
} from './separation';

export interface EvalOptions {
  concurrency?: number;
  floor?: number;
  scorecard?: ScorecardVersion;
  onRow?: (row: EvalRow, done: number, total: number) => void;
  onError?: (personaId: string, message: string) => void;
}

interface Raw {
  persona: Persona;
  score: number;
  gated: boolean;
  mode: Mode;
  /** Taken from the scorecard rather than recomputed, so the eval cannot drift from the engine. */
  materialityOverride: boolean;
}

export async function runEval(opts: EvalOptions = {}): Promise<EvalReport> {
  const rt = getRuntime();
  const varianceFloor = await measureVarianceFloor(rt);
  const scorecard = opts.scorecard ?? ACTIVE_SCORECARD;

  const personas = loadEvalPersonas().filter((p) => p.id !== CONTROL_MERCHANT_ID);
  const raws: Raw[] = [];
  const concurrency = opts.concurrency ?? 6;
  let i = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, personas.length) }, async () => {
      while (i < personas.length) {
        const p = personas[i++];
        try {
          const result = await underwrite(
            {
              merchant: merchantFor(p, rt.canaries),
              amountMinor: Math.round(p.catalog[0].feed_price * 100),
              currency: p.catalog[0].currency,
              purpose: p.catalog[0].title,
              registry: registryFor(p),
              canaries: rt.canaries,
              holdout: rt.holdout,
              varianceFloor,
            },
            rt.store,
            rt.model,
            rt.clock,
          );
          // Re-derive the raw score from findings so the row is a pure function
          // of what was persisted, exactly as replay would compute it.
          const sc = scoreOf(result.findings, scorecard, p.mode);
          const raw: Raw = { persona: p, score: sc.score, gated: sc.gatesFired.length > 0, mode: p.mode, materialityOverride: sc.materialityOverride };
          raws.push(raw);
          opts.onRow?.(
            { merchantId: p.id, label: p.label, taxonomy: p.taxonomy, mode: p.mode, score: sc.score, tier: sc.tier, correct: false, resolution: 'stopped' },
            ++done,
            personas.length,
          );
        } catch (err) {
          opts.onError?.(p.id, err instanceof Error ? err.message : String(err));
          done++;
        }
      }
    }),
  );

  // Pass one: derive the bands from the scores we just measured.
  const provisional: EvalRow[] = raws.map((r) => ({
    merchantId: r.persona.id,
    label: r.persona.label,
    taxonomy: r.persona.taxonomy,
    mode: r.mode,
    score: r.score,
    tier: tierFor(r.score, scorecard.thresholds, r.gated, r.mode, r.materialityOverride),
    correct: false,
    resolution: 'stopped',
  }));
  const thresholds = deriveThresholds(provisional);

  // Pass two: re-tier under the derived bands, then take each cleared merchant
  // all the way through settlement so a class the taxonomy assigns to the
  // post-purchase mechanism is measured against that mechanism.
  //
  // No check re-runs here: the score is already a pure function of stored
  // findings, so this pass costs nothing but arithmetic.
  const ledger = new Ledger();
  ledger.capitalize(PRICING_V1.fund.statedCapitalMinor);
  const oracle = new FulfillmentOracle();
  const paidToDate = { merchant: new Map<string, number>(), buyer: 0 };

  const rows: EvalRow[] = raws.map((r) => {
    const tier = tierFor(r.score, thresholds, r.gated, r.mode, r.materialityOverride);
    const stopped = tier === 'decline' || tier === 'refer';
    const p = r.persona;

    let resolution: EvalRow['resolution'];
    if (stopped) {
      resolution = 'stopped';
    } else if (p.label === 'honest') {
      resolution = 'cleared_honest';
    } else {
      // It cleared and it is fraud. Does the money layer make the buyer whole?
      const covered = p.mode === 'bonded';
      const amountMinor = Math.round(p.catalog[0].feed_price * 100);
      const collateralMinor =
        covered && tier === 'conditional'
          ? Math.round(amountMinor * PRICING_V1.collateral.conditionalReserveRate)
          : 0;
      const goesBad = !p.behaviors.will_ship || !p.behaviors.ships_as_described;

      if (!goesBad) {
        // A fraud whose attack is pre-purchase deception and which nonetheless
        // delivers the item. The buyer is not out of pocket, but we did not
        // stop the deception either, so this is a miss rather than a rescue.
        resolution = 'missed';
      } else {
        const result = settle(
          {
            decision: {
              fileId: `EVAL-${p.id}`,
              merchantId: p.id,
              decision: tier,
              score: r.score,
              mode: p.mode,
              covered,
              reasons: [],
              feeMinor: covered ? 100 : null,
              currency: p.catalog[0].currency,
              guaranteeReference: covered ? `CH-BOND-EVAL-${p.id}` : null,
              escalation: null,
              amountMinor,
              expectedLossMinor: 0,
              latencyMs: 0,
              versions: { scorecard: scorecard.version, checks: 'checks-v1', pricing: PRICING_V1.version },
              issuedAt: new Date().toISOString(),
              served: 'live',
            },
            collateralMinor,
            deliveryDays: p.catalog[0].delivery_days,
            refundWindowDays: p.policies.refund_window_days,
            refundForm: p.policies.refund_form,
            warrantyText: p.policies.warranty_text,
            recurrence: p.policies.recurrence,
            quotes: [],
            buyerId: 'B-EVAL',
            willShip: p.behaviors.will_ship,
            shipsAsDescribed: p.behaviors.ships_as_described,
          },
          ledger,
          oracle,
          { buyerId: 'B-EVAL', priorClaims: 0, priorPayouts: 0, totalPurchases: 50 },
          { merchant: paidToDate.merchant.get(p.id) ?? 0, buyer: 0 },
        );
        if (result.paidOut) {
          paidToDate.merchant.set(p.id, (paidToDate.merchant.get(p.id) ?? 0) + (result.claim?.payoutMinor ?? 0));
          resolution = 'made_whole';
        } else {
          resolution = 'missed';
        }
      }
    }

    return {
      merchantId: p.id,
      label: p.label,
      taxonomy: p.taxonomy,
      mode: r.mode,
      score: r.score,
      tier,
      correct: p.label === 'fraud' ? resolution !== 'missed' : resolution === 'cleared_honest',
      resolution,
    };
  });

  const perClass = perClassRecall(rows, opts.floor ?? DEFAULT_CLASS_FLOOR);
  const escalated = rows.filter((r) => r.tier === 'refer').length;

  return {
    generatedAt: new Date().toISOString(),
    scorecardVersion: scorecard.version,
    rows: rows.sort((a, b) => b.score - a.score),
    separation: thresholds.derivedFrom,
    thresholds,
    confusion: confusion(rows),
    escalationRate: rows.length ? escalated / rows.length : 0,
    perClass,
    gatePasses: perClass.every((c) => c.passes),
    caveat: EVAL_CAVEAT,
  };
}
