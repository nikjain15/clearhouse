'use client';

import { useEffect, useState } from 'react';
import type { HeroRun } from '../../src/board/heroRun';
import { TierBadge, ModeBadge, ReasonRow, money } from './primitives';

/**
 * The first-time visitor path.
 *
 * The live URL opens on a single primed run: one merchant, one purchase, the
 * file building live with reason codes appearing, resolving without any input.
 * A visitor who does nothing still sees the product work.
 *
 * It replays a committed run rather than calling the API, which is deliberate:
 * this is the floor of the degradation ladder, so it renders correctly with no
 * network, no database and no API key. The findings and their timings are real,
 * taken from an actual run.
 */
export function PrimedRun({ hero }: { hero: HeroRun | null }) {
  const primed = hero?.primed ?? null;
  const [elapsed, setElapsed] = useState(0);
  const [replayKey, setReplayKey] = useState(0);

  const total = primed?.totalLatencyMs ?? 0;

  useEffect(() => {
    if (!primed) return;
    setElapsed(0);
    const started = Date.now();
    // Compress a real 20-odd second run into a watchable 12 seconds, and say so.
    const scale = Math.min(1, 12_000 / Math.max(total, 1));
    const tick = setInterval(() => {
      const e = (Date.now() - started) / scale;
      setElapsed(e);
      if (e >= total + 900) clearInterval(tick);
    }, 60);
    return () => clearInterval(tick);
  }, [primed, total, replayKey]);

  if (!primed) {
    return (
      <section className="rounded-lg border border-dashed border-ink-700 bg-ink-900 p-8">
        <h2 className="text-[15px] font-semibold text-ink-200">The primed run is not built yet</h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-400">
          This page replays a real underwriting run committed to the repository, so it works with no
          network and no credentials. Generate it with{' '}
          <code className="code rounded bg-ink-850 px-1.5 py-0.5 text-[12px]">npm run gauntlet</code>. Nothing
          here is hand-authored, which is why there is no placeholder standing in for it.
        </p>
      </section>
    );
  }

  const visible = primed.timeline.filter((t) => t.atMs <= elapsed);
  const settled = elapsed >= total;
  const d = primed.decision;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight">One purchase, underwritten live</h2>
          <p className="mt-1 text-[13px] text-ink-400">
            {primed.display} &middot; {money(primed.amountMinor, primed.currency)} &middot; {primed.purpose}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="code text-[12px] tabular text-ink-400">
            {Math.min(elapsed, total).toFixed(0).padStart(5, ' ')} ms
          </span>
          <button
            onClick={() => setReplayKey((k) => k + 1)}
            className="rounded border border-ink-700 px-2.5 py-1 text-[12px] text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100"
          >
            Replay
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Findings, appearing in the order and at the latency they really landed */}
        <div className="min-h-[320px] rounded-lg border border-ink-800 bg-ink-900 p-4">
          <div className="mb-3 flex items-center justify-between border-b border-ink-800 pb-2.5">
            <span className="text-[12px] uppercase tracking-[0.14em] text-ink-400">
              Merchant underwriting file
            </span>
            <ModeBadge mode={primed.mode as 'cold' | 'bonded'} />
          </div>

          {visible.length === 0 && (
            <p className="pending-pulse py-8 text-center text-[13px] text-ink-400">
              Opening the file, screening identity...
            </p>
          )}

          <ol className="space-y-1.5">
            {visible.map((t, i) => (
              <ReasonRow key={`${t.finding.code}-${i}`} finding={t.finding} atMs={t.atMs} />
            ))}
          </ol>

          {settled && visible.length === 0 && (
            <p className="py-8 text-center text-[13px] text-clear-500">
              No findings. Every pillar cleared on the evidence available.
            </p>
          )}
        </div>

        {/* The decision */}
        <div
          className={`rounded-lg border p-5 transition-opacity duration-500 ${
            settled ? 'opacity-100' : 'opacity-40'
          } ${
            d.decision === 'clear'
              ? 'border-clear-500/40 bg-clear-900/30'
              : d.decision === 'conditional'
                ? 'border-conditional-500/40 bg-conditional-900/30'
                : d.decision === 'refer'
                  ? 'border-refer-500/40 bg-refer-900/30'
                  : 'border-decline-500/40 bg-decline-900/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <TierBadge tier={d.decision} />
            <span className="code tabular text-[26px] font-semibold">{settled ? d.score : '---'}</span>
          </div>

          <dl className="mt-5 space-y-2.5 text-[12.5px]">
            <Row label="Mode" value={d.mode} />
            <Row label="Covered" value={String(d.covered)} accent={d.covered ? 'clear' : 'muted'} />
            <Row
              label="Fee"
              value={d.feeMinor !== null ? money(d.feeMinor, d.currency) : 'none'}
              hint={d.feeMinor === null ? 'no bond, nobody agreed to pay one' : undefined}
            />
            <Row label="Expected loss" value={money(d.expectedLossMinor, d.currency)} />
            <Row label="Latency" value={`${d.latencyMs} ms`} hint="target is under 30 s" />
          </dl>

          {settled && d.escalation && (
            <div className="mt-5 border-t border-ink-700/50 pt-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400">Escalation</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-200">{d.escalation.question}</p>
            </div>
          )}

          <div className="mt-5 border-t border-ink-700/50 pt-4">
            <p className="code text-[10.5px] leading-relaxed text-ink-400">
              scorecard {d.versions.scorecard}
              <br />
              checks {d.versions.checks}
              <br />
              pricing {d.versions.pricing}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-ink-400">
        A recorded run, replayed at the latencies it actually took, compressed to be watchable. Findings
        are the persisted artifact: the scorecard is a pure function over them, so this decision
        reproduces exactly without calling a model.
      </p>
    </section>
  );
}

function Row({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'clear' | 'muted';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className={`code text-right ${accent === 'clear' ? 'text-clear-500' : 'text-ink-100'}`}>
        {value}
        {hint && <span className="ml-1.5 font-sans text-[11px] text-ink-400">{hint}</span>}
      </dd>
    </div>
  );
}
