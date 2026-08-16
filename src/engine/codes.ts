/**
 * The reason-code catalog.
 *
 * Every finding is built from here, so points and plain text live in the
 * versioned manifest rather than scattered through check code. Adding a check
 * capability is adding a definition, which is the "everything is data" rule
 * from PLATFORM.md section 1.
 */

import type { Finding, Mode, Pillar } from '../contracts/types';
import checksV1 from '../../config/checks/v1.json';

export interface CodeDef {
  code: string;
  pillar: Pillar;
  points: number;
  gate: boolean;
  modes: Mode[];
  taxonomy: string[];
  text: string;
  soft?: boolean;
}

export interface CheckDef {
  id: string;
  pillar: Pillar;
  modes: Mode[];
  deterministic: boolean;
  channel: string;
  emits: string[];
  promptVersion?: string;
  note?: string;
}

export const CODES: Record<string, CodeDef> = Object.fromEntries(
  (checksV1.codes as unknown as CodeDef[]).map((c) => [c.code, c]),
);

export const CHECK_DEFS: Record<string, CheckDef> = Object.fromEntries(
  (checksV1.checks as unknown as CheckDef[]).map((c) => [c.id, c]),
);

export const CHECKS_VERSION = checksV1.version;

/** Substitute {{vars}} in the catalog text. A missing var is left visible rather than silently blank. */
function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{{${k}}}`,
  );
}

export interface MkFindingOptions {
  vars?: Record<string, string | number>;
  evidence: string;
  checkId: string;
  promptVersion?: string | null;
  /** Override the catalog points, used by scaled deductions like contradictions. */
  points?: number;
}

export function mkFinding(code: string, opts: MkFindingOptions): Finding {
  const def = CODES[code];
  if (!def) throw new Error(`Unknown reason code: ${code}. Add it to config/checks/v1.json.`);
  return {
    checkId: opts.checkId,
    pillar: def.pillar,
    code: def.code,
    points: opts.points ?? def.points,
    text: render(def.text, opts.vars ?? {}),
    evidence: opts.evidence,
    gate: def.gate,
    promptVersion: opts.promptVersion ?? null,
    taxonomy: def.taxonomy,
  };
}

/** Whether a code is reachable in a mode. A cold file never emits BX-05. */
export function codeRunsIn(code: string, mode: Mode): boolean {
  const def = CODES[code];
  return def ? def.modes.includes(mode) : false;
}
