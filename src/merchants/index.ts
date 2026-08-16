/**
 * Persona loading.
 *
 * Adding a fraud case is dropping a JSON file in `config/personas/`. Nothing
 * here needs to change when one appears, which is the PLATFORM.md section 1
 * commitment made concrete.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistryRecord } from '../contracts/ports';
import type { Mode } from '../contracts/types';
import { parsePersona, type Persona } from './schema';
import { ScriptedMerchant, type Canaries } from './scripted';

export { ScriptedMerchant, parsePersona };
export type { Persona, Canaries };

const PERSONA_DIR = process.env.CLEARHOUSE_PERSONA_DIR ?? join(process.cwd(), 'config', 'personas');
const EVAL_DIR = process.env.CLEARHOUSE_EVAL_DIR ?? join(process.cwd(), 'config', 'eval');

let cache: Persona[] | null = null;

function loadDir(dir: string): Persona[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return names.map((f) => parsePersona(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
}

/** Every persona: the gauntlet cells, the honest merchants, and the control. */
export function loadPersonas(): Persona[] {
  if (cache) return cache;
  cache = loadDir(PERSONA_DIR).sort((a, b) => a.id.localeCompare(b.id));
  return cache;
}

/** The labeled eval set. Same schema, kept separate so the gauntlet stays 18 cells. */
export function loadEvalPersonas(): Persona[] {
  return [...loadPersonas(), ...loadDir(EVAL_DIR)].sort((a, b) => a.id.localeCompare(b.id));
}

export function personaById(id: string): Persona | undefined {
  return loadEvalPersonas().find((p) => p.id === id);
}

/** The one persona whose only job is to establish the drift noise floor. */
export const CONTROL_MERCHANT_ID = 'M-CONTROL-varfloor';

export function merchantFor(persona: Persona, canaries: Canaries): ScriptedMerchant {
  return new ScriptedMerchant(persona, canaries);
}

/**
 * Pillar 4 state for a persona.
 *
 * Seeded registry data today, and we say so on stage. The mechanism is real:
 * a negative file carries notice, appeal and expiry obligations, because MATCH
 * exists inside a rulebook with obligations attached and a registry without
 * them is just a list of accusations.
 */
export function registryFor(persona: Persona): RegistryRecord {
  const n = persona.network;
  return {
    merchantId: persona.id,
    fingerprint: n.fingerprint || `sha256:${persona.id}`,
    terminatedMatch: n.terminated_match,
    terminatedMatchTo: n.terminated_match_to,
    priorFiles: n.prior_files,
    disputeRatio: n.dispute_ratio,
    priorPayouts: n.prior_payouts,
    attestationContradicted: 0,
    negativeFile: n.negative_file,
    notice: n.negative_file
      ? { sent: true, at: '2026-07-02T00:00:00Z', codes: ['NW-01'] }
      : { sent: false, at: null, codes: [] },
    appeal: { open: false, merchantResponse: null },
    expiresAt: null,
  };
}

/** The 18 merchant-facing cells, in taxonomy order, with modes fixed. */
export function gauntletPersonas(): Persona[] {
  return loadPersonas()
    .filter((p) => p.taxonomy.some((t) => /^F(0[1-9]|1[0-8])$/.test(t)))
    .sort((a, b) => (a.taxonomy[0] ?? '').localeCompare(b.taxonomy[0] ?? ''));
}

export function modeOf(persona: Persona): Mode {
  return persona.mode;
}
