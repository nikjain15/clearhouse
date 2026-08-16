/**
 * The eval gate, as a CI-shaped pass/fail.
 *
 * `npm run eval` derives the bands and writes the report. This is the gate that
 * ARCHITECTURE.md section (Improvement) promises: it runs the eval and exits
 * non-zero if ANY attack class falls below its recall floor, so a version that
 * trades away a fraud class for a better average cannot ship.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { runEval } from '../src/evalh/harness';

loadEnv({ path: '.env.local', override: true });

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

async function main() {
  console.log(C.bold('\nClearhouse eval gate\n'));
  const report = await runEval({ concurrency: 6 });

  for (const c of report.perClass) {
    const mark = c.passes ? C.green('pass') : C.red('FAIL');
    console.log(
      `  ${c.taxonomy}  resolved ${(c.resolvedRate * 100).toFixed(0)}%  floor ${(c.floor * 100).toFixed(0)}%  ${mark}`,
    );
  }

  const failing = report.perClass.filter((c) => !c.passes);
  if (failing.length > 0) {
    console.log(C.red(`\n  Gate FAILS on ${failing.map((f) => f.taxonomy).join(', ')}. The version does not ship.\n`));
    process.exit(1);
  }
  console.log(C.green(`\n  Gate passes on every one of ${report.perClass.length} classes.\n`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
