/**
 * Apply the event-store schema.
 *
 * The file-backed adapter needs no migration (it creates its files on write).
 * Postgres does: this applies SCHEMA_SQL, which is idempotent (CREATE TABLE IF
 * NOT EXISTS). Run once against a fresh DATABASE_URL before the first deploy.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { getStore, PostgresEventStore } from '../src/store';

loadEnv({ path: '.env.local', override: true });

async function main() {
  const store = getStore();
  if (store.kind !== 'postgres') {
    console.log('Store is file-backed; no migration needed. Set DATABASE_URL to use Postgres.');
    return;
  }
  await (store as PostgresEventStore).migrate();
  console.log('Applied the event-store schema to Postgres.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
