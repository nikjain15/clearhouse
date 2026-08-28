import { loadHeroRun } from '../src/board/heroRun';
import { TryIt, type DemoMerchant } from './components/TryIt';

const MCP_LINE = 'claude mcp add clearhouse --transport http https://clearhouse-pulse-project1.vercel.app/api/mcp';

/** Human framing laid over the real committed run, keyed by merchant. */
const CURATION: Record<string, { blurb: string; item: string; amount: number }> = {
  'M-F04-northgate': {
    blurb: 'A slick outlet that appeared on the internet this week. Never onboarded by anyone.',
    item: 'Apple Watch Series 10',
    amount: 239,
  },
  'M-HONEST-ironwood': {
    blurb: 'A bonded supplier with years of verifiable history and consistent terms.',
    item: 'Cordless drill set',
    amount: 148,
  },
  'M-F09-coastal': {
    blurb: 'Bonded and real, but its refund promise does not match its written policy.',
    item: '4-season tent',
    amount: 180,
  },
  'M-F02-meridian': {
    blurb: 'A watch reseller quoting prices far below market, with a counterfeit problem.',
    item: 'Luxury watch',
    amount: 420,
  },
  'M-F05-pinnacle': {
    blurb: 'Looks flawless and clears — then takes the money and never ships.',
    item: 'ThinkPad X1 laptop',
    amount: 1420,
  },
};

// Order shown to the visitor. Lead with the fraud everyone recognizes.
const ORDER = ['M-F04-northgate', 'M-HONEST-ironwood', 'M-F09-coastal', 'M-F02-meridian', 'M-F05-pinnacle'];

function buildMerchants(): DemoMerchant[] {
  const run = loadHeroRun();
  const byId = new Map((run?.cells ?? []).map((c) => [c.merchantId, c]));
  const out: DemoMerchant[] = [];
  for (const id of ORDER) {
    const cell = byId.get(id);
    const cur = CURATION[id];
    if (!cell || !cur) continue;
    const tier = cell.tier as DemoMerchant['tier'];
    out.push({
      key: id,
      name: cell.title,
      domain: domainFor(id),
      blurb: cur.blurb,
      item: cur.item,
      amount: cur.amount,
      mode: cell.mode as DemoMerchant['mode'],
      tier,
      score: cell.score ?? 0,
      outcome: cell.outcome,
      covered: cell.mode === 'bonded' && (tier === 'clear' || tier === 'conditional'),
      reasons: (cell.topReasons ?? []).map((r) => ({ code: r.code, text: r.text })),
    });
  }
  return out;
}

function domainFor(id: string): string {
  return (
    {
      'M-F04-northgate': 'northgate-outlet.shop',
      'M-HONEST-ironwood': 'ironwoodtools.com',
      'M-F09-coastal': 'coastaloutdoor.com',
      'M-F02-meridian': 'meridianwatch.exchange',
      'M-F05-pinnacle': 'pinnacle-ew.com',
    }[id] ?? ''
  );
}

const NAV = [
  { href: '/board', label: 'Gauntlet' },
  { href: '/eval', label: 'Eval' },
  { href: '/ledger', label: 'Fund' },
  { href: '/registry', label: 'Registry' },
  { href: '/arena', label: 'Arena' },
];

const STEPS = [
  {
    n: 1,
    title: 'Your agent finds a store',
    body: 'Any store on the internet, including one that appeared last week and nobody has checked.',
    tags: ['NEW', 'UNKNOWN', 'UNVETTED'],
    tag: { bg: '#F6F9FC', fg: '#54617a' },
  },
  {
    n: 2,
    title: 'We cross-examine it',
    body: 'Six evidence pillars, hard gates that knock out, and every finding written to a log.',
    tags: ['6 PILLARS', 'SECONDS', 'SCORED'],
    tag: { bg: '#EBEAFF', fg: '#635BFF' },
  },
  {
    n: 3,
    title: 'Verdict, backed by money',
    body: 'One answer your agent can act on. And if a scam still gets through, the fund pays the buyer.',
    tags: ['BUY', 'HOLD', 'ASK YOU', 'WALK'],
    tag: { bg: '#D7F7E8', fg: '#0E6245' },
  },
];

export default function Home() {
  const merchants = buildMerchants();

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-[#0A2540]">
      {/* Soft pastel gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(1100px 520px at 12% -8%, #ece9ff 0%, rgba(236,233,255,0) 60%), radial-gradient(900px 500px at 88% 4%, #e6f6ff 0%, rgba(230,246,255,0) 55%), radial-gradient(800px 480px at 60% 0%, #fdeaf4 0%, rgba(253,234,244,0) 55%), #ffffff',
        }}
      />

      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="text-[17px] font-bold tracking-tight text-[#0A2540]">Clearhouse</span>
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#54617a] transition-colors hover:bg-white hover:text-[#0A2540]"
            >
              {n.label}
            </a>
          ))}
          <a
            href="https://github.com/nikjain15/clearhouse"
            className="ml-1 rounded-full border border-[#dfe4ec] bg-white/70 px-3 py-1.5 text-[13px] font-medium text-[#54617a] transition-colors hover:text-[#0A2540]"
          >
            Source
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-10 sm:px-8 sm:pt-16">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6e7483]">
          Sundai Hack 136 · Agents that buy
        </p>
        <h1 className="mt-4 text-[clamp(44px,8vw,84px)] font-bold leading-[0.98] tracking-[-0.02em] text-[#0A2540]">
          Clearhouse
        </h1>
        <p className="mt-3 text-[clamp(19px,3vw,26px)] font-medium text-[#0A2540]">
          A surety bond for agentic commerce.
        </p>
        <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-[#54617a]">
          We check the merchant before your agent pays. If we are wrong, we pay you back. Pick a store below and watch
          it get underwritten, one finding at a time.
        </p>
      </section>

      {/* The interactive demo */}
      <section className="mx-auto mt-10 max-w-6xl px-5 sm:mt-12 sm:px-8">
        {merchants.length > 0 ? (
          <TryIt merchants={merchants} />
        ) : (
          <div className="rounded-2xl border border-dashed border-[#e3e8ef] p-8 text-[#54617a]">
            Run <code className="rounded bg-[#f2f5f9] px-1.5 py-0.5">npm run gauntlet -- --write-hero</code> to generate
            the committed run this demo reads from.
          </div>
        )}
      </section>

      {/* How it works — three steps */}
      <section className="mx-auto mt-16 max-w-6xl px-5 sm:mt-24 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-3xl border border-[#eef1f6] bg-white/80 p-6 backdrop-blur"
              style={{ boxShadow: '0 20px 45px -30px rgba(10,37,64,0.35)' }}
            >
              <span
                className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: '#635BFF' }}
              >
                {s.n}
              </span>
              <h3 className="mt-2 text-[16px] font-semibold text-[#0A2540]">{s.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#5a6b81]">{s.body}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {s.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                    style={{ background: s.tag.bg, color: s.tag.fg }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add it to your agent */}
      <section className="mx-auto mt-16 max-w-6xl px-5 sm:mt-24 sm:px-8">
        <div
          className="rounded-3xl border border-[#e7ebf1] bg-white p-6 sm:p-8"
          style={{ boxShadow: '0 24px 55px -34px rgba(10,37,64,0.3)' }}
        >
          <h2 className="text-[20px] font-semibold text-[#0A2540]">Add it to your agent, one line</h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#54617a]">
            One MCP tool, <code className="rounded bg-[#f2f5f9] px-1.5 py-0.5 text-[13px]">check_merchant_before_buying</code>,
            appears in your agent. It calls it before money moves and gets back a decision it can act on.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-[#0A2540] px-4 py-3.5 text-[12.5px] leading-relaxed text-[#e6ecf5]">
            <code>{MCP_LINE}</code>
          </pre>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-full border border-[#e0e5ec] bg-white px-3.5 py-2 text-[13px] font-medium text-[#425466] transition-colors hover:border-[#635BFF] hover:text-[#635BFF]"
              >
                {n.label} →
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto mt-20 max-w-6xl px-5 pb-14 sm:px-8">
        <div className="border-t border-[#e7ebf1] pt-6 text-[12.5px] leading-relaxed text-[#6a7685]">
          <p className="max-w-3xl">
            <span className="text-[#54617a]">Honest labels.</span> The guarantee fund is simulated — the double-entry
            ledger reconciles, but no money is real. The fulfillment oracle is simulated, with real state transitions.
            The labeled persona set validates ranking, not absolute probability. Every finding shown here is from a real
            committed run, replayed for you.
          </p>
          <p className="mt-3">
            Built at Sundai Hack 136 with Citable and the HBS Founder Lab.{' '}
            <a className="text-[#635BFF] underline underline-offset-2" href="https://github.com/nikjain15/clearhouse">
              Source on GitHub
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
