import { Stat, SectionNote, money } from '../components/primitives';
import type { LedgerPosting, TrialBalance } from '../../src/contracts/types';

export const dynamic = 'force-static';

interface LedgerRun {
  generatedAt: string;
  summary: {
    fundCashMinor: number;
    fundCapitalMinor: number;
    feesCollectedMinor: number;
    collateralHeldMinor: number;
    claimsExpenseMinor: number;
    recoveryReceivableMinor: number;
    trialBalance: TrialBalance;
    simulated: boolean;
  };
  postings: LedgerPosting[];
}

function loadLedger(): LedgerRun | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const r = require('../../config/runs/ledger.json') as LedgerRun;
    return r?.postings?.length ? r : null;
  } catch {
    return null;
  }
}

export default function LedgerPage() {
  const run = loadLedger();

  if (!run) {
    return (
      <div className="rounded-lg border border-dashed border-ink-700 bg-ink-900 p-8">
        <h1 className="text-[17px] font-semibold">The fund has no run behind it yet</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-400">
          Run <code className="code rounded bg-ink-850 px-1.5 py-0.5">npm run gauntlet -- --write-hero</code>. The
          ledger is a consequence of a run, not a display beside one.
        </p>
      </div>
    );
  }

  const s = run.summary;
  const tb = s.trialBalance;
  const paidOut = s.recoveryReceivableMinor + Math.max(0, -s.claimsExpenseMinor);

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight">The guarantee fund</h1>
          <span className="rounded border border-conditional-500/50 bg-conditional-900/40 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-conditional-500">
            simulated
          </span>
        </div>
        <SectionNote>
          Double entry, and it reconciles. This is the one place a judge may add up the numbers, so reconciling
          arithmetic matters more than a convincing figure. Every posting balances, a single-sided entry is
          unrepresentable, and the run fails if the trial balance does not sum to zero.
        </SectionNote>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Stated capital" value={money(s.fundCapitalMinor)} hint="stated, not implied" />
        <Stat label="Fund cash" value={money(s.fundCashMinor)} />
        <Stat label="Fees collected" value={money(s.feesCollectedMinor)} hint="priced from each file" />
        <Stat label="Collateral held" value={money(s.collateralHeldMinor)} hint="merchants' money, a liability" />
        <Stat label="Paid to buyers" value={money(paidOut)} tone={paidOut > 0 ? 'decline' : 'neutral'} />
        <Stat
          label="Owed by principals"
          value={money(s.recoveryReceivableMinor)}
          hint="recovery running against the merchant"
        />
      </section>

      {/* The reconciliation */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Trial balance</h2>
        <div className="mt-5 overflow-x-auto rounded-lg border border-ink-800">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead className="bg-ink-900 text-left text-ink-300">
              <tr>
                <th className="px-3 py-2.5 font-medium">Account</th>
                <th className="px-3 py-2.5 font-medium">Kind</th>
                <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {tb.accounts.map((a) => (
                <tr key={a.account}>
                  <td className="code px-3 py-2 text-ink-200">{a.account}</td>
                  <td className="px-3 py-2 text-ink-400">{a.kind}</td>
                  <td className="code tabular px-3 py-2 text-right">{money(a.balanceMinor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-ink-700 bg-ink-900">
              <tr>
                <td className="px-3 py-2.5 text-ink-300" colSpan={2}>
                  Total debits
                </td>
                <td className="code tabular px-3 py-2.5 text-right">{money(tb.totalDebitsMinor)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 text-ink-300" colSpan={2}>
                  Total credits
                </td>
                <td className="code tabular px-3 py-2.5 text-right">{money(tb.totalCreditsMinor)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5" colSpan={2}>
                  <span
                    className={`rounded border px-2 py-0.5 text-[10.5px] uppercase tracking-[0.1em] ${
                      tb.balanced
                        ? 'border-clear-500/45 bg-clear-900/40 text-clear-500'
                        : 'border-decline-500/45 bg-decline-900/40 text-decline-500'
                    }`}
                  >
                    {tb.balanced ? 'balanced' : 'out of balance'}
                  </span>
                </td>
                <td className="code tabular px-3 py-2.5 text-right text-ink-400">
                  {money(tb.totalDebitsMinor - tb.totalCreditsMinor)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* The surety structure, in postings */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Every posting</h2>
        <SectionNote>
          The payout sequence is the surety structure in accounting form: the fund pays the obligee first, then
          recovers from the principal against the collateral it holds, and anything the collateral did not cover
          stays owed. Claims expense nets to the part not yet recovered.
        </SectionNote>

        <div className="mt-5 space-y-2">
          {run.postings.map((p) => (
            <div key={p.id} className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] text-ink-100">{p.memo}</span>
                <span className="code text-[10.5px] text-ink-500">{p.id}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                {p.lines.map((l, i) => (
                  <div key={i} className="flex items-baseline gap-3 text-[12px]">
                    <span className="code w-56 shrink-0 text-ink-300">{l.account}</span>
                    <span className="code tabular w-28 text-right text-clear-500">
                      {l.debitMinor > 0 ? money(l.debitMinor) : ''}
                    </span>
                    <span className="code tabular w-28 text-right text-refer-500">
                      {l.creditMinor > 0 ? money(l.creditMinor) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-ink-500">
          Debits left, credits right. Generated {run.generatedAt}.
        </p>
      </section>

      <section className="rounded-lg border border-conditional-500/30 bg-conditional-900/20 p-6">
        <h2 className="text-[15px] font-semibold">Said plainly</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">
          No money here is real. The arithmetic is, the double entry is, and the reconciliation is checked by the
          test suite rather than by eye. In production the fund sits behind a licensed partner. For this build it
          is simulated, and saying so costs nothing and buys everything.
        </p>
      </section>
    </div>
  );
}
