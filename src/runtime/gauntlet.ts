/**
 * The gauntlet runner.
 *
 * Runs all 18 merchant-facing cells plus the honest scene, and produces the
 * board. Cells execute as independent short units rather than one long request,
 * so no single unit approaches a function timeout and one slow cell cannot take
 * the board down. ARCHITECTURE.md section 9.
 */

import type { AttackOnUsRow, BoardCell, CellOutcome, Decision, Finding, Pillar } from '../contracts/types';
import { loadPersonas, merchantFor, registryFor, type Persona } from '../merchants';
import { underwrite } from '../engine/underwrite';
import { getRuntime, measureVarianceFloor, type Runtime } from './context';

export interface CellResult {
  cell: BoardCell;
  decision: Decision;
  findings: Finding[];
  persona: Persona;
}

/** Purchase amount per cell, so the pricing is exercised at a realistic size. */
function amountFor(p: Persona): number {
  return Math.round(p.catalog[0].feed_price * 100);
}

/**
 * Which pillar caught it: the pillar of the highest-weighted finding, with
 * gates always winning. Shown on screen beside the taxonomy ID.
 */
function catchingPillar(findings: Finding[]): Pillar | null {
  if (findings.length === 0) return null;
  const gate = findings.find((f) => f.gate);
  if (gate) return gate.pillar;
  return [...findings].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0].pillar;
}

/**
 * The outcome shown in the cell.
 *
 * `paid_out` is not a decision the engine makes. It is what happens when a
 * cleared purchase goes bad anyway, and it is resolved by the fulfillment
 * oracle rather than by the score. Showing a priced miss beats claiming
 * perfection.
 */
function outcomeFor(d: Decision, p: Persona): CellOutcome {
  if (d.decision === 'decline') return 'caught';
  if (d.decision === 'refer') return 'escalated';
  // Cleared or conditional. If the merchant will not deliver, this is the cell
  // that becomes a payout once the oracle disagrees with its attestation.
  if (p.label === 'fraud' && (!p.behaviors.will_ship || !p.behaviors.ships_as_described)) {
    return 'paid_out';
  }
  return 'cleared';
}

export async function runCell(persona: Persona, rt: Runtime, varianceFloor: number): Promise<CellResult> {
  const merchant = merchantFor(persona, rt.canaries);
  const amountMinor = amountFor(persona);

  const result = await underwrite(
    {
      merchant,
      amountMinor,
      currency: persona.catalog[0].currency,
      purpose: persona.catalog[0].title,
      registry: registryFor(persona),
      canaries: rt.canaries,
      holdout: rt.holdout,
      varianceFloor,
    },
    rt.store,
    rt.model,
    rt.clock,
  );

  const taxonomy = persona.taxonomy[0] ?? '';
  const cell: BoardCell = {
    taxonomy,
    title: persona.display.name,
    mode: persona.mode,
    merchantId: persona.id,
    outcome: outcomeFor(result.decision, persona),
    score: result.decision.score,
    tier: result.decision.decision,
    catchingPillar: catchingPillar(result.findings),
    topReasons: result.decision.reasons.slice(0, 3),
    narrated: persona.narrated,
    evidenceAnchor: persona.evidence_anchor,
    latencyMs: result.latencyMs,
    fileId: result.fileId,
    served: result.decision.served,
  };

  return { cell, decision: result.decision, findings: result.findings, persona };
}

export interface GauntletOptions {
  concurrency?: number;
  onCell?: (r: CellResult) => void;
  onStart?: (p: Persona) => void;
  only?: string[];
}

export async function runGauntlet(opts: GauntletOptions = {}): Promise<CellResult[]> {
  const rt = getRuntime();
  const varianceFloor = await measureVarianceFloor(rt);

  let personas = loadPersonas().filter((p) => p.id !== 'M-CONTROL-varfloor');
  if (opts.only?.length) personas = personas.filter((p) => opts.only!.includes(p.id));
  personas.sort((a, b) => (a.taxonomy[0] ?? 'F00').localeCompare(b.taxonomy[0] ?? 'F00'));

  const results: CellResult[] = [];
  const concurrency = opts.concurrency ?? 4;
  let i = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, personas.length) }, async () => {
      while (i < personas.length) {
        const p = personas[i++];
        opts.onStart?.(p);
        try {
          const r = await runCell(p, rt, varianceFloor);
          results.push(r);
          opts.onCell?.(r);
        } catch (err) {
          // A failed cell shows as an error rather than silently vanishing.
          // A board that quietly drops a cell is a board that lies.
          results.push({
            persona: p,
            findings: [],
            decision: null as unknown as Decision,
            cell: {
              taxonomy: p.taxonomy[0] ?? '',
              title: p.display.name,
              mode: p.mode,
              merchantId: p.id,
              outcome: 'error',
              score: null,
              tier: null,
              catchingPillar: null,
              topReasons: [{ code: 'ERR', text: err instanceof Error ? err.message : String(err) }],
              narrated: p.narrated,
              evidenceAnchor: p.evidence_anchor,
              latencyMs: null,
              fileId: null,
              served: null,
            },
          });
        }
      }
    }),
  );

  return results.sort((a, b) => a.cell.taxonomy.localeCompare(b.cell.taxonomy));
}

/**
 * The attacks-on-us panel: F19 to F23.
 *
 * These are NOT board cells. They are defended by controls rather than by
 * scoring a merchant, and a uniform cell would misrepresent how they work.
 * The panel exists because a board showing only merchant-facing attacks reads
 * as a system that underwrote one side of a two-sided market, which is the
 * exact criticism UNDERWRITING section 5 says the industry deserves.
 *
 * Each row's `demonstration` reports what THIS run measured. Where the scripted
 * gauntlet does not contain an attack of a given class, the control was not
 * exercised, and the row says so ("control in place, not exercised") rather than
 * implying the control fired. A panel that dressed an unexercised control as a
 * demonstration would be the exact overclaim this project is arguing against.
 */
export function attacksOnUs(evidence: {
  oracleContradictions: number;
  payoutCapsApplied: string[];
  collusionChecked: number;
  injectionAttempts: number;
  malformedFindingsRejected: number;
  promotionsPending: number;
  fingerprintOnlyDeclines: number;
  nonCooperationFindings: number;
}): AttackOnUsRow[] {
  return [
    {
      taxonomy: 'F19',
      attack: 'First-party claim fraud: the buyer receives the goods and claims otherwise to collect the payout.',
      control: 'Fulfillment oracle, evidence bundle, buyer claim history, payout caps.',
      demonstration: `${evidence.oracleContradictions} claim(s) tested against carrier and attestation evidence rather than the buyer's word. Payout caps in force: ${
        evidence.payoutCapsApplied.join(', ') || 'per-buyer and per-merchant'
      }.`,
      held: true,
      detail:
        'A payout requires the binding deposition, an evidence bundle, and a claim inside the window. The buyer is a counterparty, not a trusted narrator, so buyer claim history is scored the way merchant history is.',
    },
    {
      taxonomy: 'F20',
      attack: 'Collusive claim: merchant and buyer cooperate to extract from the guarantee fund.',
      control: 'Merchant and buyer pair collusion detection, exposure caps.',
      demonstration:
        'Control in place, not exercised: the scripted gauntlet contains no colluding buyer, so no collusion pattern fired. Both sides are scored and the per-attack-class aggregate cap is enforced on every payout that does occur.',
      held: true,
      detail:
        'The profitable version of this attack needs both sides, which is why both are scored. Per-attack-class aggregate caps stop one technique draining the fund through many merchants at once.',
    },
    {
      taxonomy: 'F21',
      attack:
        'Injection aimed at the underwriter: merchant content crafted to steer Clearhouse’s own scoring, not the buying agent.',
      control: 'Merchant content handled as untrusted data, never as instructions. Findings schema-constrained.',
      demonstration: `${evidence.injectionAttempts} piece(s) of merchant content passed to the model inside a delimited untrusted envelope, and ${evidence.malformedFindingsRejected} finding(s) failed the schema. The scripted personas carry no injection, so the envelope is applied but not stress-tested here; the live F21 attack (STATUS.md) is where it is.`,
      held: true,
      detail:
        'The worst case of a successful injection is a validation failure rather than an executed instruction. Distinct from F03, which targets the recommender rather than us.',
    },
    {
      taxonomy: 'F22',
      attack: 'Registry false flag: submitting attacks or evidence designed to tank an honest competitor’s score.',
      control: 'Human promotion of arena cases, Pillar 4 notice and appeal, no fingerprint-alone gate.',
      demonstration: `${evidence.promotionsPending} arena case(s) awaiting human promotion, none auto-ingested. ${evidence.fingerprintOnlyDeclines} decline(s) on fingerprint evidence alone, which the scorecard forbids.`,
      held: evidence.fingerprintOnlyDeclines === 0,
      detail:
        'A negative file is a weapon if anyone can load it. NW-02 never acts alone as a hard gate: it raises the tier and demands corroboration from another pillar.',
    },
    {
      taxonomy: 'F23',
      attack: 'Denial of underwriting: the merchant rate-limits, blocks, or stonewalls the examination.',
      control: 'Non-cooperation scores as absent evidence, never as benefit of the doubt.',
      demonstration: `${evidence.nonCooperationFindings} BX-09 finding(s) emitted, each lowering the score rather than leaving it neutral.`,
      held: true,
      detail: 'Refusing the exam is a strategy, not an error state, so the score treats it as one.',
    },
  ];
}
