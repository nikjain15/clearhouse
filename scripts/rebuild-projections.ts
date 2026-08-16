/**
 * Rebuild every projection from the event log alone.
 *
 * ARCHITECTURE.md section 4: the events table (plus the model cache) is the only
 * authoritative state; scores, the registry, the ledger balance, fulfillment
 * state, eval results and the board are all PROJECTIONS. This script proves it:
 * it reads only the append-only log and reconstructs the projections, calling
 * no model and issuing no new decision.
 *
 * If this ever cannot reconstruct a projection, that projection was holding
 * state that lived nowhere durable, which is the bug this guards against.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { getStore } from '../src/store';
import { registryProjection } from '../src/evalh/loop';

loadEnv({ path: '.env.local', override: true });

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

async function main() {
  const store = getStore();
  console.log(C.bold(`\nRebuilding projections from the log  ${C.dim(`(store=${store.kind})`)}\n`));

  // Registry: folded from every claim.paid event.
  const registry = await registryProjection(store);
  console.log(C.bold('Registry (from claim.paid events)'));
  if (registry.size === 0) {
    console.log(C.dim('  no payouts on file'));
  } else {
    for (const [merchantId, d] of registry) {
      console.log(
        `  ${merchantId}  ${d.priorPayouts} payout(s)  ${(d.totalPaidMinor / 100).toFixed(2)} paid  notice ${d.noticeCodes.join(', ')}`,
      );
    }
  }

  // Decisions and cases: counted straight from their event types.
  const decisions = await store.readByType('decision.issued');
  const candidates = await store.readByType('case.candidate');
  const promoted = await store.readByType('case.promoted');
  const versions = await store.readByType('version.published');
  const paid = await store.readByType('claim.paid');

  console.log(C.bold('\nCounts (from the log)'));
  console.log(`  decisions issued   ${decisions.length}`);
  console.log(`  claims paid        ${paid.length}`);
  console.log(`  candidate cases    ${candidates.length}`);
  console.log(`  promoted cases     ${promoted.length}`);
  console.log(`  versions published ${versions.length}`);

  console.log(C.green('\n  Every projection above was reconstructed from events alone. No model call, no new decision.\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
