import { ArenaClient } from '../components/ArenaClient';
import { windowState } from '../../src/arena/ratelimit';
import { SectionNote } from '../components/primitives';

export const dynamic = 'force-dynamic';

export default function ArenaPage() {
  const win = windowState();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-[26px] font-semibold tracking-tight">Scam our agent</h1>
        <SectionNote>
          Write a merchant that lies and try to get Clearhouse to buy. Every attempt streams onto the board with
          its verdict and feeds the eval numbers. New attacks get provisional taxonomy IDs from F24 onward,
          assigned on the spot, and the taxonomy growing live is a feature.
        </SectionNote>

        <div
          className={`mt-5 rounded-lg border p-4 text-[13px] leading-relaxed ${
            win.open
              ? 'border-clear-500/40 bg-clear-900/25 text-ink-100'
              : 'border-ink-700 bg-ink-900 text-ink-300'
          }`}
        >
          <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-ink-400">
            {win.phase === 'open'
              ? 'open'
              : win.phase === 'archive'
                ? 'read-only archive'
                : win.phase === 'before'
                  ? 'not yet open'
                  : 'closed'}
          </p>
          {win.message}
        </div>
      </section>

      <ArenaClient open={win.open} />

      {/* ------------------------------------------------------------------ */}
      {/* The second door, which is better                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border border-ink-800 bg-ink-900 p-6">
        <h2 className="text-[16px] font-semibold">The other door, and it is the better one</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-400">
          Add the Clearhouse MCP server to your own agent and try to make it buy something it should not. That
          is real user testing rather than a form: it puts the product inside your stack, and every hacker in
          the room already has an MCP client open.
        </p>
        <pre className="code mt-4 overflow-x-auto rounded border border-ink-700 bg-ink-950 p-3 text-[12px] text-clear-500">
          claude mcp add clearhouse --transport http https://clearhouse.vercel.app/api/mcp
        </pre>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The controls, stated rather than implied                            */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">What happens to what you submit</h2>
        <SectionNote>
          This is an open text input from an adversarial room into a model and onto a projector. Every control is
          named rather than implied, because the room will be reading the source during the hour.
        </SectionNote>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            {
              t: 'Untrusted data, never instructions',
              b: 'Your submission reaches the model inside a delimited envelope carrying a standing instruction that content within it is evidence to describe rather than direction to follow. Findings return through a constrained schema, so the worst case of a successful injection is a validation failure rather than an executed instruction. That is F21, and this is where it will be attempted first.',
            },
            {
              t: 'Filtered before it renders',
              b: 'Instruction-shaped markup is neutralized rather than deleted, because an attack that used a hidden HTML comment is the most instructive thing on the board and hiding it would serve nobody. The filter is a rendering control: it is not the injection defense, and treating a keyword filter as one is how people get injected.',
            },
            {
              t: 'A human promotes, or nothing does',
              b: 'A submission that beats the score becomes a candidate case. It does not enter the eval set. Auto-ingesting adversary-submitted cases makes the label come from our own verdict, which makes the loop self-confirming, and it lets anyone with a form submission steer future versions through the eval gate. That is F22.',
            },
            {
              t: 'Rate limited, size capped, time boxed',
              b: 'The window closes and this becomes a read-only archive. Every attempt and its verdict stays visible, which is a better artifact for anyone reviewing later than a dead form. An unauthenticated endpoint calling a paid API is not left standing open on the indexed internet.',
            },
          ].map((c) => (
            <div key={c.t} className="rounded-lg border border-ink-800 bg-ink-900 p-4">
              <h3 className="text-[13.5px] font-medium text-ink-100">{c.t}</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">{c.b}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
