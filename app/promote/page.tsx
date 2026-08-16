import { PromoteClient } from '../components/PromoteClient';
import { SectionNote } from '../components/primitives';

export const dynamic = 'force-dynamic';

/**
 * The human promotion gate, on screen.
 *
 * PLATFORM.md section 5 makes this a demo beat rather than a background job: a
 * miss becomes a candidate case, and a human promotes it in front of the room.
 *
 * The gate is the security boundary rather than bureaucracy. Auto-ingesting
 * adversary-submitted cases makes the label come from our own verdict, which
 * makes the loop self-confirming, and it lets anyone with a form submission
 * steer or freeze future versions through the eval gate. That is F22.
 */
export default function PromotePage() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-[26px] font-semibold tracking-tight">Promotion</h1>
        <SectionNote>
          A payout is a fraud that beat the score, and it automatically creates a candidate case. An arena
          submission that beats the score does the same. Neither enters the eval set until a human says so, and
          that is deliberate: a loop that ingests its own verdicts is a loop that confirms itself, and a gate
          anyone can push through is a gate an attacker uses to steer future versions.
        </SectionNote>
      </section>

      <PromoteClient />

      <section className="rounded-lg border border-ink-800 bg-ink-900 p-6">
        <h2 className="text-[15px] font-semibold">What promotion actually does</h2>
        <ol className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-ink-300">
          <li>
            <span className="text-ink-100">1.</span> The case enters the labeled eval set as a persona with
            ground truth attached.
          </li>
          <li>
            <span className="text-ink-100">2.</span> A provisional taxonomy ID from F24 onward becomes permanent.
            The taxonomy growing live is a feature.
          </li>
          <li>
            <span className="text-ink-100">3.</span> No scorecard, check or pricing version ships until it clears
            the recall floor on <span className="text-ink-100">every</span> attack class, including this new one.
            An aggregate gate would let a version trade away an entire class for a better average.
          </li>
          <li>
            <span className="text-ink-100">4.</span> The same attack re-runs against the new version. If the
            score does not move, the loop did not close, and the run says so rather than claiming it did.
          </li>
        </ol>
        <p className="mt-4 border-t border-ink-800 pt-3 text-[12.5px] text-ink-400">
          Run <code className="code rounded bg-ink-850 px-1.5 py-0.5">npm run loop</code> to watch the whole path
          in a terminal: 970 clear, paid out, then 605 decline on the identical attack. Nothing about the
          storefront changed. What changed is the file.
        </p>
      </section>
    </div>
  );
}
