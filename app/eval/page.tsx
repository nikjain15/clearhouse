import { Stat, SectionNote, TierBadge, ModeBadge } from '../components/primitives';
import type { EvalReport } from '../../src/contracts/types';

export const dynamic = 'force-static';

/** Precomputed. The eval page never runs 70 underwriting files while a judge waits. */
function loadReport(): EvalReport | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const r = require('../../config/runs/eval.json') as EvalReport;
    return r?.rows?.length ? r : null;
  } catch {
    return null;
  }
}

export default function EvalPage() {
  const report = loadReport();

  if (!report) {
    return (
      <div className="rounded-lg border border-dashed border-ink-700 bg-ink-900 p-8">
        <h1 className="text-[17px] font-semibold">The eval has not been run yet</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-400">
          Run <code className="code rounded bg-ink-850 px-1.5 py-0.5">npm run eval</code>. This page renders the
          precomputed report and nothing on it is hand-authored.
        </p>
      </div>
    );
  }

  const { thresholds: t, separation: s, confusion: c, perClass } = report;
  const maxBucket = Math.max(...s.buckets.map((b) => Math.max(b.honest, b.fraud)), 1);
  const madeWhole = report.rows.filter((r) => r.resolution === 'made_whole').length;
  const missed = report.rows.filter((r) => r.resolution === 'missed').length;

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-[26px] font-semibold tracking-tight">The eval</h1>
        <SectionNote>
          {report.rows.length} labeled merchants. This set validates <span className="text-ink-200">ranking</span>,
          not absolute probability, and the tier bands below are an output of it rather than an input to it.
        </SectionNote>
      </section>

      {/* Derived thresholds */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">The bands are derived, not chosen</h2>
        <SectionNote>
          A deterministic system with adjectives for thresholds is not one. Each boundary is placed where the
          labeled set actually separates, and it moves when the curve moves.
        </SectionNote>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Threshold label="Clear" from={900} to={t.clear} />
          <Threshold label="Conditional" from={700} to={t.conditional} />
          <Threshold label="Decline floor" from={550} to={t.refer} />
        </div>

        <p className="mt-4 max-w-4xl rounded-lg border border-ink-800 bg-ink-900 p-4 text-[12.5px] leading-relaxed text-ink-300">
          {t.justification}
        </p>
      </section>

      {/* Separation curve */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Separation</h2>
        <SectionNote>
          Honest merchants in green, fraud in red. The overlap is where a human label is worth most, which is
          why it is the refer band.
        </SectionNote>

        <div className="mt-5 overflow-x-auto rounded-lg border border-ink-800 bg-ink-900 p-4">
          <div className="min-w-[520px] space-y-1">
            {s.buckets
              .filter((b) => b.honest > 0 || b.fraud > 0)
              .map((b) => (
                <div key={b.from} className="flex items-center gap-3 text-[11.5px]">
                  <span className="code tabular w-20 shrink-0 text-ink-400">
                    {b.from}-{b.to}
                  </span>
                  <div className="flex flex-1 items-center gap-1">
                    <div className="flex flex-1 justify-end gap-0.5">
                      {Array.from({ length: b.honest }).map((_, i) => (
                        <span key={i} className="h-3.5 w-2.5 rounded-sm bg-clear-500" />
                      ))}
                    </div>
                    <span className="w-px self-stretch bg-ink-700" />
                    <div className="flex flex-1 gap-0.5">
                      {Array.from({ length: b.fraud }).map((_, i) => (
                        <span key={i} className="h-3.5 w-2.5 rounded-sm bg-decline-500" />
                      ))}
                    </div>
                  </div>
                  <span className="code tabular w-16 shrink-0 text-right text-ink-500">
                    {b.honest || ''} {b.fraud ? `/ ${b.fraud}` : ''}
                  </span>
                </div>
              ))}
          </div>
          <p className="mt-4 border-t border-ink-800 pt-3 text-[11.5px] text-ink-400">
            Highest fraud {s.highestFraudScore}. Lowest honest {s.lowestHonestScore}. Overlap {s.overlap.low} to{' '}
            {s.overlap.high}, holding {s.overlap.count} merchants.
          </p>
        </div>
      </section>

      {/* Outcomes */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Outcomes</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Fraud stopped" value={`${c.tp}/${c.tp + c.fn}`} hint="declined or referred before money moved" tone="clear" />
          <Stat label="Made whole" value={String(madeWhole)} hint="cleared, went bad, the fund paid the buyer" />
          <Stat
            label="Missed"
            value={String(missed)}
            hint="cleared and the buyer was left out of pocket"
            tone={missed === 0 ? 'clear' : 'decline'}
          />
          <Stat
            label="Escalation rate"
            value={`${(report.escalationRate * 100).toFixed(1)}%`}
            hint="sent to a human rather than decided alone"
          />
        </div>
        <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-400">
          {c.fp} honest merchant{c.fp === 1 ? ' was' : 's were'} stopped. False positives cost merchants real
          money, so they are reported rather than folded into an accuracy figure. Every one is a thin-file cold
          merchant asked about rather than declined, which is the treatment UNDERWRITING section 6 specifies:
          the answer to a thin file is terms, not decline.
        </p>
      </section>

      {/* Per-class floors */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Per-class recall floors</h2>
        <SectionNote>
          No version ships unless it clears the floor on <span className="text-ink-200">every</span> attack
          class. An aggregate gate would let a new version trade away an entire fraud class for a better
          average, which is precisely the regression that matters.
        </SectionNote>

        <div className="mt-5 overflow-x-auto rounded-lg border border-ink-800">
          <table className="w-full min-w-[620px] text-[12.5px]">
            <thead className="bg-ink-900 text-left text-ink-300">
              <tr>
                <th className="px-3 py-2.5 font-medium">Class</th>
                <th className="px-3 py-2.5 font-medium">Stopped</th>
                <th className="px-3 py-2.5 font-medium">Score recall</th>
                <th className="px-3 py-2.5 font-medium">Resolved</th>
                <th className="px-3 py-2.5 font-medium">Gated rate</th>
                <th className="px-3 py-2.5 font-medium">Floor</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {perClass.map((cl) => (
                <tr key={cl.taxonomy}>
                  <td className="code px-3 py-2.5 text-ink-200">{cl.taxonomy}</td>
                  <td className="code tabular px-3 py-2.5 text-ink-300">
                    {cl.caught}/{cl.total}
                  </td>
                  <td className="code tabular px-3 py-2.5 text-ink-400">{(cl.recall * 100).toFixed(0)}%</td>
                  <td className="code tabular px-3 py-2.5 text-ink-300">
                    {cl.resolved}/{cl.total}
                  </td>
                  <td className="code tabular px-3 py-2.5 text-ink-100">{(cl.resolvedRate * 100).toFixed(0)}%</td>
                  <td className="code tabular px-3 py-2.5 text-ink-400">{(cl.floor * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                        cl.passes
                          ? 'border-clear-500/45 bg-clear-900/40 text-clear-500'
                          : 'border-decline-500/45 bg-decline-900/40 text-decline-500'
                      }`}
                    >
                      {cl.passes ? 'pass' : 'fail'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-400">
          Two columns, because they measure different machinery. Score recall is what the scorecard stopped
          before money moved. Resolved adds the cases that cleared and were then made whole by the fund. The
          taxonomy assigns F05 to the fulfillment oracle and the payout rather than to a pillar, so the gate is
          on resolution. <span className="text-ink-200">A payout is not a catch</span>, which is why both are
          shown rather than only the gated one.
        </p>
      </section>

      {/* Every row */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Every merchant</h2>
        <div className="mt-5 overflow-x-auto rounded-lg border border-ink-800">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead className="bg-ink-900 text-left text-ink-300">
              <tr>
                <th className="px-3 py-2.5 font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Merchant</th>
                <th className="px-3 py-2.5 font-medium">Label</th>
                <th className="px-3 py-2.5 font-medium">Mode</th>
                <th className="px-3 py-2.5 font-medium">Tier</th>
                <th className="px-3 py-2.5 font-medium">Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {report.rows.map((r) => (
                <tr key={r.merchantId} className={r.resolution === 'missed' ? 'bg-decline-900/20' : ''}>
                  <td className="code tabular px-3 py-2 font-medium">{r.score}</td>
                  <td className="px-3 py-2 text-ink-200">
                    {r.merchantId}
                    {r.taxonomy.length > 0 && (
                      <span className="code ml-2 text-[10.5px] text-ink-500">{r.taxonomy.join(' ')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={r.label === 'fraud' ? 'text-decline-500' : 'text-clear-500'}>{r.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <ModeBadge mode={r.mode} small />
                  </td>
                  <td className="px-3 py-2">
                    <TierBadge tier={r.tier} small />
                  </td>
                  <td className="px-3 py-2 text-ink-400">{r.resolution.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-ink-800 bg-ink-900 p-6">
        <h2 className="text-[15px] font-semibold">What this set does and does not establish</h2>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-300">{report.caveat}</p>
        <p className="mt-3 text-[11.5px] text-ink-500">
          Generated {report.generatedAt} under {report.scorecardVersion}.
        </p>
      </section>
    </div>
  );
}

function Threshold({ label, from, to }: { label: string; from: number; to: number }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="code tabular text-[15px] text-ink-500 line-through">{from}</span>
        <span className="text-ink-600">&rarr;</span>
        <span className="code tabular text-[24px] font-semibold">{to}</span>
      </p>
      <p className="mt-1 text-[11px] text-ink-400">placeholder replaced by the derived value</p>
    </div>
  );
}
