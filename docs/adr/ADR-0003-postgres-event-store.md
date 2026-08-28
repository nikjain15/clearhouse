# ADR-0003 — A persistent event log, not process memory

**Status:** accepted · **Date:** 2026-08-16 (recorded 2026-08-28) · **Source:** STRATEGY.md §1.7, PLATFORM.md §1

## Decision
Postgres is the event store. The registry, the eval gate, and replay all read from an append-only log
that survives a cold start. Unset `DATABASE_URL` falls back to a file-backed adapter behind the same
interface, for local development only.

## Rejected
- **Process memory.** Serverless functions have no memory to keep it in. This is not a preference; on
  Vercel the alternative does not exist across invocations.
- **Coupling storage to the adapter.** Both stores sit behind one interface so the choice stays reversible.

## Trade-off accepted
An external dependency in the demo path, and a connection string that can block ~8s on an unreachable
host. Mitigated by leaving `DATABASE_URL` unset for the run-it-as-is path, and by `npm run migrate`
being a one-time explicit step rather than implicit on boot.

## Reversal trigger
If the event log stops being the source of truth for replay and the eval gate, the persistence
requirement weakens and a simpler store would do.
