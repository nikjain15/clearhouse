/**
 * Module boundary check.
 *
 * ARCHITECTURE.md section 1 states the import rule, and this is what makes it
 * true rather than aspirational: a module may import from `src/contracts/`,
 * `config/`, and itself. Any other cross-module dependency goes through a port
 * declared in `src/contracts/ports.ts` and is injected.
 *
 * The point is parallel ownership. Three strangers divide this work at noon,
 * and someone must be able to own one module without reading the others. A
 * boundary nobody checks is a boundary that is gone by 4 PM.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

/** Which modules each module may reach into directly. */
const ALLOWED: Record<string, string[]> = {
  contracts: [],
  config: [],
  store: ['contracts'],
  model: ['contracts'],
  engine: ['contracts', 'config'],
  ledger: ['contracts', 'config'],
  merchants: ['contracts', 'config'],
  evalh: ['contracts', 'config', 'engine', 'merchants', 'ledger', 'runtime'],
  // evalh composes engine, merchants and ledger to measure the whole path.
  arena: ['contracts', 'config', 'merchants', 'engine', 'runtime'],
  // The MCP tool is an entry point: composing engine, merchants and runtime to
  // serve one request is its whole job, the same way app/ and scripts/ compose.
  mcp: ['contracts', 'config', 'engine', 'merchants', 'runtime'],
  board: ['contracts', 'config'],
  // Composition roots. Wiring modules together is their whole job, so they are
  // the one place a cross-module import is correct.
  runtime: ['*'],
};

/** Composition roots may wire anything. Everything else may not. */
const COMPOSITION_ROOTS = new Set(['src/runtime', 'app', 'scripts', 'tests']);

interface Violation {
  file: string;
  importPath: string;
  from: string;
  to: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function moduleOf(relPath: string): string | null {
  const m = relPath.match(/^src\/([^/]+)\//);
  return m ? m[1] : null;
}

function isCompositionRoot(relPath: string): boolean {
  for (const root of COMPOSITION_ROOTS) {
    if (relPath.startsWith(root + '/')) return true;
  }
  return false;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;

function run(): number {
  const files = walk(join(ROOT, 'src')).concat(walk(join(ROOT, 'app')));
  const violations: Violation[] = [];

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (isCompositionRoot(rel)) continue;

    const from = moduleOf(rel);
    if (!from) continue;

    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue; // package imports are not our concern

      // Resolve the target module from a relative specifier.
      const parts = rel.split('/').slice(0, -1);
      for (const seg of spec.split('/')) {
        if (seg === '.') continue;
        else if (seg === '..') parts.pop();
        else parts.push(seg);
      }
      const target = parts.join('/');

      if (target.startsWith('config/')) continue; // versioned data is shared
      const to = moduleOf(target + '/');
      if (!to || to === from) continue;

      const allowed = ALLOWED[from] ?? [];
      if (allowed.includes('*') || allowed.includes(to)) continue;

      violations.push({ file: rel, importPath: spec, from, to });
    }
  }

  if (violations.length === 0) {
    console.log(`Module boundaries hold across ${files.length} files.`);
    return 0;
  }

  console.error(`\n${violations.length} module boundary violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    imports "${v.importPath}"`);
    console.error(`    src/${v.from} may not reach into src/${v.to}.`);
    console.error(
      `    Allowed from src/${v.from}: ${(ALLOWED[v.from] ?? []).join(', ') || 'contracts and config only'}.`,
    );
    console.error(`    Declare a port in src/contracts/ports.ts and inject it instead.\n`);
  }
  return 1;
}

process.exit(run());
