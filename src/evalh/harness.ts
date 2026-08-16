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
import { score as scoreOf, SCORECARD_V1, type ScorecardVersion } from '../engine/scorecard';
import { getRuntime, measureVarianceFloor } from '../runtime/context';
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
}

export async function runEval(opts: EvalOptions = {}): Promise<EvalReport> {
  const rt = getRuntime();
  const varianceFloor = await measureVarianceFloor(rt);
  const scorecard = opts.scorecard ?? SCORECARD_V1;

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
          const raw: Raw = { persona: p, score: sc.score, gated: sc.gatesFired.length > 0, mode: p.mode };
          raws.push(raw);
          opts.onRow?.(
            { merchantId: p.id, label: p.label, taxonomy: p.taxonomy, mode: p.mode, score: sc.score, tier: sc.tier, correct: false },
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
    tier: tierFor(r.score, scorecard.thresholds, r.gated, r.mode),
    correct: false,
  }));
  const thresholds = deriveThresholds(provisional);

  // Pass two: re-tier under the derived bands. No check re-runs, because the
  // score is already a pure function of stored findings.
  const rows: EvalRow[] = raws.map((r) => {
    const tier = tierFor(r.score, thresholds, r.gated, r.mode);
    const stopped = tier === 'decline' || tier === 'refer';
    return {
      merchantId: r.persona.id,
      label: r.persona.label,
      taxonomy: r.persona.taxonomy,
      mode: r.mode,
      score: r.score,
      tier,
      correct: r.persona.label === 'fraud' ? stopped : !stopped,
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
