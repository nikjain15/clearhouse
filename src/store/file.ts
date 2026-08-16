/**
 * File-backed event store. Local development only.
 *
 * Exists so `git clone && npm install && npm run dev` works with no
 * credentials. On Vercel the filesystem does not survive between function
 * invocations, so this is not a production path and `getStore()` picks
 * Postgres whenever DATABASE_URL is present.
 *
 * Implements the identical EventStore interface, and the same conformance
 * suite runs against both adapters.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EventType, NewEvent, StoredEvent } from '../contracts/events';
import type { CachedModelCall, EventStore } from '../contracts/ports';

export class FileEventStore implements EventStore {
  readonly kind = 'file' as const;
  private eventsPath: string;
  private cachePath: string;
  private events: StoredEvent[] | null = null;
  private cache: Map<string, CachedModelCall> | null = null;
  private seenIds = new Set<string>();
  private loadedAt = -1;

  constructor(private dir: string) {
    this.eventsPath = join(dir, 'events.jsonl');
    this.cachePath = join(dir, 'model-cache.json');
  }

  async migrate(): Promise<void> {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    if (!existsSync(this.eventsPath)) writeFileSync(this.eventsPath, '');
    if (!existsSync(this.cachePath)) writeFileSync(this.cachePath, '{}');
  }

  /**
   * Re-read when the file changed underneath us.
   *
   * Without this, a dev server holds its first read forever and never sees
   * events written by `npm run loop` in another terminal. That is exactly the
   * shape of a live demo, so it is worth the stat() call. Postgres does not
   * have the problem, which is one more reason it is the production path.
   */
  private load(): StoredEvent[] {
    this.migrate();
    const mtime = statSync(this.eventsPath).mtimeMs;
    if (this.events && mtime === this.loadedAt) return this.events;
    this.loadedAt = mtime;
    this.seenIds.clear();
    const raw = readFileSync(this.eventsPath, 'utf8');
    this.events = raw
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as StoredEvent);
    for (const e of this.events) this.seenIds.add(e.eventId);
    return this.events;
  }

  private loadCache(): Map<string, CachedModelCall> {
    if (this.cache) return this.cache;
    this.migrate();
    const raw = JSON.parse(readFileSync(this.cachePath, 'utf8')) as Record<string, CachedModelCall>;
    this.cache = new Map(Object.entries(raw));
    return this.cache;
  }

  async append(events: NewEvent[]): Promise<StoredEvent[]> {
    const all = this.load();
    const written: StoredEvent[] = [];
    let lines = '';
    for (const e of events) {
      if (this.seenIds.has(e.eventId)) continue; // idempotent on eventId
      const stored: StoredEvent = {
        ...e,
        seq: all.length + written.length + 1,
        ts: new Date().toISOString(),
      };
      written.push(stored);
      this.seenIds.add(e.eventId);
      lines += JSON.stringify(stored) + '\n';
    }
    if (lines) {
      appendFileSync(this.eventsPath, lines);
      all.push(...written);
      this.loadedAt = statSync(this.eventsPath).mtimeMs;
    }
    return written;
  }

  async read(streamId: string, sinceSeq = 0): Promise<StoredEvent[]> {
    return this.load().filter((e) => e.streamId === streamId && e.seq > sinceSeq);
  }

  async readByType(type: EventType, sinceSeq = 0): Promise<StoredEvent[]> {
    return this.load().filter((e) => e.type === type && e.seq > sinceSeq);
  }

  async readAll(sinceSeq = 0, limit = 10_000): Promise<StoredEvent[]> {
    return this.load()
      .filter((e) => e.seq > sinceSeq)
      .slice(0, limit);
  }

  async cacheGet(hash: string): Promise<CachedModelCall | null> {
    return this.loadCache().get(hash) ?? null;
  }

  async cachePut(hash: string, call: CachedModelCall): Promise<void> {
    const c = this.loadCache();
    if (c.has(hash)) return;
    c.set(hash, call);
    writeFileSync(this.cachePath, JSON.stringify(Object.fromEntries(c), null, 0));
  }

  async close(): Promise<void> {
    /* nothing to close */
  }
}
