/**
 * Rate limiting and the arena window.
 *
 * The arena is an open text input from an adversarial room into an LLM and onto
 * a projector. It accepts submissions during the window only and becomes a
 * read-only archive afterwards, so an unauthenticated endpoint calling a paid
 * API is not left standing open on the indexed internet, and every attempt with
 * its verdict stays visible for anyone reviewing the project later.
 *
 * PLATFORM.md section 3, "Arena safety".
 */

import { createHash } from 'node:crypto';

export interface RateResult {
  allowed: boolean;
  reason: string;
  remaining: number;
}

/**
 * Per-instance counters.
 *
 * Deliberately in memory rather than in the event store: this is a cheap abuse
 * brake in front of a paid API, and on serverless it costs nothing and resets
 * on cold start. The durable record of every attempt is the append-only log,
 * which is where the archive comes from. Anything stronger belongs behind a
 * real gateway, and saying so is more honest than implying this is one.
 */
const buckets = new Map<string, { count: number; windowStart: number }>();

export function clientHash(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const ip = fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ua = req.headers.get('user-agent') ?? '';
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 16);
}

export async function checkRateLimit(req: Request, scope: string): Promise<RateResult> {
  const perHour = Number(process.env.CLEARHOUSE_ARENA_RATE_LIMIT_PER_HOUR ?? 5);
  const key = `${scope}:${clientHash(req)}`;
  const now = Date.now();
  const hour = 3_600_000;

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > hour) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, reason: '', remaining: perHour - 1 };
  }

  if (bucket.count >= perHour) {
    const waitMin = Math.ceil((hour - (now - bucket.windowStart)) / 60_000);
    return {
      allowed: false,
      reason: `${perHour} requests per hour per client. Try again in about ${waitMin} minute(s).`,
      remaining: 0,
    };
  }

  bucket.count++;
  return { allowed: true, reason: '', remaining: perHour - bucket.count };
}

export interface WindowState {
  open: boolean;
  opensAt: string | null;
  closesAt: string | null;
  phase: 'before' | 'open' | 'archive' | 'unscheduled';
  message: string;
}

/**
 * The arena accepts submissions during the 8 to 9 PM window only, then becomes
 * a read-only archive. The deployed URL stays live and public, and every
 * attempt with its verdict stays visible afterwards, which is a better artifact
 * for a judge reviewing later than a dead form.
 */
export function windowState(now = new Date()): WindowState {
  const opensRaw = process.env.CLEARHOUSE_ARENA_OPENS_AT;
  const closesRaw = process.env.CLEARHOUSE_ARENA_CLOSES_AT;

  if (!opensRaw || !closesRaw) {
    return {
      open: false,
      opensAt: null,
      closesAt: null,
      phase: 'unscheduled',
      message:
        'The arena window is not configured in this deployment, so submissions are closed. The archive below stays readable.',
    };
  }

  const opens = new Date(opensRaw);
  const closes = new Date(closesRaw);
  const t = now.getTime();

  // Fail closed on a malformed window. `new Date('garbage').getTime()` is NaN,
  // and every comparison against NaN is false, which would otherwise fall
  // through to `open: true` and leave an unauthenticated, paid-API endpoint
  // wide open. A window we cannot parse is a closed window.
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) {
    return {
      open: false,
      opensAt: null,
      closesAt: null,
      phase: 'unscheduled',
      message:
        'The arena window is misconfigured in this deployment, so submissions are closed. The archive below stays readable.',
    };
  }

  if (t < opens.getTime()) {
    return {
      open: false,
      opensAt: opens.toISOString(),
      closesAt: closes.toISOString(),
      phase: 'before',
      message: `The arena opens at ${opens.toISOString()}. Until then this page is read only.`,
    };
  }
  if (t > closes.getTime()) {
    return {
      open: false,
      opensAt: opens.toISOString(),
      closesAt: closes.toISOString(),
      phase: 'archive',
      message:
        'The arena is closed and this is now a read-only archive. Every attempt and its verdict stays visible, which is a better artifact than a dead form. Leaving an unauthenticated endpoint that calls a paid API open on the indexed internet is not something we were going to do.',
    };
  }
  return {
    open: true,
    opensAt: opens.toISOString(),
    closesAt: closes.toISOString(),
    phase: 'open',
    message: 'The arena is open. Write a merchant that lies and try to get Clearhouse to buy.',
  };
}
