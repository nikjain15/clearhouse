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
import taxonomy from '../../config/taxonomy.json';

const BUCKET = 50;

/**
 * Classes the taxonomy assigns to a post-purchase mechanism.
 *
 * Excluded when placing the Clear threshold, and the reason is not
 * convenience. F05 is "takes the money and never ships", and there is no
 * reliable pre-purchase tell: a merchant that intends not to ship looks exactly
 * like one that intends to. TAXONOMY.md assigns it to the fulfillment oracle
 * and the payout rather than to any pillar.
 *
 * Letting such a class set the Clear threshold collapses the band for
 * everybody. Measured on this set, two F05 personas scored 955 and pushed Clear
 * to 956, which put the established honest merchants and the demo's own honest
 * merchant OUT of Clear. The band would then have meant "nothing bad can ever
 * happen", which is not a claim any underwriter can make, and is exactly the
 * thing the bond exists to answer instead.
 *
 * So Clear means: no fraud the scorecard is expected to stop before money moves
 * reaches this band. What happens after money moves is the guarantee's job.
 */
export const POST_PURCHASE_CLASSES = new Set(
  (taxonomy.merchantFacing as Array<{ id: string; resolution: string }>)
    .filter((t) => t.resolution === 'post_purchase')
    .map((t) => t.id),
);

function isPostPurchaseOnly(row: EvalRow): boolean {
  return row.taxonomy.length > 0 && row.taxonomy.every((t) => POST_PURCHASE_CLASSES.has(t));
}

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

  // Clear sits above the highest-scoring fraud the scorecard is expected to
  // stop before money moves. Post-purchase classes are excluded and named.
  const prePurchaseFraud = fraud.filter((r) => !isPostPurchaseOnly(r));
  const excluded = fraud.filter(isPostPurchaseOnly);
  const highestPrePurchase = prePurchaseFraud.length
    ? Math.max(...prePurchaseFraud.map((r) => r.score))
    : 0;
  const clear = Math.min(1000, highestPrePurchase + 1);

  // The decline floor sits below the lowest-scoring known-honest merchant, so
  // no merchant we believe to be honest is declined outright.
  const referFloor = Math.max(0, curve.lowestHonestScore);

  // Within the overlap, conditional splits at the point of maximum separation:
  // the threshold that best divides honest from pre-purchase-detectable fraud,
  // by Youden's J.
  let conditional = Math.round((clear + referFloor) / 2);
  let bestJ = -Infinity;
  for (let t = referFloor; t <= clear; t += 5) {
    const sensitivity = honest.length ? honest.filter((r) => r.score >= t).length / honest.length : 0;
    const specificity = prePurchaseFraud.length
      ? prePurchaseFraud.filter((r) => r.score < t).length / prePurchaseFraud.length
      : 0;
    const j = sensitivity + specificity - 1;
    if (j > bestJ) {
      bestJ = j;
      conditional = t;
    }
  }

  const exclusionNote = excluded.length
    ? ` ${excluded.length} fraud persona(s) in post-purchase classes (${[
        ...new Set(excluded.flatMap((r) => r.taxonomy)),
      ].join(', ')}) were excluded from this boundary, scoring as high as ${Math.max(
        ...excluded.map((r) => r.score),
      )}. The taxonomy assigns them to the fulfillment oracle and the payout rather than to a pillar, because a merchant that intends not to ship looks exactly like one that intends to. Including them would have set Clear at ${
        Math.max(...excluded.map((r) => r.score)) + 1
      } and put the established honest merchants outside it, which would make the band mean "nothing bad can ever happen". That is not a claim an underwriter can make, and it is what the bond answers instead.`
    : '';

  const justification =
    `Clear at ${clear}: one point above the highest-scoring fraud the scorecard is expected to stop before money moves (${highestPrePurchase}).${exclusionNote} ` +
    `Decline floor at ${referFloor}: the lowest-scoring known-honest merchant, so no merchant we believe honest is declined outright. ` +
    `Conditional at ${conditional}: the point of maximum separation inside the overlap region, Youden's J of ${bestJ.toFixed(3)} across ${curve.overlap.count} merchants. ` +
    `The overlap spans ${curve.overlap.low} to ${curve.overlap.high} and is where a human label is worth most, which is why it is the refer band.`;

  return { clear, conditional, refer: referFloor, derivedFrom: curve, justification };
}

/**
 * Re-tier a score under derived thresholds, without re-running any check.
 *
 * This must apply EVERY rule the scorecard applies, not merely the numeric
 * bands. Leaving out the materiality override made the eval under-report by
 * exactly the population the override exists to catch: merchants whose defect
 * is a material misstatement rather than a low score. Three board personas
 * read as missed when the engine would in fact have referred them.
 *
 * The lesson is worth keeping: a second implementation of a decision rule is a
 * second place for it to be wrong, so this takes the flags the scorecard
 * already computed rather than recomputing them.
 */
export function tierFor(
  score: number,
  t: { clear: number; conditional: number; refer: number },
  gated: boolean,
  mode: 'cold' | 'bonded',
  materialityOverride = false,
): Tier {
  if (gated) return 'decline';
  let tier: Tier;
  if (score >= t.clear) tier = 'clear';
  else if (score >= t.conditional) tier = 'conditional';
  else if (score >= t.refer) tier = 'refer';
  else tier = 'decline';

  // Any unresolved high-materiality contradiction routes to Refer regardless
  // of score or mode. UNDERWRITING.md section 2.
  if (materialityOverride && (tier === 'clear' || tier === 'conditional')) tier = 'refer';

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

    // Score recall: stopped before money moved.
    const caught = mine.filter((r) => r.resolution === 'stopped').length;
    // Resolution: stopped, OR cleared and the buyer was made whole by the fund.
    const resolved = mine.filter((r) => r.resolution === 'stopped' || r.resolution === 'made_whole').length;

    const recall = mine.length ? caught / mine.length : 1;
    const resolvedRate = mine.length ? resolved / mine.length : 1;

    // The gate is on RESOLUTION, not on score recall, and only because the
    // taxonomy assigns some classes to a post-purchase mechanism. TAXONOMY.md
    // puts F05 on "fulfillment oracle plus binding deposition, payout when
    // missed", so gating it on score recall would measure the wrong machinery
    // and would push us to decline merchants the design says to bond and cover.
    //
    // Both numbers are reported. A payout is not a catch, and showing only the
    // gated column is how a system claims perfection it does not have.
    return {
      taxonomy,
      total: mine.length,
      caught,
      recall,
      resolved,
      resolvedRate,
      floor,
      passes: resolvedRate >= floor,
    };
  });
}

export function confusion(rows: EvalRow[]) {
  const stopped = (r: EvalRow) => r.resolution === 'stopped';
  return {
    tp: rows.filter((r) => r.label === 'fraud' && stopped(r)).length,
    fn: rows.filter((r) => r.label === 'fraud' && !stopped(r)).length,
    fp: rows.filter((r) => r.label === 'honest' && stopped(r)).length,
    tn: rows.filter((r) => r.label === 'honest' && !stopped(r)).length,
  };
}

export const EVAL_CAVEAT =
  'This set validates RANKING, not absolute probability. Roughly 40 to 60 self-authored personas can demonstrate that the scorecard orders merchants correctly and that frauds concentrate in the low bands. They cannot calibrate a price, and a band holding three merchants produces an estimate whose error bar covers the entire pricing range. PD(score) is therefore a stated prior taken from published card-industry fraud rates by band, not a curve fitted to this set. Real calibration would take label counts in the tens of thousands with observed outcomes, not authored intent.';
