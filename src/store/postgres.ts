/**
 * Postgres event store. The production path.
 *
 * One append-only table, every projection rebuilt from it. Append is
 * idempotent on `event_id`, so a retried write after a serverless timeout is
 * not a duplicate event.
 */

import { Pool } from 'pg';
import type { EventType, NewEvent, StoredEvent } from '../contracts/events';
import type { CachedModelCall, EventStore } from '../contracts/ports';
import { SCHEMA_SQL } from './index';

function toStored(r: Record<string, unknown>): StoredEvent {
  return {
    seq: Number(r.seq),
    eventId: String(r.event_id),
    ts: (r.ts as Date).toISOString(),
    type: r.type as EventType,
    streamId: String(r.stream_id),
    payload: r.payload,
    versions: (r.versions ?? {}) as StoredEvent['versions'],
  };
}

export class PostgresEventStore implements EventStore {
  readonly kind = 'postgres' as const;
  private pool: Pool;
  private migrated = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    });
  }

  async migrate(): Promise<void> {
    if (this.migrated) return;
    await this.pool.query(SCHEMA_SQL);
    this.migrated = true;
  }

  async append(events: NewEvent[]): Promise<StoredEvent[]> {
    if (events.length === 0) return [];
    await this.migrate();

    // One statement, so a batch of findings is one round trip rather than N.
    const cols: unknown[] = [];
    const tuples = events.map((e, i) => {
      const b = i * 5;
      cols.push(e.eventId, e.type, e.streamId, JSON.stringify(e.payload), JSON.stringify(e.versions ?? {}));
      return `($${b + 1}::uuid, $${b + 2}, $${b + 3}, $${b + 4}::jsonb, $${b + 5}::jsonb)`;
    });

    const { rows } = await this.pool.query(
      `insert into events (event_id, type, stream_id, payload, versions)
       values ${tuples.join(', ')}
       on conflict (event_id) do nothing
       returning seq, event_id, ts, type, stream_id, payload, versions`,
      cols,
    );
    return rows.map(toStored);
  }

  async read(streamId: string, sinceSeq = 0): Promise<StoredEvent[]> {
    await this.migrate();
    const { rows } = await this.pool.query(
      `select seq, event_id, ts, type, stream_id, payload, versions
         from events where stream_id = $1 and seq > $2 order by seq`,
      [streamId, sinceSeq],
    );
    return rows.map(toStored);
  }

  async readByType(type: EventType, sinceSeq = 0): Promise<StoredEvent[]> {
    await this.migrate();
    const { rows } = await this.pool.query(
      `select seq, event_id, ts, type, stream_id, payload, versions
         from events where type = $1 and seq > $2 order by seq`,
      [type, sinceSeq],
    );
    return rows.map(toStored);
  }

  async readAll(sinceSeq = 0, limit = 10_000): Promise<StoredEvent[]> {
    await this.migrate();
    const { rows } = await this.pool.query(
      `select seq, event_id, ts, type, stream_id, payload, versions
         from events where seq > $1 order by seq limit $2`,
      [sinceSeq, limit],
    );
    return rows.map(toStored);
  }

  async cacheGet(hash: string): Promise<CachedModelCall | null> {
    await this.migrate();
    const { rows } = await this.pool.query(
      `select model, response, latency_ms, created_at from model_cache where hash = $1`,
      [hash],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      model: r.model,
      response: r.response,
      latencyMs: r.latency_ms ?? 0,
      createdAt: (r.created_at as Date).toISOString(),
    };
  }

  async cachePut(hash: string, call: CachedModelCall): Promise<void> {
    await this.migrate();
    await this.pool.query(
      `insert into model_cache (hash, model, response, latency_ms)
       values ($1, $2, $3::jsonb, $4)
       on conflict (hash) do nothing`,
      [hash, call.model, JSON.stringify(call.response), call.latencyMs],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
