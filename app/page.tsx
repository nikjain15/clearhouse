import { PrimedRun } from './components/PrimedRun';
import { loadHeroRun } from '../src/board/heroRun';

export const dynamic = 'force-static';

const MCP_LINE = 'claude mcp add clearhouse --transport http https://clearhouse.vercel.app/api/mcp';

export default function Home() {
  const hero = loadHeroRun();

  return (
    <div className="space-y-20">
      {/* ------------------------------------------------------------------ */}
      {/* The claim                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="pt-6">
        <p className="mb-4 text-[12px] uppercase tracking-[0.18em] text-ink-400">
          The clearinghouse for agentic commerce
        </p>
        <h1 className="max-w-4xl text-[34px] font-semibold leading-[1.15] tracking-tight sm:text-[44px]">
          A surety bond for agentic commerce.
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-200">
          The merchant posts the bond, we underwrite them before your agent pays, and we pay the buyer
          when our own score is wrong.
        </p>
        <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-ink-400">
          Checkout protocols move the money. Clearhouse underwrites who it moves to: merchant
          underwriting that runs in seconds, prices the guarantee from what it finds, constrains payment
          authority until commitments verify, and pays instantly when its own score is wrong.
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The primed run: a visitor who does nothing still sees it work        */}
      {/* ------------------------------------------------------------------ */}
      <PrimedRun hero={hero} />

      {/* ------------------------------------------------------------------ */}
      {/* Two calls to action, install first                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-ink-800 bg-ink-900 p-6">
          <h2 className="text-[15px] font-semibold">Add it to your own agent</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
            One line into any MCP client. That is the entire integration: no SDK, no new protocol.
          </p>
          <pre className="code mt-4 overflow-x-auto rounded border border-ink-700 bg-ink-950 p-3 text-[12px] leading-relaxed text-clear-500">
            {MCP_LINE}
          </pre>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
            One tool appears. Ask your agent to buy something from a storefront it has never seen, and
            watch it refuse in its own words.
          </p>
        </div>

        <div className="rounded-lg border border-ink-800 bg-ink-900 p-6">
          <h2 className="text-[15px] font-semibold">Attack it yourself</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
            Write a merchant that lies and try to get Clearhouse to buy. Every attempt streams onto the
            board with its verdict and feeds the eval numbers.
          </p>
          <a
            href="/arena"
            className="mt-4 inline-block rounded border border-ink-600 px-3.5 py-2 text-[13px] transition-colors hover:border-ink-400 hover:bg-ink-850"
          >
            Open the arena
          </a>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
            Submissions are rate-limited, size-capped, filtered before they render, and reach the
            underwriter as untrusted data. A human promotes anything that enters the eval set.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Cold and bonded, the distinction that runs through everything        */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Cold and bonded</h2>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-400">
          Merchant diligence has always assumed the merchant applied. Ours often has not, so the file
          exists in two modes, and the mode is recorded on every decision. A cold 780 and a bonded 780
          are not the same object: one is advice, the other is advice with money behind it.
        </p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-ink-800">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-ink-900 text-left text-ink-300">
              <tr>
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">
                  <span className="text-cold-500">Cold</span>
                </th>
                <th className="px-4 py-3 font-medium">
                  <span className="text-bonded-500">Bonded</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {[
                ['The merchant', 'Never applied, never agreed to anything', 'Applied, consented, posted collateral'],
                [
                  'Evidence',
                  'Public surfaces and ordinary buyer-shaped interaction',
                  'Adds the stress exam, consent-gated identity, unannounced re-audit',
                ],
                ['What you get', 'A score, a decision, reason codes', 'The same, plus a bond in force'],
                ['covered', 'false', 'true'],
                ['Fee', 'None, nobody agreed to pay one', 'Priced from the file'],
                ['Ceiling', 'Conditional. Clear is unreachable', 'Clear'],
                ['Reachable score', '800 of 1000', '1000 of 1000'],
              ].map(([label, cold, bonded]) => (
                <tr key={label} className="align-top">
                  <td className="px-4 py-3 text-ink-300">{label}</td>
                  <td className="px-4 py-3 text-ink-200">{cold}</td>
                  <td className="px-4 py-3 text-ink-200">{bonded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-ink-400">
          A cold merchant cannot reach Clear no matter how honest they are, because the evidence that
          would prove it requires their participation. Cold scores are{' '}
          <span className="text-ink-200">not renormalized</span>: the file is scored on the full
          1000-point scale with most of Pillar 3 unearned, so roughly a fifth of the scale stays
          unavailable. That is the point rather than a defect. Bonding is the only way up, and it is how
          a legitimate unknown merchant earns agent traffic.
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The six pillars                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Six evidence pillars</h2>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-400">
          Every mechanism is a direct clone of one proven at card-network or acquirer scale, translated
          to agent-to-agent commerce. A real underwriter builds a file, it does not run a quiz.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              n: 'P1',
              w: '25%',
              title: 'Cold KYB',
              body:
                'Sanctions and denied-party screening, business registration, prohibited category, domain age, TLS and endpoint provenance, identity consistency across surfaces. A three-week-old domain claiming to be Walmart dies here in milliseconds.',
            },
            {
              n: 'P2',
              w: '25%',
              title: 'Claims graph',
              body:
                'Extract every material claim, verify each through an independent channel, weight contradictions by materiality. Price x5, fees x4, delivery x2, tone x1.',
            },
            {
              n: 'P3',
              w: '20%',
              title: 'Stress exam',
              body:
                'Agent-native, and ours. Stateless variance against a control merchant, sycophancy resistance, pressure response, two canaries with different meanings, hallucinated-promise probing.',
            },
            {
              n: 'P4',
              w: '15%',
              title: 'Network history',
              body:
                'The MATCH-list analog. Prior files, dispute ratios, terminated-merchant fingerprint matching, carrying notice, appeal and expiry obligations, because a negative file is a serious thing to hold.',
            },
            {
              n: 'P5',
              w: '15%',
              title: 'Transaction anomaly',
              body:
                'The Falcon analog, per-transaction and independent of merchant trust. Price plausibility against comparables, category risk, amount-versus-purpose sanity, velocity.',
            },
            {
              n: 'P6',
              w: 'modifier',
              title: 'Continuous monitoring',
              body:
                'The score decays without fresh evidence, outcomes feed back, and unannounced re-audit against a holdout set catches a merchant that behaved for the exam and defected afterward.',
            },
          ].map((p) => (
            <div key={p.n} className="rounded-lg border border-ink-800 bg-ink-900 p-4">
              <div className="flex items-baseline justify-between">
                <span className="code text-[12px] text-ink-300">{p.n}</span>
                <span className="code text-[11px] text-ink-400">{p.w}</span>
              </div>
              <h3 className="mt-1.5 text-[14px] font-medium">{p.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Why this is not a merchant checker                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border border-ink-800 bg-ink-900 p-6">
        <h2 className="text-[17px] font-semibold tracking-tight">The score being wrong is a priced event</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div>
            <h3 className="text-[13.5px] font-medium text-ink-200">Binding deposition</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
              Merchant answers are recorded commitments. Settlement is authorized only against the
              transcript, so a lie that evades detection still does not get paid.
            </p>
          </div>
          <div>
            <h3 className="text-[13.5px] font-medium text-ink-200">Scoped, revocable authority</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
              We do not hold your money. Payment authority is scoped to a business, limited by amount
              and time, and revocable. Money that has not become final is money a breach can still stop.
            </p>
          </div>
          <div>
            <h3 className="text-[13.5px] font-medium text-ink-200">Rolling reserve as collateral</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
              Conditional merchants post a slice of each settlement under an indemnity agreement,
              released as clean transactions accumulate. Standard surety practice.
            </p>
          </div>
        </div>
        <p className="mt-6 border-t border-ink-800 pt-5 text-[13px] leading-relaxed text-ink-300">
          The merchant pays, and the merchant is the party we are scoring. We name that rather than hide
          it: it is the structure that discredited credit ratings in 2008. The difference is the one
          Moody&apos;s could never claim. A rating agency was never required to pay when its rating was
          wrong. We pay on every score we issue, from a fund our own pricing has to keep solvent. Being
          wrong costs us money, which is the only conflict mitigation that has ever worked.
        </p>
      </section>
    </div>
  );
}
