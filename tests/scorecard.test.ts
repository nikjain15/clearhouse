/**
 * Scorecard tests.
 *
 * These assert the properties the specification documents make load-bearing
 * claims about, so a regression here is a regression in what we say on stage.
 */

import { describe, expect, it } from 'vitest';
import { SCORECARD_V1, reachableTotal, score } from '../src/engine/scorecard';
import type { Finding, Mode } from '../src/contracts/types';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    checkId: 'test',
    pillar: 1,
    code: 'ID-03',
    points: 45,
    text: 'test finding',
    evidence: 'test evidence',
    gate: false,
    promptVersion: null,
    taxonomy: [],
    ...over,
  };
}

describe('cold mode is not renormalized', () => {
  it('caps a perfect cold file at 800, roughly a fifth of the scale unearned', () => {
    expect(reachableTotal(SCORECARD_V1, 'cold')).toBe(800);
    expect(reachableTotal(SCORECARD_V1, 'bonded')).toBe(1000);

    const perfect = score([], SCORECARD_V1, 'cold');
    expect(perfect.score).toBe(800);
  });

  it('puts Clear out of reach cold no matter how honest the merchant is', () => {
    const perfect = score([], SCORECARD_V1, 'cold');
    expect(perfect.score).toBeLessThan(SCORECARD_V1.thresholds.clear);
    expect(perfect.tier).toBe('conditional');
  });

  it('lets a perfect bonded file reach Clear', () => {
    const perfect = score([], SCORECARD_V1, 'bonded');
    expect(perfect.score).toBe(1000);
    expect(perfect.tier).toBe('clear');
  });

  it('leaves the unearned points in Pillar 3, where consent is what is missing', () => {
    const cold = score([], SCORECARD_V1, 'cold');
    const p3 = cold.pillars.find((p) => p.pillar === 3)!;
    expect(p3.available).toBe(60);
    expect(p3.weight).toBe(0.2);

    const bonded = score([], SCORECARD_V1, 'bonded');
    expect(bonded.pillars.find((p) => p.pillar === 3)!.available).toBe(200);
  });
});

describe('coverage follows who funded the bond', () => {
  it('never covers a cold file, whatever it scored', () => {
    for (const f of [[], [finding({ points: 10 })]]) {
      expect(score(f, SCORECARD_V1, 'cold').covered).toBe(false);
    }
  });

  it('covers a bonded file at clear and conditional only', () => {
    expect(score([], SCORECARD_V1, 'bonded').covered).toBe(true);
    // Drive it into refer territory.
    const heavy = [finding({ pillar: 2, code: 'CL-12', points: 200 }), finding({ pillar: 3, code: 'BX-02', points: 160 })];
    const refer = score(heavy, SCORECARD_V1, 'bonded');
    expect(refer.tier).not.toBe('clear');
    if (refer.tier === 'refer' || refer.tier === 'decline') expect(refer.covered).toBe(false);
  });
});

describe('hard gates', () => {
  const gates: Array<[string, Mode]> = [
    ['ID-01', 'cold'],
    ['ID-02', 'cold'],
    ['CL-11', 'cold'],
    ['BX-05', 'bonded'],
  ];

  it.each(gates)('%s declines regardless of an otherwise perfect file', (code, mode) => {
    const s = score([finding({ code, points: 0, gate: true })], SCORECARD_V1, mode);
    expect(s.tier).toBe('decline');
    expect(s.gatesFired).toContain(code);
    expect(s.covered).toBe(false);
  });

  it('BX-05 is the hard gate and BX-04 is not', () => {
    const soft = score([finding({ pillar: 3, code: 'BX-04', points: 8, gate: false })], SCORECARD_V1, 'bonded');
    expect(soft.tier).not.toBe('decline');
    expect(soft.gatesFired).toHaveLength(0);
  });
});

describe('reason codes that are evidence rather than verdicts', () => {
  it('never lets NW-02 alone decline a merchant', () => {
    // A fingerprint match large enough to sink the score, with nothing else.
    const s = score(
      [finding({ pillar: 4, code: 'NW-02', points: 45 }), finding({ pillar: 4, code: 'NW-01', points: 50 })],
      SCORECARD_V1,
      'cold',
    );
    expect(s.gatesFired).toHaveLength(0);
    expect(s.tier).not.toBe('decline');
  });

  it('lets NW-02 decline once another pillar corroborates', () => {
    const s = score(
      [
        finding({ pillar: 4, code: 'NW-02', points: 45 }),
        finding({ pillar: 1, code: 'ID-07', points: 190 }),
        finding({ pillar: 2, code: 'CL-12', points: 250 }),
        finding({ pillar: 3, code: 'BX-02', points: 60 }),
        finding({ pillar: 5, code: 'TX-01', points: 150 }),
      ],
      SCORECARD_V1,
      'cold',
    );
    expect(s.tier).toBe('decline');
  });
});

describe('unresolved high-materiality contradictions', () => {
  it('routes a price contradiction to refer regardless of score', () => {
    const s = score([finding({ pillar: 2, code: 'CL-01', points: 60 })], SCORECARD_V1, 'bonded');
    expect(s.score).toBeGreaterThan(SCORECARD_V1.thresholds.conditional);
    expect(s.tier).toBe('refer');
    expect(s.materialityOverride).toBe(true);
    expect(s.covered).toBe(false);
  });

  it('leaves a low-materiality contradiction to the number', () => {
    const s = score([finding({ pillar: 2, code: 'CL-06', points: 24 })], SCORECARD_V1, 'bonded');
    expect(s.materialityOverride).toBe(false);
    expect(s.tier).toBe('clear');
  });
});

describe('purity, which is the replay guarantee', () => {
  const findings = [
    finding({ pillar: 1, code: 'ID-03', points: 45 }),
    finding({ pillar: 2, code: 'CL-02', points: 48 }),
    finding({ pillar: 5, code: 'TX-01', points: 55 }),
  ];

  it('returns an identical result across repeated calls', () => {
    const a = score(findings, SCORECARD_V1, 'cold');
    for (let i = 0; i < 25; i++) {
      expect(score(findings, SCORECARD_V1, 'cold')).toEqual(a);
    }
  });

  it('does not depend on finding order', () => {
    const a = score(findings, SCORECARD_V1, 'bonded');
    const b = score([...findings].reverse(), SCORECARD_V1, 'bonded');
    expect(b.score).toBe(a.score);
    expect(b.tier).toBe(a.tier);
  });

  it('does not mutate its inputs', () => {
    const snapshot = JSON.stringify(findings);
    score(findings, SCORECARD_V1, 'cold');
    expect(JSON.stringify(findings)).toBe(snapshot);
  });
});

describe('pillar arithmetic', () => {
  it('floors a pillar at zero rather than letting it go negative', () => {
    const s = score([finding({ pillar: 1, code: 'ID-07', points: 9999 })], SCORECARD_V1, 'bonded');
    expect(s.pillars.find((p) => p.pillar === 1)!.earned).toBe(0);
    expect(s.score).toBe(750);
  });

  it('treats Pillar 6 as a modifier on the total rather than a scored pillar', () => {
    const s = score([finding({ pillar: 6, code: 'MN-04', points: 60 })], SCORECARD_V1, 'bonded');
    expect(s.score).toBe(940);
    expect(s.pillars.map((p) => p.pillar)).toEqual([1, 2, 3, 4, 5]);
  });
});
