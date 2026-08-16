/**
 * The scorecard.
 *
 * PURE. No IO, no clock, no network, no randomness. This signature is the
 * replay guarantee: findings are the persisted artifact, and the score is a
 * function of them. `GET /api/replay/:fileId` reads stored findings, calls
 * this, and reproduces the decision exactly, forever, with zero model calls.
 *
 * PLATFORM.md section 1, "Determinism, honestly".
 */

import type { Finding, Mode, Pillar, PillarScore, ReasonCode, Scorecard, Tier } from '../contracts/types';
import scorecardV1 from '../../config/scorecards/v1.json';
import scorecardV2 from '../../config/scorecards/v2.json';
import checksV1 from '../../config/checks/v1.json';

export interface ScorecardVersion {
  version: string;
  scale: number;
  pillars: Record<string, { name: string; weight: number; maxPoints: number; coldAvailable: number }>;
  coldCeiling: { reachableTotal: number; maxTier: Tier; renormalize: boolean };
  thresholds: { clear: number; conditional: number; refer: number; derived: boolean; source: string };
  materiality: Record<string, number>;
  pointsPerSeverity: number;
  highMaterialityThreshold: number;
  hardGates: Array<{ code: string; name: string; detail: string; modes?: string[] }>;
}

export const SCORECARD_V1 = scorecardV1 as unknown as ScorecardVersion;

/**
 * scorecard-v2: the same weights and gates as v1, with the tier bands replaced
 * by values DERIVED from where the labeled set actually separates.
 *
 * v1 is retained unchanged and still scores correctly, because versions are
 * never edited in place and every decision records the versions that produced
 * it. A decision issued under v1 replays under v1 forever.
 */
export const SCORECARD_V2 = scorecardV2 as unknown as ScorecardVersion;

/** Every version, newest last. */
export const SCORECARDS: ScorecardVersion[] = [SCORECARD_V1, SCORECARD_V2];

/** The version new decisions are issued under. */
export const ACTIVE_SCORECARD = SCORECARD_V2;

export function scorecardByVersion(version: string): ScorecardVersion | undefined {
  return SCORECARDS.find((s) => s.version === version);
}

/** Code to materiality, derived from the check manifest so it stays in one place. */
const CODE_MATERIALITY: Record<ReasonCode, number> = (() => {
  const m: Record<string, number> = {};
  const mat = SCORECARD_V1.materiality;
  const byCode: Record<string, string> = {
    'CL-01': 'price',
    'CL-02': 'total_with_fees',
    'CL-03': 'stock',
    'CL-04': 'delivery',
    'CL-05': 'refund',
    'CL-06': 'warranty',
    'CL-07': 'recurrence',
    'CL-08': 'price',
    'CL-11': 'data_scope',

    // Pillar 3 material misstatements.
    //
    // "Any unresolved high-materiality contradiction routes to Refer regardless
    // of score or mode" is not restricted to the claims graph. Each of these is
    // a contradiction between what the merchant SAID and what its own written
    // terms hold, which is the same category of thing as a feed contradicting a
    // checkout quote. Treating them as merely expensive rather than material
    // let a merchant that invents refund terms proceed at 870, and the eval
    // caught that: F02, F09, F10 and F17 all failed their per-class floor.
    'BX-02': 'refund', // confirmed a false premise about warranty and delivery
    'BX-03': 'price', // quoted a different price to an agent than to a human
    'BX-06': 'refund', // committed to terms its written policy does not support
    'BX-07': 'refund', // asserted a human approval that never happened
    'CL-12': 'refund', // the item described is not the item sold
  };
  for (const [code, claim] of Object.entries(byCode)) m[code] = mat[claim] ?? 1;
  return m;
})();

const SOFT_CODES = new Set(
  (checksV1.codes as Array<{ code: string; soft?: boolean }>).filter((c) => c.soft).map((c) => c.code),
);

const PILLARS: Pillar[] = [1, 2, 3, 4, 5];

export function score(
  findings: readonly Finding[],
  version: ScorecardVersion = ACTIVE_SCORECARD,
  mode: Mode = 'cold',
): Scorecard {
  // ---------------------------------------------------------------------
  // 1. Pillar arithmetic.
  //
  // In cold mode a pillar's available points drop to the cold-reachable
  // subset and are NOT scaled back up. That is what leaves roughly a fifth
  // of the 1000-point scale unearned and puts Clear out of reach cold.
  // ---------------------------------------------------------------------
  const pillars: PillarScore[] = PILLARS.map((p) => {
    const cfg = version.pillars[String(p)];
    const available = mode === 'cold' ? cfg.coldAvailable : cfg.maxPoints;
    const mine = findings.filter((f) => f.pillar === p);
    const deducted = mine.reduce((sum, f) => sum + Math.abs(f.points), 0);
    return {
      pillar: p,
      earned: Math.max(0, available - deducted),
      available,
      weight: cfg.weight,
      codes: mine.map((f) => f.code),
    };
  });

  let total = pillars.reduce((s, p) => s + p.earned, 0);

  // Pillar 6 modifies the file rather than scoring a single decision, so its
  // findings apply against the total. UNDERWRITING.md section 2.
  const p6 = findings.filter((f) => f.pillar === 6);
  total = Math.max(0, total - p6.reduce((s, f) => s + Math.abs(f.points), 0));

  const scoreValue = Math.round(total);

  // ---------------------------------------------------------------------
  // 2. Hard gates. They run before scoring matters and produce a decline
  //    regardless of points.
  // ---------------------------------------------------------------------
  const gatesFired = findings.filter((f) => f.gate).map((f) => f.code);

  // ---------------------------------------------------------------------
  // 3. Tier.
  // ---------------------------------------------------------------------
  let tier: Tier;
  if (gatesFired.length > 0) {
    tier = 'decline';
  } else if (scoreValue >= version.thresholds.clear) {
    tier = 'clear';
  } else if (scoreValue >= version.thresholds.conditional) {
    tier = 'conditional';
  } else if (scoreValue >= version.thresholds.refer) {
    tier = 'refer';
  } else {
    tier = 'decline';
  }

  // ---------------------------------------------------------------------
  // 4. Overrides that are not about the number.
  // ---------------------------------------------------------------------

  // Any unresolved high-materiality contradiction routes to Refer regardless
  // of score or mode. A contradiction that emitted a finding is unresolved by
  // construction: resolved ones emit nothing.
  const materialityOverride =
    findings.some(
      (f) => !f.gate && (CODE_MATERIALITY[f.code] ?? 0) >= version.highMaterialityThreshold,
    ) && (tier === 'clear' || tier === 'conditional');
  if (materialityOverride) tier = 'refer';

  // A fingerprint match never acts alone as a hard gate. It raises the tier and
  // demands corroboration from another pillar. Without corroboration a
  // NW-02-driven decline becomes a refer instead, because fingerprint
  // similarity is evidence and not a verdict, and treating it as a verdict is
  // how you defame an honest merchant who bought the same storefront theme as
  // a fraudster. UNDERWRITING.md Pillar 4.
  const nw02 = findings.find((f) => f.code === 'NW-02');
  if (nw02 && tier === 'decline' && gatesFired.length === 0) {
    const corroborated = findings.some(
      (f) => f.pillar !== 4 && !SOFT_CODES.has(f.code) && Math.abs(f.points) > 0,
    );
    if (!corroborated) tier = 'refer';
  }

  // The cold ceiling. Clear is unreachable cold because Pillar 3 is largely
  // unearned, and this asserts it rather than relying on the arithmetic.
  let coldCeilingApplied = false;
  if (mode === 'cold' && tier === 'clear') {
    tier = version.coldCeiling.maxTier;
    coldCeilingApplied = true;
  }

  // ---------------------------------------------------------------------
  // 5. Coverage. Cold files are scored and never covered: the merchant funds
  //    the bond, and a merchant who never applied has funded nothing.
  // ---------------------------------------------------------------------
  const covered = mode === 'bonded' && (tier === 'clear' || tier === 'conditional');

  return {
    score: scoreValue,
    pillars,
    gatesFired,
    tier,
    mode,
    covered,
    scorecardVersion: version.version,
    coldCeilingApplied,
    materialityOverride,
  };
}

/** Highest score reachable in a mode. 800 cold, 1000 bonded, under v1. */
export function reachableTotal(version: ScorecardVersion, mode: Mode): number {
  return PILLARS.reduce(
    (s, p) => s + (mode === 'cold' ? version.pillars[String(p)].coldAvailable : version.pillars[String(p)].maxPoints),
    0,
  );
}

/** A new version with derived thresholds. Versions are never edited in place. */
export function withThresholds(
  version: ScorecardVersion,
  thresholds: { clear: number; conditional: number; refer: number },
  newVersionName: string,
): ScorecardVersion {
  return {
    ...version,
    version: newVersionName,
    thresholds: { ...thresholds, derived: true, source: 'eval separation curve' },
  };
}
