/**
 * SSRF-guarded fetch for cold intake.
 *
 * Fetching an arbitrary caller-named URL is the classic SSRF sink: without
 * guards it can reach cloud metadata endpoints, loopback admin panels and
 * internal services. This module is the guard. It is only ever reached when
 * CLEARHOUSE_LIVE_FETCH is enabled (default off), and even then it refuses:
 *
 *   - any scheme other than http/https,
 *   - a host that is, or DNS-resolves to, a private / loopback / link-local /
 *     unique-local / carrier-grade-NAT / metadata address,
 *   - responses over a size cap, or that take longer than a timeout,
 *   - redirect chains, re-validating each hop against the same rules.
 *
 * DNS rebinding is closed at the socket layer: the actual connection uses a
 * guarded `lookup` that re-checks every resolved address AT CONNECT TIME and
 * refuses a private one, so a host that resolves public at check time and
 * private at connect time is still rejected. The connection is pinned to the
 * validated hostname (Host header + TLS SNI preserved).
 */

import { lookup } from 'node:dns/promises';
import { lookup as lookupCb, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function inV4(ip: number, cidr: string): boolean {
  const [net, bitsStr] = cidr.split('/');
  const base = ipv4ToInt(net)!;
  const bits = Number(bitsStr);
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

// Everything that must never be reachable from a caller-named URL.
const BLOCKED_V4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local, incl. 169.254.169.254 cloud metadata
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15', // benchmarking
  '240.0.0.0/4', // reserved
  '255.255.255.255/32',
];

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return n === null ? true : BLOCKED_V4.some((cidr) => inV4(n, cidr));
  }
  if (kind === 6) {
    const lower = ip.toLowerCase().split('%')[0]; // strip zone id
    if (lower === '::1' || lower === '::') return true;
    // IPv4-mapped (::ffff:a.b.c.d) -> validate the embedded v4.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // Unique-local fc00::/7 and link-local fe80::/10.
    if (/^f[cd]/.test(lower)) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    return false;
  }
  // Not a parseable IP literal — caller must resolve first.
  return true;
}

/** Validate a URL is safe to fetch. Throws UnsafeUrlError otherwise. */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Not a valid absolute URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Only http(s) is allowed, not ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError(`Refusing a private/reserved IP: ${host}`);
    return url;
  }

  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`Host does not resolve: ${host}`);
  }
  if (addrs.length === 0) throw new UnsafeUrlError(`Host does not resolve: ${host}`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new UnsafeUrlError(`Host ${host} resolves to a private/reserved address (${a.address})`);
    }
  }
  return url;
}

export interface FetchResult {
  finalUrl: string;
  status: number;
  html: string;
  truncated: boolean;
}

/**
 * A DNS lookup that refuses to hand a socket a private address. Passed as the
 * `lookup` option to http(s).request, so the check happens at CONNECT time
 * against the address actually being dialed — this is what closes DNS rebinding,
 * where the pre-flight check and the connection would otherwise resolve
 * separately.
 */
function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number; hints?: number },
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  lookupCb(hostname, options, (err, address, family) => {
    if (err) return callback(err, address as unknown as string, family);
    if (Array.isArray(address)) {
      const safe = address.filter((a) => !isPrivateIp(a.address));
      if (safe.length === 0) {
        return callback(new UnsafeUrlError(`${hostname} resolves only to private/reserved addresses`), [], undefined);
      }
      return callback(null, safe, undefined);
    }
    if (isPrivateIp(address as string)) {
      return callback(new UnsafeUrlError(`${hostname} resolved to a private/reserved address (${address})`), '', 0);
    }
    return callback(null, address as string, family);
  });
}

interface OneShot {
  status: number;
  location?: string;
  html: string;
  truncated: boolean;
}

function requestOnce(url: URL, maxBytes: number, timeoutMs: number): Promise<OneShot> {
  return new Promise<OneShot>((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        // Pin the connection target to a validated address at connect time.
        lookup: guardedLookup as unknown as typeof lookupCb,
        servername: url.protocol === 'https:' ? url.hostname : undefined,
        headers: {
          'user-agent': 'ClearhouseBot/0.1 (+cold-intake)',
          accept: 'text/html,*/*',
          host: url.host,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume(); // drain
          return resolve({ status, location, html: '', truncated: false });
        }
        let received = 0;
        let truncated = false;
        let settled = false;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          if (settled) return;
          received += c.length;
          if (received > maxBytes) {
            chunks.push(c.subarray(0, Math.max(0, maxBytes - (received - c.length))));
            truncated = true;
            settled = true;
            req.destroy();
            resolve({ status, html: Buffer.concat(chunks).toString('utf8'), truncated });
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({ status, html: Buffer.concat(chunks).toString('utf8'), truncated });
        });
        res.on('error', (e) => {
          if (!settled) reject(e);
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new UnsafeUrlError('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** Fetch a page under SSRF, size and time guards, re-validating each redirect. */
export async function safeFetch(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<FetchResult> {
  const maxBytes = opts.maxBytes ?? 512_000;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const maxRedirects = opts.maxRedirects ?? 3;

  // Pre-flight scheme + literal-IP + resolve check. Belt to the socket-layer
  // suspenders below; the guardedLookup is what actually enforces at connect.
  let current = await assertPublicUrl(rawUrl);
  let redirects = 0;

  for (;;) {
    const res = await requestOnce(current, maxBytes, timeoutMs);
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (++redirects > maxRedirects) throw new UnsafeUrlError('Too many redirects');
      current = await assertPublicUrl(new URL(res.location, current).toString());
      continue;
    }
    return { finalUrl: current.toString(), status: res.status, html: res.html, truncated: res.truncated };
  }
}
