/**
 * The four ports.
 *
 * A module may import from `src/contracts/`, `config/`, and itself. Any other
 * cross-module dependency goes through a port declared here and is injected,
 * never imported directly. This is what makes the modules ownable in parallel:
 * Hacker 2 writes personas against `MerchantSurface` without opening
 * `src/engine/`, and Hacker 3 renders `BoardCell` objects without knowing what
 * a pillar is.
 *
 * `npm run lint:boundaries` fails the build on a violating import, so the rule
 * is checked rather than merely stated. ARCHITECTURE.md section 1.
 */

import type { NewEvent, StoredEvent, EventType } from './events';
import type { Finding, MerchantSurface } from './types';

export type { MerchantSurface };

// ---------------------------------------------------------------------------
// Event store
// ---------------------------------------------------------------------------

export interface CachedModelCall {
  model: string;
  response: unknown;
  latencyMs: number;
  createdAt: string;
}

export interface EventStore {
  /** Idempotent on `eventId`, so a retried append is not a duplicate event. */
  append(events: NewEvent[]): Promise<StoredEvent[]>;
  read(streamId: string, sinceSeq?: number): Promise<StoredEvent[]>;
  readByType(type: EventType, sinceSeq?: number): Promise<StoredEvent[]>;
  readAll(sinceSeq?: number, limit?: number): Promise<StoredEvent[]>;
  /** The model cache is a pure memo table, not an event. Safe to truncate. */
  cacheGet(hash: string): Promise<CachedModelCall | null>;
  cachePut(hash: string, call: CachedModelCall): Promise<void>;
  migrate(): Promise<void>;
  close(): Promise<void>;
  readonly kind: 'postgres' | 'file';
}

// ---------------------------------------------------------------------------
// Model client
// ---------------------------------------------------------------------------

export interface JudgeRequest<T> {
  /** Which check is asking. Part of the cache key and the finding provenance. */
  checkId: string;
  promptVersion: string;
  system: string;
  /** Trusted instruction text authored by us. */
  instruction: string;
  /**
   * Merchant or submission content. Wrapped in a delimited untrusted envelope
   * by the client, never concatenated into the instruction. F21 is the attack
   * this answers. PLATFORM.md section 3, "Arena safety".
   */
  untrusted: Record<string, string>;
  /** Findings come back through a constrained schema, so a successful injection
   *  produces a validation failure rather than an executed instruction. */
  schema: unknown;
  maxTokens?: number;
  tier?: 'checks' | 'adjudication';
}

export interface Judged<T> {
  value: T;
  latencyMs: number;
  served: 'live' | 'cache';
  model: string;
  hash: string;
}

export interface ModelClient {
  judge<T>(req: JudgeRequest<T>): Promise<Judged<T>>;
  readonly available: boolean;
}

// ---------------------------------------------------------------------------
// Clock, injected so replay and tests are deterministic
// ---------------------------------------------------------------------------

export interface Clock {
  now(): Date;
  iso(): string;
}

// ---------------------------------------------------------------------------
// Check interface: every check, LLM-backed or deterministic, looks like this
// ---------------------------------------------------------------------------

export interface CheckContext {
  merchant: MerchantSurface;
  model: ModelClient;
  clock: Clock;
  /** Canary strings drawn from the rotating pool in environment config. */
  canaries: { bx04: string; bx05: string };
  /** Reserved questions, never used during initial underwriting. */
  holdout: Array<{ id: string; claim: string; text: string }>;
  amountMinor: number;
  currency: string;
  purpose: string;
  /** Emit a finding the moment it is known, so the board fills as it goes. */
  emit(finding: Finding): void;
}

/**
 * Uniform check interface. New pillar capabilities are new checks conforming to
 * this, registered in the manifest. PLATFORM.md section 1.
 */
export interface Check {
  id: string;
  pillar: 1 | 2 | 3 | 4 | 5 | 6;
  /** Which modes this check runs in. Cold-only checks never see bonded evidence. */
  modes: Array<'cold' | 'bonded'>;
  /** Deterministic checks resolve first and instantly, so the board fills fast. */
  deterministic: boolean;
  run(ctx: CheckContext): Promise<Finding[]>;
}
