/**
 * Cold intake: the SSRF guard and the default-off gating.
 *
 * The guard is the safety-critical piece — fetching a caller-named URL is an
 * SSRF sink — so it is tested directly. The feature is off by default, and these
 * tests pin that too: with the flag unset, nothing is fetched.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { isPrivateIp, assertPublicUrl, UnsafeUrlError } from '../src/merchants/fetch';
import { liveFetchEnabled, looksLikeUrl, coldIntakeFromUrl } from '../src/merchants/coldIntake';
import type { ModelClient } from '../src/contracts/ports';

const neverCalled: ModelClient = {
  available: false,
  judge: async () => {
    throw new Error('model must not be called when live fetch is off');
  },
};

describe('SSRF address guard', () => {
  it('blocks private, loopback, link-local and metadata addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.1',
      '172.16.5.5',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1', // v4-mapped loopback
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
});

describe('assertPublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl('ftp://example.com')).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('rejects a private IP literal without any DNS', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicUrl('http://127.0.0.1:8080/admin')).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('accepts a public IP literal', async () => {
    const url = await assertPublicUrl('https://1.1.1.1/');
    expect(url.hostname).toBe('1.1.1.1');
  });
});

describe('URL heuristic', () => {
  it('recognizes URLs and hostnames but not merchant names', () => {
    expect(looksLikeUrl('https://shop.example.com')).toBe(true);
    expect(looksLikeUrl('northgate-outlet.shop')).toBe(true);
    expect(looksLikeUrl('Ironwood Tool Works')).toBe(false);
  });
});

describe('default-off gating', () => {
  const prior = process.env.CLEARHOUSE_LIVE_FETCH;
  afterEach(() => {
    if (prior === undefined) delete process.env.CLEARHOUSE_LIVE_FETCH;
    else process.env.CLEARHOUSE_LIVE_FETCH = prior;
  });

  it('is disabled unless CLEARHOUSE_LIVE_FETCH=1', () => {
    delete process.env.CLEARHOUSE_LIVE_FETCH;
    expect(liveFetchEnabled()).toBe(false);
    process.env.CLEARHOUSE_LIVE_FETCH = '1';
    expect(liveFetchEnabled()).toBe(true);
  });

  it('fetches nothing and calls no model when disabled', async () => {
    delete process.env.CLEARHOUSE_LIVE_FETCH;
    const result = await coldIntakeFromUrl('https://example.com', neverCalled);
    expect(result).toBeNull();
  });
});
