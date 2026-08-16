/**
 * Run the full gauntlet to the terminal, and optionally write the committed
 * hero run that the landing page and the degradation ladder depend on.
 *
 *   npm run gauntlet
 *   npm run gauntlet -- --write-hero
 *   npm run gauntlet -- --only M-F04-northgate
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { attacksOnUs, runGauntlet, type CellResult } from '../src/runtime/gauntlet';
import { getRuntime } from '../src/runtime/context';
import type { HeroRun } from '../src/board/heroRun';
import { Ledger } from '../src/ledger/ledger';
import { FulfillmentOracle } from '../src/ledger/fulfillment';
import { settle } from '../src/ledger/settlement';
import { PRICING_V1 } from '../src/engine/pricing';

loadEnv({ path: '.env.local', override: true });

const args = process.argv.slice(2);
const writeHero = args.includes('--write-hero');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--')) : undefined;

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  purple: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

const OUTCOME = {
  caught: C.green('caught'),
  escalated: C.blue('escalated'),
  paid_out: C.purple('paid out'),
  cleared: C.green('cleared'),
  pending: C.dim('pending'),
  error: C.red('error'),
};

async function main() {
  const rt = getRuntime();
  console.log(C.bold('\nClearhouse gauntlet'));
  console.log(
    C.dim(
      `store=${rt.store.kind}  model=${rt.model.available ? 'live' : 'cache only'}  target=${rt.latencyTargetMs}ms\n`,
    ),
  );

  const started = Date.now();
  const results = await runGauntlet({
    only,
    concurrency: 4,
    onStart: (p) => console.log(C.dim(`  start  ${p.taxonomy[0] ?? '   '}  ${p.display.name}`)),
    onCell: (r) => {
      const c = r.cell;
      const mode = c.mode === 'bonded' ? C.purple('bonded') : C.dim('cold  ');
      console.log(
        `  ${C.bold((c.taxonomy || '--').padEnd(4))} ${mode} ${String(c.score ?? '---').padStart(4)}  ${
          OUTCOME[c.outcome]
        }  ${C.dim(`P${c.catchingPillar ?? '-'}`)}  ${c.title}`,
      );
      for (const reason of c.topReasons.slice(0, 2)) {
        console.log(C.dim(`         ${reason.code}  ${reason.text.slice(0, 92)}`));
      }
    },
  });

  const wall = Date.now() - started;

  // -------------------------------------------------------------------------
  // The board
  // -------------------------------------------------------------------------
  console.log(C.bold('\n\nBoard\n'));
  const header = ['cell', 'mode', 'score', 'tier', 'outcome', 'pillar', 'ms', 'merchant'];
  console.log(C.dim(header.map((h, i) => h.padEnd([6, 8, 6, 12, 11, 7, 7, 30][i])).join('')));
  for (const r of results) {
    const c = r.cell;
    console.log(
      [
        (c.taxonomy || '--').padEnd(6),
        c.mode.padEnd(8),
        String(c.score ?? '---').padEnd(6),
        String(c.tier ?? '---').padEnd(12),
        c.outcome.padEnd(11),
        `P${c.catchingPillar ?? '-'}`.padEnd(7),
        String(c.latencyMs ?? '---').padEnd(7),
        c.title,
      ].join(''),
    );
  }

  // -------------------------------------------------------------------------
  // Latency against the written claim
  // -------------------------------------------------------------------------
  const latencies = results.map((r) => r.cell.latencyMs ?? 0).filter((l) => l > 0);
  const worst = Math.max(...latencies, 0);
  const median = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] ?? 0;
  console.log(
    `\n${C.dim('latency')}  median ${median}ms  worst ${worst}ms  target ${rt.latencyTargetMs}ms  ${
      worst <= rt.latencyTargetMs ? C.green('within target') : C.red('OVER TARGET')
    }`,
  );
  console.log(C.dim(`wall clock ${(wall / 1000).toFixed(1)}s at concurrency 4`));

  if (worst > rt.latencyTargetMs) {
    console.log(
      C.red(
        '\n  "runs in seconds" is a written claim. If this stays over target, change the target\n  AND the positioning sentence, per PLATFORM.md section 1.',
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Correctness against ground truth
  // -------------------------------------------------------------------------
  const frauds = results.filter((r) => r.persona.label === 'fraud');
  const honest = results.filter((r) => r.persona.label === 'honest');
  const fraudStopped = frauds.filter((r) => ['caught', 'escalated', 'paid_out'].includes(r.cell.outcome));
  const honestCleared = honest.filter((r) => ['cleared'].includes(r.cell.outcome));
  console.log(
    `\n${C.dim('outcome')}  ${fraudStopped.length}/${frauds.length} fraud cells not cleared silently, ${
      honestCleared.length
    }/${honest.length} honest merchants cleared`,
  );

  const errors = results.filter((r) => r.cell.outcome === 'error');
  if (errors.length > 0) {
    console.log(C.red(`\n${errors.length} cell(s) errored:`));
    for (const e of errors) console.log(C.red(`  ${e.persona.id}: ${e.cell.topReasons[0]?.text}`));
  }

  // -------------------------------------------------------------------------
  // The fund. Every cleared purchase settles, so the ledger is a consequence
  // of the run rather than a display beside it.
  // -------------------------------------------------------------------------
  const { ledger, payouts } = settleRun(results);
  const summary = ledger.summary();
  console.log(C.bold('\n\nGuarantee fund'), C.dim('(simulated)'));
  console.log(`  capital        ${fmtM(summary.fundCapitalMinor)}`);
  console.log(`  fees collected ${fmtM(summary.feesCollectedMinor)}`);
  console.log(`  collateral     ${fmtM(summary.collateralHeldMinor)}`);
  console.log(`  payouts        ${fmtM(summary.grossPayoutsMinor)} to buyers, ${payouts} claim(s)`);
  console.log(`  receivable     ${fmtM(summary.recoveryReceivableMinor)} owed by principals`);
  console.log(`  cash           ${fmtM(summary.fundCashMinor)}`);
  console.log(
    `  trial balance  debits ${summary.trialBalance.totalDebitsMinor} credits ${summary.trialBalance.totalCreditsMinor}  ${
      summary.trialBalance.balanced ? C.green('balanced') : C.red('OUT OF BALANCE')
    }`,
  );
  if (!summary.trialBalance.balanced) process.exit(1);

  // -------------------------------------------------------------------------
  // The committed hero run
  // -------------------------------------------------------------------------
  if (writeHero) {
    const hero = buildHero(results, ledger);
    writeFileSync(
      join(process.cwd(), 'config', 'runs', 'ledger.json'),
      JSON.stringify({ summary, postings: ledger.all(), generatedAt: new Date().toISOString() }, null, 2),
    );
    const path = join(process.cwd(), 'config', 'runs', 'hero.json');
    writeFileSync(path, JSON.stringify(hero, null, 2));
    console.log(C.green(`\nWrote ${path}`));
    console.log(
      C.dim(
        '  This is the floor of the degradation ladder: with no network, no database\n  and no API key, the board still renders from it.',
      ),
    );
  }

  console.log('');
  process.exit(errors.length > 0 ? 1 : 0);
}

function buildHero(results: CellResult[], ledger: Ledger): HeroRun {
  // The primed first-visitor scene is the spoofed storefront: it is the
  // documented incident, it resolves fast, and it is the one a stranger
  // understands without narration.
  const primedResult =
    results.find((r) => r.persona.id === 'M-F04-northgate') ?? results.find((r) => r.cell.narrated);

  let primed: HeroRun['primed'] = null;
  if (primedResult && primedResult.decision) {
    // Spread the findings across the real file latency in the order they landed.
    const n = primedResult.findings.length;
    const total = primedResult.cell.latencyMs ?? 0;
    primed = {
      merchantId: primedResult.persona.id,
      display: primedResult.persona.display.name,
      mode: primedResult.persona.mode,
      amountMinor: primedResult.decision.amountMinor,
      currency: primedResult.decision.currency,
      purpose: primedResult.persona.catalog[0].title,
      decision: primedResult.decision,
      timeline: primedResult.findings.map((finding, i) => ({
        atMs: Math.round(((i + 1) / Math.max(n, 1)) * total * 0.85),
        finding,
      })),
      totalLatencyMs: total,
    };
  }

  const injectionAttempts = results.reduce((s, r) => s + r.persona.content.length, 0);
  const nonCooperation = results.reduce(
    (s, r) => s + r.findings.filter((f) => f.code === 'BX-09').length,
    0,
  );
  const fingerprintOnlyDeclines = results.filter(
    (r) =>
      r.cell.tier === 'decline' &&
      r.findings.length > 0 &&
      r.findings.every((f) => f.pillar === 4 || Math.abs(f.points) === 0),
  ).length;

  return {
    runId: `RUN-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    generatedAt: new Date().toISOString(),
    scorecardVersion: results[0]?.decision?.versions.scorecard ?? 'scorecard-v1',
    checksVersion: results[0]?.decision?.versions.checks ?? 'checks-v1',
    pricingVersion: results[0]?.decision?.versions.pricing ?? 'pricing-v1',
    cells: results.map((r) => r.cell),
    attacksOnUs: attacksOnUs({
      oracleContradictions: results.filter((r) => r.cell.outcome === 'paid_out').length,
      payoutCapsApplied: ['per-buyer $2,000', 'per-merchant $5,000'],
      collusionChecked: results.filter((r) => r.cell.outcome === 'paid_out').length,
      injectionAttempts,
      malformedFindingsRejected: 0,
      promotionsPending: 0,
      fingerprintOnlyDeclines,
      nonCooperationFindings: nonCooperation,
    }),
    primed,
    ledger: (() => {
      const s = ledger.summary();
      return {
        fundCapitalMinor: s.fundCapitalMinor,
        feesCollectedMinor: s.feesCollectedMinor,
        collateralHeldMinor: s.collateralHeldMinor,
        payoutsMinor: s.grossPayoutsMinor,
        balanced: s.trialBalance.balanced,
      };
    })(),
  };
}

function fmtM(minor: number): string {
  return `$${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Settle every cell that cleared or was approved conditionally.
 *
 * The fund is a consequence of the run: fees collected, collateral posted, and
 * payouts made where the oracle found the commitment breached. All simulated,
 * and the arithmetic has to balance or the run fails.
 */
function settleRun(results: CellResult[]): { ledger: Ledger; payouts: number } {
  const ledger = new Ledger();
  ledger.capitalize(PRICING_V1.fund.statedCapitalMinor);
  const oracle = new FulfillmentOracle();
  let payouts = 0;
  const paidPerMerchant = new Map<string, number>();

  for (const r of results) {
    if (!r.decision) continue;
    const tier = r.decision.decision;
    if (tier === 'decline' || tier === 'refer') continue; // money never moved

    const p = r.persona;
    const covered = r.decision.covered;
    const collateralMinor =
      covered && tier === 'conditional'
        ? Math.round(r.decision.amountMinor * PRICING_V1.collateral.conditionalReserveRate)
        : 0;

    const settled = settle(
      {
        decision: r.decision,
        collateralMinor,
        deliveryDays: p.catalog[0].delivery_days,
        refundWindowDays: p.policies.refund_window_days,
        refundForm: p.policies.refund_form,
        warrantyText: p.policies.warranty_text,
        recurrence: p.policies.recurrence,
        quotes: [
          { term: 'total', channel: 'checkout' as const, text: `Total ${r.decision.amountMinor / 100}` },
          { term: 'delivery', channel: 'feed' as const, text: `${p.catalog[0].delivery_days} days` },
        ],
        buyerId: 'B-GAUNTLET',
        willShip: p.behaviors.will_ship,
        shipsAsDescribed: p.behaviors.ships_as_described,
      },
      ledger,
      oracle,
      { buyerId: 'B-GAUNTLET', priorClaims: 0, priorPayouts: 0, totalPurchases: 40 },
      { merchant: paidPerMerchant.get(p.id) ?? 0, buyer: 0 },
    );

    if (settled.paidOut) {
      payouts++;
      paidPerMerchant.set(p.id, (paidPerMerchant.get(p.id) ?? 0) + (settled.claim?.payoutMinor ?? 0));
    }
  }

  return { ledger, payouts };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
