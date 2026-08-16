import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clearhouse: a surety bond for agentic commerce',
  description:
    'The merchant posts the bond, we underwrite them before your agent pays, and we pay the buyer when our own score is wrong.',
};

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/board', label: 'Gauntlet' },
  { href: '/adjudicate', label: 'Adjudicate' },
  { href: '/eval', label: 'Eval' },
  { href: '/ledger', label: 'Fund' },
  { href: '/registry', label: 'Registry' },
  { href: '/arena', label: 'Arena' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 text-ink-100">
        <header className="sticky top-0 z-50 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3">
            <a href="/" className="flex items-baseline gap-2.5 shrink-0">
              <span className="text-[15px] font-semibold tracking-tight">Clearhouse</span>
              <span className="hidden text-[11px] text-ink-400 sm:inline">
                a surety bond for agentic commerce
              </span>
            </a>
            <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded px-2.5 py-1.5 text-[12.5px] text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
                >
                  {n.label}
                </a>
              ))}
              <a
                href="https://github.com/nikjain15/clearhouse"
                className="ml-2 whitespace-nowrap rounded border border-ink-700 px-2.5 py-1.5 text-[12.5px] text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100"
              >
                Source
              </a>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-5 py-8">{children}</main>

        <footer className="mt-16 border-t border-ink-800">
          <div className="mx-auto max-w-[1400px] px-5 py-8 text-[12px] leading-relaxed text-ink-400">
            <p className="mb-3 max-w-3xl">
              <span className="text-ink-300">Honest labels.</span> The guarantee fund is simulated: the
              double-entry ledger reconciles, but no money is real. The fulfillment oracle is simulated,
              with real state transitions. Pillar 4 is 15% of the score and runs on seeded registry data.
              The labeled persona set validates ranking, not absolute probability.
            </p>
            <p>
              Built at Sundai Hack 136 with Citable and the HBS Founder Lab. Source is open at{' '}
              <a className="text-ink-300 underline underline-offset-2" href="https://github.com/nikjain15/clearhouse">
                github.com/nikjain15/clearhouse
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
