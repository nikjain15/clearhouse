/**
 * Warm the model cache.
 *
 * Runs the gauntlet and the eval once. With a live ANTHROPIC_API_KEY, every
 * cache miss is resolved and stored, so a later demo run is entirely cache-served
 * and network-free. With no key, this is a no-op that simply confirms the
 * existing cache already covers every scripted persona (any miss throws).
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { runGauntlet } from '../src/runtime/gauntlet';
import { runEval } from '../src/evalh/harness';
import { getRuntime } from '../src/runtime/context';

loadEnv({ path: '.env.local', override: true });

async function main() {
  const rt = getRuntime();
  console.log(`Warming cache  (model=${rt.model.available ? 'live' : 'cache only'})`);

  const cells = await runGauntlet({ concurrency: 4 });
  console.log(`  gauntlet: ${cells.length} cells scored`);

  const report = await runEval({ concurrency: 6 });
  console.log(`  eval: ${report.rows.length} merchants scored`);

  console.log(
    rt.model.available
      ? '  Cache misses were resolved live and stored; the demo path is now warm.'
      : '  Cache-only mode: this confirmed every scripted persona resolves from cache.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
