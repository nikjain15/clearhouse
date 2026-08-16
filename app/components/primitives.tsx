import type { Finding, Mode, Pillar, Tier } from '../../src/contracts/types';

export function money(minor: number, currency = 'USD'): string {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '';
  const v = (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${v}` : `${v} ${currency}`;
}

const TIER_STYLE: Record<Tier, string> = {
  clear: 'border-clear-500/50 bg-clear-900/50 text-clear-500',
  conditional: 'border-conditional-500/50 bg-conditional-900/50 text-conditional-500',
  refer: 'border-refer-500/50 bg-refer-900/50 text-refer-500',
  decline: 'border-decline-500/50 bg-decline-900/50 text-decline-500',
};

export function TierBadge({ tier, small }: { tier: Tier; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded border font-medium uppercase tracking-[0.1em] ${
        TIER_STYLE[tier]
      } ${small ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2.5 py-1 text-[11px]'}`}
    >
      {tier}
    </span>
  );
}

/**
 * The mode is shown on every score, because a cold 780 and a bonded 780 are not
 * the same object. Making it inferable rather than explicit was never an option.
 */
export function ModeBadge({ mode, small }: { mode: Mode; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded border font-medium uppercase tracking-[0.1em] ${
        mode === 'bonded'
          ? 'border-bonded-500/50 bg-bonded-500/10 text-bonded-500'
          : 'border-ink-600 bg-ink-850 text-cold-500'
      } ${small ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[10.5px]'}`}
    >
      {mode}
    </span>
  );
}

export function PillarChip({ pillar }: { pillar: Pillar }) {
  return (
    <span className="code inline-flex items-center rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300">
      P{pillar}
    </span>
  );
}

/**
 * One finding. The reason code, the plain text a model can repeat to a human,
 * and the evidence snippet a human can check the machine against.
 */
export function ReasonRow({ finding, atMs }: { finding: Finding; atMs?: number }) {
  return (
    <li
      className={`finding-in rounded border px-3 py-2 ${
        finding.gate
          ? 'border-decline-500/45 bg-decline-900/30'
          : 'border-ink-800 bg-ink-850/60'
      }`}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          className={`code shrink-0 text-[11.5px] font-medium ${
            finding.gate ? 'text-decline-500' : 'text-ink-300'
          }`}
        >
          {finding.code}
        </span>
        <PillarChip pillar={finding.pillar} />
        {finding.gate && (
          <span className="rounded bg-decline-500/20 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.1em] text-decline-500">
            hard gate
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-baseline gap-2.5">
          {finding.points > 0 && (
            <span className="code tabular text-[11px] text-ink-400">-{finding.points}</span>
          )}
          {atMs !== undefined && (
            <span className="code tabular text-[10.5px] text-ink-500">{atMs} ms</span>
          )}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-100">{finding.text}</p>
      {finding.evidence && (
        <p className="mt-1 border-l-2 border-ink-700 pl-2 text-[11.5px] leading-snug text-ink-400">
          {finding.evidence}
        </p>
      )}
    </li>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'clear' | 'decline' | 'neutral';
}) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p
        className={`code tabular mt-1.5 text-[22px] font-semibold ${
          tone === 'clear' ? 'text-clear-500' : tone === 'decline' ? 'text-decline-500' : 'text-ink-100'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11.5px] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}

export function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-400">{children}</p>
  );
}
