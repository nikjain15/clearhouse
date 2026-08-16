/**
 * Run the eval, derive the tier bands, and write the precomputed report.
 *
 * The eval results page is precomputed (PLATFORM.md section 1), so this writes
 * `config/runs/eval.json` and the page renders it rather than running 70
 * underwriting files while a judge waits.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { runEval } from '../src/evalh/harness';
import { SCORECARD_V1 } from '../src/engine/scorecard';

loadEnv({ path: '.env.local', override: true });

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

async function main() {
  console.log(C.bold('\nClearhouse eval\n'));

  const report = await runEval({
    concurrency: 6,
    onRow: (row, done, total) => {
      if (done % 5 === 0 || done === total) {
        process.stdout.write(C.dim(`  ${done}/${total} scored\r`));
      }
    },
    onError: (id, msg) => console.log(C.red(`  error ${id}: ${msg}`)),
  });

  console.log(C.dim(`  ${report.rows.length} merchants scored          \n`));

  // -------------------------------------------------------------------------
  // The separation curve, which is what produced the bands
  // -------------------------------------------------------------------------
  console.log(C.bold('Separation'));
  console.log(C.dim('  band        honest  fraud'));
  for (const b of report.separation.buckets) {
    if (b.honest === 0 && b.fraud === 0) continue;
    const h = '#'.repeat(b.honest);
    const f = '#'.repeat(b.fraud);
    console.log(
      `  ${String(b.from).padStart(4)}-${String(b.to).padEnd(5)} ${C.green(h.padEnd(7))} ${C.red(f)}`,
    );
  }
  console.log(
    C.dim(
      `\n  highest fraud ${report.separation.highestFraudScore}   lowest honest ${report.separation.lowestHonestScore}   overlap ${report.separation.overlap.low} to ${report.separation.overlap.high} holding ${report.separation.overlap.count}`,
    ),
  );

  // -------------------------------------------------------------------------
  // Derived thresholds, replacing the placeholders
  // -------------------------------------------------------------------------
  console.log(C.bold('\n\nDerived thresholds'));
  const p = SCORECARD_V1.thresholds;
  const t = report.thresholds;
  console.log(`  clear        ${String(p.clear).padStart(4)} placeholder  ->  ${C.bold(String(t.clear).padStart(4))} derived`);
  console.log(`  conditional  ${String(p.conditional).padStart(4)} placeholder  ->  ${C.bold(String(t.conditional).padStart(4))} derived`);
  console.log(`  decline floor${String(p.refer).padStart(5)} placeholder  ->  ${C.bold(String(t.refer).padStart(4))} derived`);
  console.log(C.dim('\n  ' + t.justification.replace(/\. /g, '.\n  ')));

  // -------------------------------------------------------------------------
  // Confusion and escalation
  // -------------------------------------------------------------------------
  const c = report.confusion;
  console.log(C.bold('\n\nOutcome under derived bands'));
  console.log(`  fraud stopped      ${c.tp}/${c.tp + c.fn}`);
  console.log(`  fraud cleared      ${c.fn === 0 ? C.green('0') : C.red(String(c.fn))}`);
  console.log(`  honest cleared     ${c.tn}/${c.tn + c.fp}`);
  console.log(`  honest stopped     ${c.fp === 0 ? C.green('0') : C.amber(String(c.fp))}  ${C.dim('(false positives cost merchants real money)')}`);
  console.log(`  escalation rate    ${(report.escalationRate * 100).toFixed(1)}%`);

  // -------------------------------------------------------------------------
  // Per-class floors: the gate that actually matters
  // -------------------------------------------------------------------------
  console.log(C.bold('\n\nPer-class recall floors'));
  console.log(C.dim('  class  caught  recall  floor'));
  for (const cl of report.perClass) {
    const mark = cl.passes ? C.green('pass') : C.red('FAIL');
    console.log(
      `  ${cl.taxonomy.padEnd(7)}${String(cl.caught + '/' + cl.total).padEnd(8)}${(cl.recall * 100)
        .toFixed(0)
        .padStart(3)}%    ${(cl.floor * 100).toFixed(0)}%   ${mark}`,
    );
  }
  console.log(
    `\n  ${report.gatePasses ? C.green('Gate passes on every class.') : C.red('GATE FAILS. A version that fails any class does not ship.')}`,
  );
  console.log(
    C.dim(
      '  An aggregate gate would let a new version trade away an entire fraud\n  class for a better average, which is precisely the regression that matters.',
    ),
  );

  console.log(C.dim(`\n\n${report.caveat.replace(/\. /g, '.\n')}`));

  const out = join(process.cwd(), 'config', 'runs', 'eval.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(C.green(`\nWrote ${out}\n`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
