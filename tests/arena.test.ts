/**
 * Arena tests: the render filter and the submission window.
 *
 * The audit flagged arena coverage as thin. The filter is a rendering control
 * (not the injection defense) and the window is a safety gate that must fail
 * closed. Both are pure and pinned here.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { filterSubmission, filterHandle } from '../src/arena/filter';
import { windowState } from '../src/arena/ratelimit';

describe('filterSubmission', () => {
  it('HTML-escapes angle brackets, ampersands and quotes', () => {
    const r = filterSubmission('a < b & c "d"');
    expect(r.clean).toBe(true);
    expect(r.rendered).toBe('a &lt; b &amp; c &quot;d&quot;');
  });

  it('neutralizes a script tag rather than executing or deleting it', () => {
    const r = filterSubmission('hi <script>steal()</script> bye');
    expect(r.clean).toBe(true);
    expect(r.rendered.toLowerCase()).not.toContain('<script>');
    expect(r.reasons.join(' ')).toMatch(/neutralized script tag/i);
  });

  it('rejects abusive content with an empty render', () => {
    const r = filterSubmission('kill yourself');
    expect(r.clean).toBe(false);
    expect(r.rendered).toBe('');
  });

  it('truncates past the max-chars limit', () => {
    const prior = process.env.CLEARHOUSE_ARENA_MAX_CHARS;
    process.env.CLEARHOUSE_ARENA_MAX_CHARS = '10';
    try {
      const r = filterSubmission('x'.repeat(50));
      expect(r.reasons.some((s) => /Truncated/.test(s))).toBe(true);
      expect(r.rendered.length).toBeLessThanOrEqual(10);
    } finally {
      if (prior === undefined) delete process.env.CLEARHOUSE_ARENA_MAX_CHARS;
      else process.env.CLEARHOUSE_ARENA_MAX_CHARS = prior;
    }
  });
});

describe('filterHandle', () => {
  it('strips markup characters and caps length', () => {
    expect(filterHandle('<b>Evil</b> Corp')).toBe('bEvilb Corp');
    expect(filterHandle('a'.repeat(60)).length).toBe(40);
  });

  it('falls back to anonymous for an empty handle', () => {
    expect(filterHandle('   ')).toBe('anonymous');
    expect(filterHandle('@@@')).toBe('anonymous');
  });
});

describe('windowState', () => {
  const OPENS = 'CLEARHOUSE_ARENA_OPENS_AT';
  const CLOSES = 'CLEARHOUSE_ARENA_CLOSES_AT';
  const prior = { opens: process.env[OPENS], closes: process.env[CLOSES] };
  afterEach(() => {
    for (const [k, v] of [[OPENS, prior.opens], [CLOSES, prior.closes]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('is closed (unscheduled) when unset', () => {
    delete process.env[OPENS];
    delete process.env[CLOSES];
    const s = windowState();
    expect(s.open).toBe(false);
    expect(s.phase).toBe('unscheduled');
  });

  it('FAILS CLOSED on a malformed window rather than defaulting open', () => {
    process.env[OPENS] = 'not-a-date';
    process.env[CLOSES] = 'also-bad';
    const s = windowState();
    expect(s.open).toBe(false);
    expect(s.phase).toBe('unscheduled');
  });

  it('opens only inside a valid window', () => {
    process.env[OPENS] = '2026-01-01T00:00:00Z';
    process.env[CLOSES] = '2026-01-01T02:00:00Z';
    expect(windowState(new Date('2026-01-01T01:00:00Z')).phase).toBe('open');
    expect(windowState(new Date('2025-12-31T23:00:00Z')).phase).toBe('before');
    expect(windowState(new Date('2026-01-01T03:00:00Z')).phase).toBe('archive');
  });
});
