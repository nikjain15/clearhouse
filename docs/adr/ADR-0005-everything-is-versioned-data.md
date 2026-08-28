# ADR-0005 — Attacks, checks and pricing are versioned data, never code

**Status:** accepted · **Date:** 2026-08-16 (recorded 2026-08-28) · **Source:** STRATEGY.md §1.9, PLATFORM.md §1

## Decision
Attacks, checks, questions, scorecards, pricing curves, and eval cases are versioned config. Adding a
fraud case is dropping a JSON file. Outcomes recalibrate pricing; every miss automatically becomes a
permanent eval case; arena attacks become test assets **only after a human promotes them**; and no new
version ships without clearing per-class recall floors on the eval set.

## Rejected
- **Checks as code.** Every new fraud pattern would be a deploy, and the eval set could not be replayed
  against a prior version.
- **Automatic promotion of arena attacks.** An unauthenticated endpoint that can write to the eval set
  is a poisoning vector. The human gate is a security boundary, not bureaucracy.
- **Editing config in place.** Versions are added, never mutated, so replay stays honest.

## Trade-off accepted
More indirection than hardcoding, and a schema that has to be maintained. Bought: determinism, replay,
and a gate that can refuse a regression.

## Reversal trigger
If the eval gate stops being enforced, the versioning discipline loses its purpose and becomes overhead.
