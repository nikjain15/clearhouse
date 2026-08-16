import { loadPersonas, registryFor } from '../../src/merchants';
import { SectionNote, ModeBadge } from '../components/primitives';

export const dynamic = 'force-static';

/**
 * Pillar 4, and the obligations that come with holding a negative file.
 *
 * MATCH exists inside a rulebook with obligations attached, and a registry
 * without them is just a list of accusations.
 */
export default function RegistryPage() {
  const rows = loadPersonas()
    .map((p) => ({ p, r: registryFor(p) }))
    .sort((a, b) => b.r.terminatedMatch - a.r.terminatedMatch || b.r.priorFiles - a.r.priorFiles);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-[26px] font-semibold tracking-tight">The registry</h1>
        <SectionNote>
          Prior underwriting files, dispute ratios, payout history and terminated-merchant fingerprints. The
          MATCH-list and consortium analog, and the thing that compounds: every buyer&apos;s interactions
          thicken every merchant&apos;s file. Seeded data today, and we say so.
        </SectionNote>
      </section>

      <section className="rounded-lg border border-ink-800 bg-ink-900 p-5">
        <h2 className="text-[15px] font-semibold">Merchant rights, because a negative file is a serious thing to hold</h2>
        <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-ink-300">
          <li><span className="text-ink-100">Notice</span> when a file turns negative, with the reason codes that caused it.</li>
          <li><span className="text-ink-100">Appeal</span> to human adjudication, with the merchant&apos;s response recorded in the file.</li>
          <li><span className="text-ink-100">Correction and expiry.</span> Entries age out, corrections are appended, and the registry keeps the history of what changed.</li>
          <li>
            <span className="text-ink-100">No fingerprint-alone gate.</span> A third-party fingerprint match never
            acts alone. It raises the tier and demands corroboration from another pillar. Fingerprint similarity
            is evidence, not a verdict, and treating it as a verdict is how you defame an honest merchant who
            bought the same storefront theme as a fraudster.
          </li>
        </ul>
      </section>

      <section className="overflow-x-auto rounded-lg border border-ink-800">
        <table className="w-full min-w-[860px] text-[12.5px]">
          <thead className="bg-ink-900 text-left text-ink-300">
            <tr>
              <th className="px-3 py-2.5 font-medium">Merchant</th>
              <th className="px-3 py-2.5 font-medium">Mode</th>
              <th className="px-3 py-2.5 font-medium">Files</th>
              <th className="px-3 py-2.5 font-medium">Dispute ratio</th>
              <th className="px-3 py-2.5 font-medium">Payouts</th>
              <th className="px-3 py-2.5 font-medium">Fingerprint</th>
              <th className="px-3 py-2.5 font-medium">Notice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.map(({ p, r }) => (
              <tr key={p.id}>
                <td className="px-3 py-2.5">
                  <span className="text-ink-100">{p.display.name}</span>
                  <span className="code ml-2 text-[10.5px] text-ink-500">{p.id}</span>
                </td>
                <td className="px-3 py-2.5"><ModeBadge mode={p.mode} small /></td>
                <td className="code tabular px-3 py-2.5 text-ink-300">{r.priorFiles}</td>
                <td className="code tabular px-3 py-2.5 text-ink-300">
                  {r.disputeRatio === null ? '--' : `${(r.disputeRatio * 100).toFixed(2)}%`}
                </td>
                <td className="code tabular px-3 py-2.5 text-ink-300">{r.priorPayouts}</td>
                <td className="code tabular px-3 py-2.5">
                  {r.terminatedMatch > 0 ? (
                    <span className="text-conditional-500">
                      {r.terminatedMatch.toFixed(2)}
                      <span className="ml-1.5 font-sans text-[10.5px] text-ink-500">to {r.terminatedMatchTo}</span>
                    </span>
                  ) : (
                    <span className="text-ink-600">--</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-400">
                  {r.notice.sent ? `sent, ${r.notice.codes.join(' ')}` : <span className="text-ink-600">none</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
