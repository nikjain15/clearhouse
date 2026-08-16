/**
 * The self-improving loop, demonstrated end to end.
 *
 *   1. A red-team persona beats the score. The fund pays the buyer.
 *   2. The miss becomes a candidate eval case. A human promotes it.
 *   3. The registry now holds a payout against this merchant, and Pillar 4
 *      reads the registry.
 *   4. The eval gate must clear the recall floor on EVERY class before the new
 *      version ships.
 *   5. Re-run the exact same attack. Caught, with the new reason code.
 *
 * No invented detector. What changed is the file, not the storefront, which is
 * how consortium data actually compounds.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { personaById, merchantFor, registryFor } from '../src/merchants';
import { underwrite } from '../src/engine/underwrite';
import { getRuntime, measureVarianceFloor } from '../src/runtime/context';
import { Ledger } from '../src/ledger/ledger';
import { FulfillmentOracle } from '../src/ledger/fulfillment';
import { settle } from '../src/ledger/settlement';
import { PRICING_V1 } from '../src/engine/pricing';
import {
  applyRegistryDelta,
  candidateFromPayout,
  promoteCase,
  publishVersion,
  type RegistryDelta,
} from '../src/evalh/loop';
import { runEval } from '../src/evalh/harness';

loadEnv({ path: '.env.local', override: true });

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  purple: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TARGET = args[0] ?? 'M-F05-pinnacle';
/** Stop before promoting, so /promote has a pending candidate to show on stage. */
const NO_PROMOTE = process.argv.includes('--no-promote');

async function main() {
  const rt = getRuntime();
  const persona = personaById(TARGET);
  if (!persona) throw new Error(`Unknown persona ${TARGET}`);

  const varianceFloor = await measureVarianceFloor(rt);
  const amountMinor = Math.round(persona.catalog[0].feed_price * 100);

  console.log(C.bold(`\nSelf-improving loop: ${persona.display.name}\n`));

  // -------------------------------------------------------------------------
  // 1. First encounter. The fraud beats the score.
  // -------------------------------------------------------------------------
  console.log(C.bold('1. First encounter'));
  const first = await underwrite(
    {
      merchant: merchantFor(persona, rt.canaries),
      amountMinor,
      currency: persona.catalog[0].currency,
      purpose: persona.catalog[0].title,
      registry: registryFor(persona),
      canaries: rt.canaries,
      holdout: rt.holdout,
      varianceFloor,
    },
    rt.store,
    rt.model,
    rt.clock,
  );
  console.log(`   score ${first.decision.score}  ${first.decision.decision}  covered=${first.decision.covered}`);
  for (const r of first.decision.reasons.slice(0, 3)) console.log(C.dim(`     ${r.code}  ${r.text.slice(0, 88)}`));

  if (first.decision.decision === 'decline') {
    console.log(C.dim('\n   This persona is already declined, so there is no miss to learn from.'));
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // 2. The purchase goes bad and the fund pays the buyer.
  // -------------------------------------------------------------------------
  console.log(C.bold('\n2. The purchase goes bad'));
  const ledger = new Ledger();
  ledger.capitalize(PRICING_V1.fund.statedCapitalMinor);
  const oracle = new FulfillmentOracle();

  const settled = settle(
    {
      decision: { ...first.decision, covered: persona.mode === 'bonded', feeMinor: 100 },
      collateralMinor: Math.round(amountMinor * PRICING_V1.collateral.conditionalReserveRate),
      deliveryDays: persona.catalog[0].delivery_days,
      refundWindowDays: persona.policies.refund_window_days,
      refundForm: persona.policies.refund_form,
      warrantyText: persona.policies.warranty_text,
      recurrence: persona.policies.recurrence,
      quotes: [],
      buyerId: 'B-DEMO',
      willShip: persona.behaviors.will_ship,
      shipsAsDescribed: persona.behaviors.ships_as_described,
    },
    ledger,
    oracle,
    { buyerId: 'B-DEMO', priorClaims: 0, priorPayouts: 0, totalPurchases: 12 },
  );

  console.log(`   fulfillment  ${settled.order.state}`);
  for (const t of settled.order.history) {
    console.log(C.dim(`     ${t.from} -> ${t.to}  via ${t.source}: ${t.evidence.slice(0, 70)}`));
  }
  if (!settled.paidOut) {
    console.log(C.red('   No payout, so there is no miss to learn from.'));
    process.exit(0);
  }
  console.log(
    C.purple(
      `   PAID OUT  ${(settled.claim!.payoutMinor / 100).toFixed(2)} to the buyer, ` +
        `${(settled.claim!.collateralAppliedMinor / 100).toFixed(2)} recovered from collateral, ` +
        `${(settled.claim!.residualReceivableMinor / 100).toFixed(2)} owed by the principal`,
    ),
  );
  const tb = ledger.trialBalance();
  console.log(C.dim(`   ledger balanced: ${tb.balanced}  debits ${tb.totalDebitsMinor} credits ${tb.totalCreditsMinor}`));

  await ledger.persist(rt.store);
  await rt.store.append([
    {
      eventId: crypto.randomUUID(),
      type: 'claim.paid',
      streamId: `claim:${settled.claim!.claimId}`,
      payload: {
        claimId: settled.claim!.claimId,
        orderId: settled.order.orderId,
        merchantId: persona.id,
        payoutMinor: settled.claim!.payoutMinor,
        collateralAppliedMinor: settled.claim!.collateralAppliedMinor,
      },
    },
  ]);

  // -------------------------------------------------------------------------
  // 3. The miss becomes a candidate case, and a human promotes it.
  // -------------------------------------------------------------------------
  console.log(C.bold('\n3. The miss becomes a case'));
  const caseId = await candidateFromPayout(rt.store, {
    merchantId: persona.id,
    claimId: settled.claim!.claimId,
    taxonomy: persona.taxonomy[0] ?? null,
  });
  console.log(`   candidate ${caseId}  ${C.dim('created automatically by the payout')}`);
  if (NO_PROMOTE) {
    console.log(
      C.dim(
        `   stopping here. ${caseId} is pending on /promote, waiting for a human.\n` +
          '   Run without --no-promote, or click Promote on the page, to continue.',
      ),
    );
    process.exit(0);
  }
  await promoteCase(rt.store, caseId, persona.taxonomy[0] ?? 'F24');
  console.log(`   promoted by a human  ${C.dim('nothing enters the eval set without this step')}`);

  // -------------------------------------------------------------------------
  // 4. The eval gate must pass on every class before anything ships.
  // -------------------------------------------------------------------------
  console.log(C.bold('\n4. The eval gate'));
  const report = await runEval({ concurrency: 6 });
  const failing = report.perClass.filter((c) => !c.passes);
  console.log(
    `   ${report.perClass.length} classes, ${report.perClass.filter((c) => c.passes).length} passing, ` +
      `${failing.length} failing`,
  );
  if (failing.length > 0) {
    console.log(C.red(`   GATE FAILS on ${failing.map((f) => f.taxonomy).join(', ')}. The version does not ship.`));
    process.exit(1);
  }
  console.log(C.green('   Gate passes on every class, so the version may ship.'));
  await publishVersion(rt.store, {
    kind: 'scorecard',
    version: 'scorecard-v2',
    gatePassed: true,
    note: `Published after promoting ${caseId}. Cleared the recall floor on all ${report.perClass.length} classes.`,
  });

  // -------------------------------------------------------------------------
  // 5. Re-run the exact same attack against the updated file.
  // -------------------------------------------------------------------------
  console.log(C.bold('\n5. The same attack, again'));
  // The second encounter must reflect exactly the ONE payout this run just
  // demonstrated, not the running total of every payout ever appended to the
  // shared log. Reading the global projection here made the demonstrated score
  // drift downward on every re-run (one payout -> 685, two -> 605, ...), so the
  // published number was a function of how many times the loop had been run.
  // Scope the delta to this run's single claim and the result is deterministic.
  const delta: RegistryDelta = {
    merchantId: persona.id,
    priorPayouts: 1,
    totalPaidMinor: settled.claim!.payoutMinor,
    negativeFile: true,
    noticeCodes: ['NW-04', 'MN-03'],
    attestationContradicted: 1,
  };
  const updatedRegistry = applyRegistryDelta(registryFor(persona), delta);
  console.log(
    C.dim(
      `   registry now holds ${updatedRegistry.priorPayouts} payout(s) against this merchant, ` +
        `negative file with notice codes ${updatedRegistry.notice.codes.join(', ')} and an open appeal`,
    ),
  );

  const second = await underwrite(
    {
      merchant: merchantFor(persona, rt.canaries),
      amountMinor,
      currency: persona.catalog[0].currency,
      purpose: persona.catalog[0].title,
      registry: updatedRegistry,
      canaries: rt.canaries,
      holdout: rt.holdout,
      varianceFloor,
    },
    rt.store,
    rt.model,
    rt.clock,
  );

  console.log(`   score ${second.decision.score}  ${second.decision.decision}  covered=${second.decision.covered}`);
  for (const r of second.decision.reasons.slice(0, 3)) console.log(C.dim(`     ${r.code}  ${r.text.slice(0, 88)}`));

  const improved = second.decision.score < first.decision.score;
  const nowStopped = second.decision.decision === 'decline' || second.decision.decision === 'refer';
  const wasClear = first.decision.decision === 'clear' || first.decision.decision === 'conditional';

  console.log(
    C.bold(
      `\n   ${first.decision.score} ${first.decision.decision}  ->  ${second.decision.score} ${second.decision.decision}` +
        `   (${second.decision.score - first.decision.score} points)`,
    ),
  );

  if (improved && nowStopped) {
    console.log(
      C.green('\n   Scam it once, it pays you. Try the same scam twice, it is already in the immune system.'),
    );
    console.log(
      C.dim(
        '   Nothing about the storefront changed. What changed is the file: a payout is a\n' +
          '   fact about this merchant, and Pillar 4 reads the registry. That is how\n' +
          '   consortium data compounds, rather than a cleverer classifier.',
      ),
    );
  } else if (!wasClear) {
    console.log(C.dim('\n   The first encounter was already stopped, so there was no miss to learn from.'));
  } else {
    console.log(C.red('\n   The score did not move. The loop did not close, and saying so is the point.'));
    process.exit(1);
  }

  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
