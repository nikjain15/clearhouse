/**
 * Threshold derivation.
 *
 * Bands are not set by taste. Each boundary is placed where the labeled set
 * actually separates:
 *
 *   the clear threshold sits ABOVE the highest-scoring known fraud,
 *   the decline floor sits BELOW the lowest-scoring known-honest merchant,
 *   and the refer band is the overlap region between them, which is exactly
 *   the range where a human label is worth most.
 *
 * The bands are therefore an output of the eval, published with the separation
 * curve that produced them, and they move when the curve moves.
 *
 * UNDERWRITING.md section 2, "How the thresholds are set".
 */

import type { ClassRecall, DerivedThresholds, EvalRow, SeparationCurve, Tier } from '../contracts/types';

const BUCKET = 50;

export function buildCurve(rows: EvalRow[]): SeparationCurve {
  const fraud = rows.filter((r) => r.label === 'fraud').map((r) => r.score);
  const honest = rows.filter((r) => r.label === 'honest').map((r) => r.score);

  const highestFraudScore = fraud.length ? Math.max(...fraud) : 0;
  const lowestHonestScore = honest.length ? Math.min(...honest) : 1000;

  const buckets: SeparationCurve['buckets'] = [];
  for (let from = 0; from < 1000; from += BUCKET) {
    const to = from + BUCKET - 1;
    buckets.push({
      from,
      to,
      honest: honest.filter((s) => s >= from && s <= to).length,
      fraud: fraud.filter((s) => s >= from && s <= to).length,
    });
  }

  // The overlap is the region where both labels appear. Below it nothing honest
  // lives, above it nothing fraudulent does.
  const low = Math.min(lowestHonestScore, highestFraudScore);
  const high = Math.max(lowestHonestScore, highestFraudScore);
  const count = rows.filter((r) => r.score >= low && r.score <= high).length;

  return { highestFraudScore, lowestHonestScore, overlap: { low, high, count }, buckets };
}

export function deriveThresholds(rows: EvalRow[]): DerivedThresholds {
  const curve = buildCurve(rows);
  const fraud = rows.filter((r) => r.label === 'fraud');
  const honest = rows.filter((r) => r.label === 'honest');

  // Clear sits above the highest-scoring known fraud. Nothing we have labeled
  // as fraud can reach it.
  const clear = Math.min(1000, curve.highestFraudScore + 1);

  // The decline floor sits below the lowest-scoring known-honest merchant, so
  // no merchant we believe to be honest is declined outright.
  const referFloor = Math.max(0, curve.lowestHonestScore);

  // Within the overlap, conditional splits at the point of maximum separation:
  // the threshold that best divides honest from fraud, by Youden's J.
  let conditional = Math.round((clear + referFloor) / 2);
  let bestJ = -Infinity;
  for (let t = referFloor; t <= clear; t += 5) {
    const sensitivity = honest.length ? honest.filter((r) => r.score >= t).length / honest.length : 0;
    const specificity = fraud.length ? fraud.filter((r) => r.score < t).length / fraud.length : 0;
    const j = sensitivity + specificity - 1;
    if (j > bestJ) {
      bestJ = j;
      conditional = t;
    }
  }

  const justification =
    `Clear at ${clear}: one point above the highest-scoring known fraud (${curve.highestFraudScore}), so no labeled fraud can reach the Clear band. ` +
    `Decline floor at ${referFloor}: the lowest-scoring known-honest merchant, so no merchant we believe honest is declined outright. ` +
    `Conditional at ${conditional}: the point of maximum separation inside the overlap region, Youden's J of ${bestJ.toFixed(3)} across ${curve.overlap.count} merchants. ` +
    `The overlap spans ${curve.overlap.low} to ${curve.overlap.high} and is where a human label is worth most, which is why it is the refer band.`;

  return { clear, conditional, refer: referFloor, derivedFrom: curve, justification };
}

/** Re-tier a score under derived thresholds, without re-running any check. */
export function tierFor(
  score: number,
  t: { clear: number; conditional: number; refer: number },
  gated: boolean,
  mode: 'cold' | 'bonded',
): Tier {
  if (gated) return 'decline';
  let tier: Tier;
  if (score >= t.clear) tier = 'clear';
  else if (score >= t.conditional) tier = 'conditional';
  else if (score >= t.refer) tier = 'refer';
  else tier = 'decline';
  // Clear stays unreachable cold whatever the derived numbers say.
  if (mode === 'cold' && tier === 'clear') tier = 'conditional';
  return tier;
}

/**
 * Per-class recall floors.
 *
 * No scorecard, check, or pricing version ships unless it clears a recall floor
 * ON EVERY ATTACK CLASS, not merely a better aggregate. An aggregate gate
 * permits a new version to trade away an entire fraud class for a better
 * average, which is precisely the regression that matters. Improvement is
 * enforced per class, not asserted as monotonic. PLATFORM.md section 3.
 */
export const DEFAULT_CLASS_FLOOR = 0.8;

export function perClassRecall(rows: EvalRow[], floor = DEFAULT_CLASS_FLOOR): ClassRecall[] {
  const classes = [...new Set(rows.filter((r) => r.label === 'fraud').flatMap((r) => r.taxonomy))].sort();
  return classes.map((taxonomy) => {
    const mine = rows.filter((r) => r.label === 'fraud' && r.taxonomy.includes(taxonomy));
    // "Caught" for the gate means not silently cleared: declined or referred.
    const caught = mine.filter((r) => r.tier === 'decline' || r.tier === 'refer').length;
    const recall = mine.length ? caught / mine.length : 1;
    return { taxonomy, total: mine.length, caught, recall, floor, passes: recall >= floor };
  });
}

export function confusion(rows: EvalRow[]) {
  const stopped = (r: EvalRow) => r.tier === 'decline' || r.tier === 'refer';
  return {
    tp: rows.filter((r) => r.label === 'fraud' && stopped(r)).length,
    fn: rows.filter((r) => r.label === 'fraud' && !stopped(r)).length,
    fp: rows.filter((r) => r.label === 'honest' && stopped(r)).length,
    tn: rows.filter((r) => r.label === 'honest' && !stopped(r)).length,
  };
}

export const EVAL_CAVEAT =
  'This set validates RANKING, not absolute probability. Roughly 40 to 60 self-authored personas can demonstrate that the scorecard orders merchants correctly and that frauds concentrate in the low bands. They cannot calibrate a price, and a band holding three merchants produces an estimate whose error bar covers the entire pricing range. PD(score) is therefore a stated prior taken from published card-industry fraud rates by band, not a curve fitted to this set. Real calibration would take label counts in the tens of thousands with observed outcomes, not authored intent.';
