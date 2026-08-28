## What this changes

<!-- One paragraph. What is different after this merges, and why. -->

## Which module

<!-- Ownership follows the team split in docs/STRATEGY.md section 7 and the
     boundaries in ARCHITECTURE.md section 1. Tick the one you own. -->

- [ ] `src/engine/`, `src/ledger/`, `src/mcp/` (Launch Lead)
- [ ] `src/merchants/`, `config/personas/` (Hacker 2)
- [ ] `app/` (Hacker 3)
- [ ] `src/evalh/`, `src/arena/` (Hacker 4)
- [ ] `src/contracts/`, `config/` (shared, needs a second reader)

## Specification

<!-- Where in the five documents this is specified. If it is not specified
     anywhere, say so plainly and explain the judgment call. -->

## Checks

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint:boundaries` passes
- [ ] No canary string or holdout question entered the repository
- [ ] Versioned config was added as a new version rather than edited in place
- [ ] Any new number on screen traces to `docs/EVIDENCE.md` or is computed from the formula
- [ ] Every URL and install line in changed files was verified against the live host

## If this changes scoring

- [ ] `npm run eval:gate` passes, clearing the recall floor on **every** attack class
- [ ] The separation curve is regenerated and committed
