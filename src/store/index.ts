/**
 * Event store selection.
 *
 * Postgres is the event store (PLATFORM.md section 1, "Runtime shape"), not
 * process memory: serverless functions have no memory to keep it in, and the
 * registry, the eval gate and replay all depend on the log surviving a cold
 * start.
 *
 * The file-backed adapter exists so the repository runs with no credentials.
 * It is explicitly not a production path: on Vercel the filesystem does not
 * survive between invocations. The same conformance suite runs against both.
 */

import type { EventStore } from '../contracts/ports';
import { FileEventStore } from './file';
import { PostgresEventStore } from './postgres';

let singleton: EventStore | null = null;

export function createStore(): EventStore {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url && url.startsWith('postgres')) return new PostgresEventStore(url);
  return new FileEventStore(process.env.CLEARHOUSE_DATA_DIR || 'data');
}

/** Process-wide store. Safe on serverless: each instance opens its own pool. */
export function getStore(): EventStore {
  if (!singleton) singleton = createStore();
  return singleton;
}

export { FileEventStore, PostgresEventStore };
export const SCHEMA_SQL = `
create table if not exists events (
  seq        bigserial primary key,
  event_id   uuid        not null unique,
  ts         timestamptz not null default now(),
  type       text        not null,
  stream_id  text        not null,
  payload    jsonb       not null,
  versions   jsonb       not null default '{}'::jsonb
);
create index if not exists events_stream_idx on events (stream_id, seq);
create index if not exists events_type_idx   on events (type, seq);

create table if not exists model_cache (
  hash       text primary key,
  model      text        not null,
  response   jsonb       not null,
  latency_ms integer,
  created_at timestamptz not null default now()
);
`;
