'use client';

import { useCallback, useEffect, useState } from 'react';

interface Candidate {
  caseId: string;
  merchantId: string;
  source: string;
  provisionalTaxonomy: string | null;
}

interface Promoted {
  caseId: string;
  promotedBy: string;
  taxonomy: string;
}

export function PromoteClient() {
  const [pending, setPending] = useState<Candidate[]>([]);
  const [promoted, setPromoted] = useState<Promoted[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/arena/promote');
      const d = (await res.json()) as { pending: Candidate[]; promoted: Promoted[] };
      setPending(d.pending ?? []);
      setPromoted(d.promoted ?? []);
    } catch {
      /* the list is a projection; a failed read is not a failed state */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function promote(caseId: string, taxonomy: string) {
    if (!token) {
      setError('The promotion token is required. It is a shared secret in environment configuration.');
      return;
    }
    setBusy(caseId);
    setError(null);
    try {
      const res = await fetch('/api/arena/promote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-clearhouse-promotion-token': token },
        body: JSON.stringify({ caseId, taxonomy: taxonomy || undefined, promotedBy: 'human on stage' }),
      });
      const d = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) setError(d.detail ?? d.error ?? 'Promotion failed.');
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-ink-800 bg-ink-900 p-4">
        <label className="block text-[11px] uppercase tracking-[0.14em] text-ink-400">Promotion token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="CLEARHOUSE_PROMOTION_TOKEN"
          className="mt-1.5 w-full max-w-md rounded border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-[12.5px] outline-none placeholder:text-ink-600 focus:border-ink-500"
        />
        <p className="mt-1.5 text-[11.5px] text-ink-500">
          A shared secret, which is appropriate for a hackathon build and would not be in production. Saying so
          costs nothing.
        </p>
      </div>

      {error && (
        <p className="rounded border border-decline-500/40 bg-decline-900/25 px-3 py-2 text-[12.5px] text-ink-100">
          {error}
        </p>
      )}

      <div>
        <h2 className="text-[17px] font-semibold tracking-tight">
          Awaiting a human {pending.length > 0 && <span className="code text-ink-400">({pending.length})</span>}
        </h2>

        {loaded && pending.length === 0 && (
          <p className="mt-3 rounded-lg border border-dashed border-ink-700 bg-ink-900 px-4 py-6 text-[13px] text-ink-400">
            Nothing is waiting. Candidates appear when a payout happens or when an arena submission beats the
            score. Run <code className="code rounded bg-ink-850 px-1.5 py-0.5">npm run loop</code> to create one.
          </p>
        )}

        <div className="mt-3 space-y-2">
          {pending.map((c) => (
            <div
              key={c.caseId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-conditional-500/40 bg-conditional-900/20 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="code text-[12.5px] text-ink-100">{c.caseId}</p>
                <p className="mt-0.5 text-[12px] text-ink-400">
                  {c.merchantId} &middot; beat the score via {c.source === 'payout' ? 'a payout' : 'the arena'}
                  {c.provisionalTaxonomy && (
                    <span className="code ml-2 text-ink-300">{c.provisionalTaxonomy}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => promote(c.caseId, c.provisionalTaxonomy ?? '')}
                disabled={busy === c.caseId}
                className="rounded bg-ink-100 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-950 transition-opacity disabled:opacity-40"
              >
                {busy === c.caseId ? 'Promoting...' : 'Promote into the eval set'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {promoted.length > 0 && (
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">
            Promoted <span className="code text-ink-400">({promoted.length})</span>
          </h2>
          <div className="mt-3 space-y-1.5">
            {promoted.map((p) => (
              <div
                key={p.caseId}
                className="flex flex-wrap items-baseline gap-3 rounded border border-clear-500/35 bg-clear-900/20 px-4 py-2.5 text-[12.5px]"
              >
                <span className="code text-ink-100">{p.caseId}</span>
                <span className="code text-clear-500">{p.taxonomy}</span>
                <span className="ml-auto text-[11.5px] text-ink-400">by {p.promotedBy}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
