import { loadHeroRun } from '../../src/board/heroRun';
import { loadPersonas, registryFor } from '../../src/merchants';
import { ModeBadge, TierBadge, SectionNote, money } from '../components/primitives';

export const dynamic = 'force-static';

/**
 * The adjudication card. One screen, ten-second decision.
 *
 * UNDERWRITING.md section 7. This is the refer tier made concrete: it shows the
 * escalation the event blurb asks about, and it is the same human path a
 * disputed claim uses.
 */
export default function AdjudicatePage() {
  const hero = loadHeroRun();
  const escalated = (hero?.cells ?? []).filter((c) => c.outcome === 'escalated');
  const personas = Object.fromEntries(loadPersonas().map((p) => [p.id, p]));

  if (escalated.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-700 bg-ink-900 p-8">
        <h1 className="text-[17px] font-semibold">Nothing is waiting on a human</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-400">
          Run <code className="code rounded bg-ink-850 px-1.5 py-0.5">npm run gauntlet -- --write-hero</code>. Cards
          appear for every cell that landed in the refer tier.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-[26px] font-semibold tracking-tight">Adjudication</h1>
        <SectionNote>
          The refer tier is the overlap region: the range where the labeled set does not separate cleanly and a
          human label is worth most. One screen, ten-second decision, and the verdict is logged and feeds
          calibration. Disputed claims use this same path.
        </SectionNote>
        <p className="mt-3 text-[13px] text-ink-400">
          {escalated.length} file{escalated.length === 1 ? '' : 's'} waiting.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {escalated.map((cell) => {
          const p = personas[cell.merchantId];
          const registry = p ? registryFor(p) : null;
          const amountMinor = p ? Math.round(p.catalog[0].feed_price * 100) : 0;

          return (
            <article key={cell.taxonomy} className="rounded-lg border border-refer-500/40 bg-refer-900/15 p-5">
              {/* Amount at risk, score, mode, top reasons */}
              <header className="flex flex-wrap items-baseline gap-2.5 border-b border-ink-700/60 pb-3">
                <span className="code text-[13px] font-semibold">{cell.taxonomy}</span>
                <ModeBadge mode={cell.mode} small />
                <TierBadge tier="refer" small />
                <span className="ml-auto text-right">
                  <span className="code tabular block text-[20px] font-semibold">{money(amountMinor)}</span>
                  <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-400">at risk</span>
                </span>
              </header>

              <div className="mt-3 flex items-baseline gap-3">
                <span className="code tabular text-[26px] font-semibold">{cell.score}</span>
                <span className="text-[13px] text-ink-200">{cell.title}</span>
              </div>

              <p className="mt-1 text-[12px] text-ink-400">
                {cell.mode === 'cold'
                  ? 'This merchant never applied to Clearhouse. The score is advice, and nothing stands behind it.'
                  : 'This merchant is bonded, so approving here issues a guarantee against collateral.'}
              </p>

              {/* Top three reason codes */}
              <div className="mt-4">
                <p className="text-[10.5px] uppercase tracking-[0.14em] text-ink-400">Top reasons</p>
                <ul className="mt-1.5 space-y-1.5">
                  {cell.topReasons.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
                      <span className="code shrink-0 text-ink-400">{r.code}</span>
                      <span className="text-ink-100">{r.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Side by side: what the feed said against what checkout said */}
              {p && (
                <div className="mt-4 rounded border border-ink-700/60 bg-ink-950/50 p-3">
                  <p className="text-[10.5px] uppercase tracking-[0.14em] text-ink-400">Side by side</p>
                  <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11.5px]">
                    <dt className="text-ink-400">Feed</dt>
                    <dd className="code tabular col-span-2 text-ink-100">
                      {money(Math.round(p.catalog[0].feed_price * 100))}, delivery {p.catalog[0].delivery_days}d
                    </dd>
                    <dt className="text-ink-400">Checkout</dt>
                    <dd className="code tabular col-span-2 text-ink-100">
                      {money(
                        p.checkout.quote_total !== null
                          ? Math.round(p.checkout.quote_total * 100)
                          : Math.round(p.catalog[0].feed_price * 100) +
                              p.checkout.fees.reduce((s, f) => s + Math.round(f.amount * 100), 0),
                      )}
                      {p.checkout.fees.length > 0 &&
                        ` incl ${p.checkout.fees.map((f) => `${f.label} ${money(Math.round(f.amount * 100))}`).join(', ')}`}
                    </dd>
                    <dt className="text-ink-400">Written policy</dt>
                    <dd className="col-span-2 text-ink-100">
                      {p.policies.refund_window_days}d {p.policies.refund_form.replace(/_/g, ' ')}
                    </dd>
                    <dt className="text-ink-400">Registry</dt>
                    <dd className="col-span-2 text-ink-100">
                      {registry?.priorFiles ?? 0} prior file(s)
                      {registry?.terminatedMatch ? `, fingerprint ${registry.terminatedMatch.toFixed(2)}` : ''}
                      {registry?.priorPayouts ? `, ${registry.priorPayouts} payout(s)` : ''}
                    </dd>
                  </dl>
                </div>
              )}

              {/* Two actions, with their terms */}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-clear-500/35 bg-clear-900/25 p-3">
                  <p className="text-[12px] font-medium text-clear-500">Approve with scoped authority</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-300">
                    Authority capped at {money(amountMinor)}, revocable, expiring in 30 minutes.
                    {cell.mode === 'bonded'
                      ? ` Rolling reserve of ${money(Math.round(amountMinor * 0.1))} held as collateral.`
                      : ' Uncovered: no bond stands behind this.'}
                  </p>
                </div>
                <div className="rounded border border-decline-500/35 bg-decline-900/25 p-3">
                  <p className="text-[12px] font-medium text-decline-500">Decline</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-300">
                    Do not buy. The merchant receives notice with the reason codes above and may appeal.
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[10.5px] leading-snug text-ink-500">
                The verdict is logged as a supervised label. Refer-tier decisions are ground truth for the band
                where the model is least certain, which is exactly where labels are worth most.
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
