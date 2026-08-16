/**
 * The composition root.
 *
 * Wiring modules together is this file's whole job, so it is the one place a
 * cross-module import is correct. `npm run lint:boundaries` exempts
 * `src/runtime/`, `app/`, `scripts/` and `tests/` for exactly this reason, and
 * nothing else.
 */

import type { Clock, EventStore, ModelClient } from '../contracts/ports';
import { getStore } from '../store';
import { AnthropicModelClient } from '../model/client';
import { CONTROL_MERCHANT_ID, loadEvalPersonas, merchantFor } from '../merchants';
import { canariesFromEnv, holdoutFromEnv, systemClock, underwrite } from '../engine/underwrite';
import { registryFor } from '../merchants';

export interface Runtime {
  store: EventStore;
  model: ModelClient;
  clock: Clock;
  canaries: { bx04: string; bx05: string };
  holdout: Array<{ id: string; claim: string; text: string }>;
  latencyTargetMs: number;
}

let runtime: Runtime | null = null;

export function getRuntime(): Runtime {
  if (runtime) return runtime;
  const store = getStore();
  runtime = {
    store,
    model: new AnthropicModelClient({ store }),
    clock: systemClock,
    canaries: canariesFromEnv(),
    holdout: holdoutFromEnv(),
    latencyTargetMs: Number(process.env.CLEARHOUSE_LATENCY_TARGET_MS ?? 30_000),
  };
  return runtime;
}

/**
 * The drift noise floor for the current model version.
 *
 * Measured against a known-honest control merchant. Only variance above this is
 * charged to a merchant, because without the control we would be scoring our
 * own nondeterminism and calling it merchant risk. UNDERWRITING.md Pillar 3.
 *
 * The control merchant is scripted and answers identically every time, so this
 * measures the extraction model's variance rather than the merchant's, which is
 * exactly the quantity we want to subtract.
 */
let varianceFloorCache: number | null = null;

export async function measureVarianceFloor(rt: Runtime = getRuntime()): Promise<number> {
  if (varianceFloorCache !== null) return varianceFloorCache;

  const control = loadEvalPersonas().find((p) => p.id === CONTROL_MERCHANT_ID);
  if (!control) {
    varianceFloorCache = 0.02;
    return varianceFloorCache;
  }

  try {
    const result = await underwrite(
      {
        fileId: 'UF-CONTROL-VARIANCE',
        merchant: merchantFor(control, rt.canaries),
        amountMinor: 10_000,
        currency: 'USD',
        purpose: 'variance control measurement',
        registry: registryFor(control),
        canaries: rt.canaries,
        holdout: rt.holdout,
        // Setting the floor to zero here is the point: we want the raw
        // measurement, not a measurement already corrected by itself.
        varianceFloor: 0,
      },
      rt.store,
      rt.model,
      rt.clock,
    );
    const bx01 = result.findings.find((f) => f.code === 'BX-01');
    const measured = bx01 ? Math.abs(bx01.points) / 120 : 0;
    // A small floor even when the control measures zero, because one control
    // run is one sample and charging a merchant for the first flicker of
    // nondeterminism would be scoring noise.
    varianceFloorCache = Math.max(0.02, measured);
  } catch {
    varianceFloorCache = 0.02;
  }
  return varianceFloorCache;
}

export function resetRuntime(): void {
  runtime = null;
  varianceFloorCache = null;
}
