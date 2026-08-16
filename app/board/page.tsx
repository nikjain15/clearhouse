import { loadHeroRun } from '../../src/board/heroRun';
import { ModeBadge, TierBadge, SectionNote } from '../components/primitives';
import type { BoardCell, CellOutcome } from '../../src/contracts/types';
import taxonomy from '../../config/taxonomy.json';

export const dynamic = 'force-static';

const OUTCOME_STYLE: Record<CellOutcome, { label: string; cls: string; dot: string }> = {
  caught: { label: 'caught', cls: 'border-clear-500/45 bg-clear-900/25', dot: 'bg-clear-500' },
  escalated: { label: 'escalated', cls: 'border-refer-500/45 bg-refer-900/25', dot: 'bg-refer-500' },
  paid_out: { label: 'paid out', cls: 'border-bonded-500/45 bg-bonded-500/10', dot: 'bg-bonded-500' },
  cleared: { label: 'cleared', cls: 'border-ink-700 bg-ink-850', dot: 'bg-ink-400' },
  pending: { label: 'pending', cls: 'border-ink-700 bg-ink-850', dot: 'bg-ink-500' },
  error: { label: 'error', cls: 'border-decline-500/45 bg-decline-900/25', dot: 'bg-decline-500' },
};

const TAX = Object.fromEntries(
  (taxonomy.merchantFacing as Array<{ id: string; attack: string; agentNative: boolean; resolution: string }>).map(
    (t) => [t.id, t],
  ),
);

export default function Board() {
  const hero = loadHeroRun();
  const cells = (hero?.cells ?? []).filter((c) => /^F\d\d$/.test(c.taxonomy));
  const honest = (hero?.cells ?? []).find((c) => !/^F\d\d$/.test(c.taxonomy));
  const attacks = hero?.attacksOnUs ?? [];

  const caught = cells.filter((c) => c.outcome === 'caught').length;
  const escalated = cells.filter((c) => c.outcome === 'escalated').length;
  const paidOut = cells.filter((c) => c.outcome === 'paid_out').length;
  const cleared = cells.filter((c) => c.outcome === 'cleared').length;

  if (cells.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-700 bg-ink-900 p-8">
        <h1 className="text-[17px] font-semibold">The gauntlet has not been run yet</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-400">
          Run <code className="code rounded bg-ink-850 px-1.5 py-0.5">npm run gauntlet -- --write-hero</code> to
          produce the committed run this page renders. Nothing here is hand-authored, which is why there is no
          placeholder standing in for it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-[26px] font-semibold tracking-tight">The gauntlet</h1>
        <SectionNote>
          All 18 merchant-facing taxonomy entries, each resolving to caught, escalated or paid out, with the
          pillar and reason code that produced it. Every cell carries its mode, because the two-mode design is
          invisible otherwise. Cold cells are merchants who never applied, caught on public surfaces and
          ordinary buyer interaction. Bonded cells are merchants who consented, where the stress exam and the
          commitment machinery run.
        </SectionNote>

        <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
          <Chip label={`${caught} caught`} cls="border-clear-500/45 text-clear-500" />
          <Chip label={`${escalated} escalated`} cls="border-refer-500/45 text-refer-500" />
          {paidOut > 0 && <Chip label={`${paidOut} paid out`} cls="border-bonded-500/45 text-bonded-500" />}
          {cleared > 0 && <Chip label={`${cleared} cleared`} cls="border-ink-600 text-ink-300" />}
          <Chip
            label={`${cells.filter((c) => c.mode === 'cold').length} cold, ${
              cells.filter((c) => c.mode === 'bonded').length
            } bonded`}
            cls="border-ink-700 text-ink-400"
          />
          {hero?.generatedAt && (
            <Chip
              label={`scorecard ${hero.scorecardVersion}`}
              cls="border-ink-700 text-ink-400"
            />
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The 18 cells                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {cells.map((c) => (
            <Cell key={c.taxonomy} cell={c} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The honest merchant, shown apart so it does not read as a 19th cell  */}
      {/* ------------------------------------------------------------------ */}
      {honest && (
        <section>
          <h2 className="text-[17px] font-semibold tracking-tight">The control: an honest merchant</h2>
          <SectionNote>
            A board that only shows attacks does not show that the system can say yes. This merchant is bonded,
            consented, and has clean history. The purchase completes under a scoped, revocable token with the
            commitments recorded.
          </SectionNote>
          <div className="mt-4 max-w-md">
            <Cell cell={honest} />
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Attacks on us: NOT board cells                                      */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Attacks on us</h2>
        <SectionNote>
          Trust is two-sided, and a system that underwrites only merchants has underwritten half the problem.
          These five are not board cells, because they are defended by controls rather than by scoring a
          merchant, and a uniform cell would misrepresent how they work. Each row names the control that
          answers it and what was actually exercised to show the control holds.
        </SectionNote>

        <div className="mt-5 overflow-x-auto rounded-lg border border-ink-800">
          <table className="w-full min-w-[880px] text-[12.5px]">
            <thead className="bg-ink-900 text-left text-ink-300">
              <tr>
                <th className="px-3 py-2.5 font-medium">Entry</th>
                <th className="px-3 py-2.5 font-medium">Attack</th>
                <th className="px-3 py-2.5 font-medium">Control</th>
                <th className="px-3 py-2.5 font-medium">Exercised in this run</th>
                <th className="px-3 py-2.5 font-medium">Held</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {attacks.map((a) => (
                <tr key={a.taxonomy} className="align-top">
                  <td className="code px-3 py-3 text-ink-300">{a.taxonomy}</td>
                  <td className="px-3 py-3 text-ink-100">{a.attack}</td>
                  <td className="px-3 py-3 text-ink-300">{a.control}</td>
                  <td className="px-3 py-3 text-ink-400">{a.demonstration}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10.5px] uppercase tracking-[0.1em] ${
                        a.held
                          ? 'border-clear-500/45 bg-clear-900/40 text-clear-500'
                          : 'border-decline-500/45 bg-decline-900/40 text-decline-500'
                      }`}
                    >
                      {a.held ? 'held' : 'failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Cell({ cell }: { cell: BoardCell }) {
  const style = OUTCOME_STYLE[cell.outcome];
  const meta = TAX[cell.taxonomy];

  return (
    <div className={`rounded-lg border p-3.5 ${style.cls}`}>
      <div className="flex items-baseline gap-2">
        <span className="code text-[13px] font-semibold">{cell.taxonomy || 'control'}</span>
        <ModeBadge mode={cell.mode} small />
        {meta?.agentNative && (
          <span className="rounded border border-ink-600 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-ink-400">
            agent native
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          <span className="text-[10.5px] uppercase tracking-[0.1em] text-ink-300">{style.label}</span>
        </span>
      </div>

      <p className="mt-2 text-[13px] font-medium leading-snug text-ink-100">{meta?.attack ?? cell.title}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-400">{cell.title}</p>

      <div className="mt-3 flex items-center gap-2 border-t border-ink-700/50 pt-2.5">
        {cell.tier && <TierBadge tier={cell.tier} small />}
        <span className="code tabular text-[15px] font-semibold">{cell.score ?? '---'}</span>
        {cell.catchingPillar && (
          <span className="code rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300">
            P{cell.catchingPillar}
          </span>
        )}
        {cell.latencyMs !== null && (
          <span className="code tabular ml-auto text-[10.5px] text-ink-500">{cell.latencyMs} ms</span>
        )}
      </div>

      <ul className="mt-2.5 space-y-1">
        {cell.topReasons.slice(0, 2).map((r, i) => (
          <li key={i} className="flex gap-1.5 text-[11.5px] leading-snug">
            <span className="code shrink-0 text-ink-400">{r.code}</span>
            <span className="text-ink-300">{r.text}</span>
          </li>
        ))}
      </ul>

      {cell.narrated && cell.evidenceAnchor && (
        <p className="mt-2.5 border-t border-ink-700/50 pt-2 text-[10.5px] leading-snug text-ink-400">
          <span className="text-ink-300">Narrated.</span> {cell.evidenceAnchor}
        </p>
      )}

      {meta?.resolution === 'post_purchase' && (
        <p className="mt-2 rounded border border-bonded-500/30 bg-bonded-500/5 px-2 py-1.5 text-[10.5px] leading-snug text-ink-300">
          The taxonomy assigns this to the fulfillment oracle and the payout rather than to a pillar. A merchant
          that intends not to ship looks exactly like one that intends to, so the bond answers it rather than
          the score.
        </p>
      )}
    </div>
  );
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded border px-2 py-1 ${cls}`}>{label}</span>;
}
