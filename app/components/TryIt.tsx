'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DemoReason {
  code: string;
  text: string;
}

export interface DemoMerchant {
  key: string;
  name: string;
  domain: string;
  blurb: string;
  item: string;
  amount: number;
  mode: 'cold' | 'bonded';
  tier: 'clear' | 'conditional' | 'refer' | 'decline';
  score: number;
  outcome: string;
  covered: boolean;
  reasons: DemoReason[];
}

type Phase = 'idle' | 'finding' | 'examining' | 'reasons' | 'verdict';

const VERDICT: Record<
  DemoMerchant['tier'],
  { label: string; headline: string; bg: string; fg: string; ring: string }
> = {
  clear: { label: 'BUY', headline: 'Safe to buy', bg: '#D7F7E8', fg: '#0E6245', ring: '#8fe3bd' },
  conditional: { label: 'HOLD', headline: 'Proceed with limits', bg: '#FCEDB9', fg: '#983705', ring: '#f2d383' },
  refer: { label: 'ASK YOU', headline: 'Stop and check with a human', bg: '#EBEAFF', fg: '#4b45c6', ring: '#c4c1fb' },
  decline: { label: 'WALK', headline: 'Do not buy from this merchant', bg: '#FCE7E6', fg: '#B42318', ring: '#f4b6b1' },
};

function Pill({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

export function TryIt({ merchants }: { merchants: DemoMerchant[] }) {
  const [selected, setSelected] = useState<DemoMerchant>(merchants[0]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const run = useCallback(() => {
    clearTimers();
    setPhase('finding');
    setShown(0);
    const push = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

    push(() => setPhase('examining'), 650);
    push(() => setPhase('reasons'), 1500);
    // Reveal each reason one at a time.
    selected.reasons.forEach((_, i) => push(() => setShown(i + 1), 1700 + i * 700));
    push(() => setPhase('verdict'), 1900 + selected.reasons.length * 700);
  }, [selected]);

  const pick = (m: DemoMerchant) => {
    clearTimers();
    setSelected(m);
    setPhase('idle');
    setShown(0);
  };

  const v = VERDICT[selected.tier];
  const running = phase !== 'idle' && phase !== 'verdict';

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* Merchant chooser */}
      <div className="flex flex-col gap-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7a8aa0]">
          Point your agent at a store
        </p>
        {merchants.map((m) => {
          const active = m.key === selected.key;
          return (
            <button
              key={m.key}
              onClick={() => pick(m)}
              className="rounded-2xl border p-3.5 text-left transition-all"
              style={{
                borderColor: active ? '#635BFF' : '#e7ebf1',
                background: active ? '#ffffff' : '#ffffff',
                boxShadow: active
                  ? '0 0 0 3px rgba(99,91,255,0.12), 0 10px 30px -18px rgba(10,37,64,0.35)'
                  : '0 1px 2px rgba(10,37,64,0.05)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-[#0A2540]">{m.name}</span>
                <Pill bg={m.mode === 'bonded' ? '#EBEAFF' : '#F6F9FC'} fg={m.mode === 'bonded' ? '#635BFF' : '#54617a'}>
                  {m.mode}
                </Pill>
              </div>
              <span className="mt-0.5 block text-[11.5px] text-[#8593a6]">{m.domain}</span>
              <span className="mt-1.5 block text-[12px] leading-snug text-[#5a6b81]">{m.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* The underwriting theatre */}
      <div
        className="relative overflow-hidden rounded-3xl border bg-white p-6 sm:p-8"
        style={{ borderColor: '#e7ebf1', boxShadow: '0 30px 60px -32px rgba(10,37,64,0.28)' }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7a8aa0]">Your agent wants to buy</p>
            <h3 className="mt-1 text-[19px] font-semibold text-[#0A2540]">
              {selected.item}{' '}
              <span className="text-[#8593a6]">· ${selected.amount.toLocaleString()}</span>
            </h3>
            <p className="text-[12.5px] text-[#8593a6]">from {selected.name} ({selected.domain})</p>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: '#635BFF', boxShadow: '0 8px 20px -8px rgba(99,91,255,0.7)' }}
          >
            {running ? 'Underwriting…' : phase === 'verdict' ? 'Run again' : 'Check this merchant'}
          </button>
        </div>

        <div className="mt-6 min-h-[280px]">
          {phase === 'idle' && (
            <div className="flex h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed text-center" style={{ borderColor: '#e3e8ef' }}>
              <p className="text-[14px] font-medium text-[#54617a]">Press “Check this merchant.”</p>
              <p className="mt-1 max-w-sm text-[12.5px] text-[#8593a6]">
                Clearhouse cross-examines the store before any money moves, and hands your agent one answer it can act on.
              </p>
            </div>
          )}

          {phase !== 'idle' && (
            <div className="space-y-2.5">
              <Step done state="Found the storefront and its checkout" active={phase === 'finding'} />
              <Step
                done={phase !== 'finding'}
                active={phase === 'examining'}
                state={
                  selected.mode === 'bonded'
                    ? 'Cross-examining against the merchant’s own terms and history'
                    : 'Reading public surfaces, no application on file'
                }
              />

              {(phase === 'reasons' || phase === 'verdict') && (
                <div className="pt-1">
                  <p className="mb-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7a8aa0]">
                    What it found
                  </p>
                  <div className="space-y-2">
                    {selected.reasons.slice(0, shown).map((r, i) => (
                      <div
                        key={r.code}
                        className="flex items-start gap-3 rounded-xl border p-3"
                        style={{
                          borderColor: '#eef1f6',
                          background: '#fbfcfe',
                          animation: 'chIn .35s ease both',
                        }}
                      >
                        <span
                          className="mt-[1px] shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                          style={{ background: '#EBEAFF', color: '#635BFF' }}
                        >
                          {r.code}
                        </span>
                        <span className="text-[13px] leading-snug text-[#3f4f66]">{r.text}</span>
                      </div>
                    ))}
                    {phase === 'reasons' && shown < selected.reasons.length && (
                      <div className="flex items-center gap-2 pl-1 text-[12.5px] text-[#8593a6]">
                        <Dots /> examining…
                      </div>
                    )}
                  </div>
                </div>
              )}

              {phase === 'verdict' && (
                <div
                  className="mt-4 rounded-2xl p-5"
                  style={{ background: v.bg, boxShadow: `inset 0 0 0 1px ${v.ring}` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="rounded-full px-3 py-1 text-[13px] font-bold tracking-wide"
                        style={{ background: v.fg, color: v.bg }}
                      >
                        {v.label}
                      </span>
                      <span className="text-[15px] font-semibold" style={{ color: v.fg }}>
                        {v.headline}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] uppercase tracking-wide" style={{ color: v.fg, opacity: 0.7 }}>
                        score
                      </span>
                      <span className="ml-2 font-mono text-[18px] font-semibold" style={{ color: v.fg }}>
                        {selected.score}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed" style={{ color: v.fg }}>
                    {guidanceFor(selected)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes chIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function guidanceFor(m: DemoMerchant): string {
  if (m.outcome === 'paid_out') {
    return 'This one looked perfect and cleared — then it took the money and never shipped. Because it was bonded, Clearhouse paid the buyer back in full. Being wrong is a priced event, not a silent loss.';
  }
  switch (m.tier) {
    case 'clear':
      return m.covered
        ? 'Proceed. The purchase is covered by a bond, so if this merchant breaches, the buyer is made whole.'
        : 'Proceed under scoped, revocable authority. Not covered — nobody posted a bond.';
    case 'conditional':
      return 'Proceed only under scoped, revocable authority limited to this amount.';
    case 'refer':
      return 'Do not proceed on the agent’s own judgment. The findings are material enough that a human should decide.';
    case 'decline':
      return 'Tell the user why and do not buy. The evidence contradicts the merchant’s own claims.';
  }
}

function Step({ state, active, done }: { state: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white transition-colors"
        style={{ background: done && !active ? '#635BFF' : active ? '#8f89ff' : '#cfd6e0' }}
      >
        {done && !active ? '✓' : ''}
      </span>
      <span className="text-[13px]" style={{ color: active ? '#0A2540' : '#5a6b81' }}>
        {state}
        {active ? <span className="ml-1"><Dots /></span> : null}
      </span>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full"
          style={{ background: '#8f89ff', animation: `chBlink 1s ${i * 0.18}s infinite` }}
        />
      ))}
      <style>{`@keyframes chBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}`}</style>
    </span>
  );
}
