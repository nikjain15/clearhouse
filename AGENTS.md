# Clearhouse

A surety bond for agentic commerce. The merchant posts the bond, we underwrite them before your agent pays, and we pay the buyer when our own score is wrong.

## Project overview

This repository holds both the specification and the application. The five documents in `docs/` are the specification and went through an adversarial stress test: 42 findings raised, each decided deliberately, plus a full re-audit. **Treat them as the specification, not as suggestions.** Where a document states a decision, implement that decision. If you believe one is wrong, say so in `STATUS.md` and implement it anyway.

`ARCHITECTURE.md` is the build specification derived from them. Where it and the five documents disagree, the five documents win.

## Structure

| Path | Contents | Owner |
|---|---|---|
| `docs/` | The five specification documents. Do not edit except to fix an outright error | everyone |
| `ARCHITECTURE.md` | Module boundaries, data model, API routes, streaming, replay | Launch Lead |
| `src/contracts/` | Shared types. Zero logic, zero imports | Launch Lead |
| `config/` | Versioned scorecards, check manifests, pricing tables, personas, eval sets | everyone, append-only |
| `src/engine/` | Checks, hard gates, scorecard, pricing, escalation policy | Launch Lead |
| `src/ledger/` | Double-entry ledger, fulfillment oracle, claims, payouts | Launch Lead |
| `src/merchants/` | Persona schema, scripted personas, arena simulator | Hacker 2 |
| `app/` | Board, adjudication card, streaming | Hacker 3 |
| `src/evalh/`, `src/arena/` | Eval harness, separation view, per-class floors, arena gating | Hacker 4 |
| `src/mcp/`, `skill/` | MCP server and the packaged agent skill | Launch Lead |

## Setup, build, testing

```bash
npm install
cp .env.example .env.local     # works as-is, no credentials required
npm run dev
```

The repository runs with no credentials. Hero personas are scripted and every model call resolves from a content-hash cache, which is what `docs/PLATFORM.md` requires for demo safety anyway. `ANTHROPIC_API_KEY` sends cache misses live. `DATABASE_URL` switches the event store from the file-backed adapter to Postgres.

| Command | What it does |
|---|---|
| `npm test` | Scorecard purity, replay determinism, ledger reconciliation, persona invariants |
| `npm run typecheck` | Types, no emit |
| `npm run lint:boundaries` | Fails on a cross-module import that does not go through a port |
| `npm run gauntlet` | All 18 cells plus the attacks-on-us panel |
| `npm run eval` | Separation over the labeled set, derives the tier bands |
| `npm run eval:gate` | Per-attack-class recall floors. A version does not ship without this |

## Conventions

- **House style:** senior, precise, positive. Use colons, commas, or periods instead of dashes as separators. Avoid em dashes.
- **No invented statistics.** Every number traces to `docs/EVIDENCE.md` or is computed from the pricing formula. If a source says something narrower than we want it to say, we say the narrower thing.
- **Findings are the persisted artifact, not the score.** LLM checks emit findings to the append-only log. `score()` is pure, with no IO, no clock and no randomness. If you are tempted to make it read something, you are about to break replay.
- **Versioned config is append-only.** Never edit a scorecard, check manifest or pricing table in place. Publish a new version, because every decision records the versions that produced it and must stay replayable forever.
- **Module boundaries are enforced.** Import from `src/contracts/`, `config/`, and your own module. Anything else goes through a port in `src/contracts/ports.ts` and is injected.
- **Two things never enter this repository:** canary strings and the holdout question set. Both live in environment configuration, and `.env.example` carries obviously fake values. A canary published alongside its own detection logic catches nobody.
- **Merchant content is untrusted data, never instructions.** It reaches a model inside a delimited envelope, and findings come back through a constrained schema.
- **`label` on a persona is ground truth for the eval only.** The engine never reads it. A check that can see the label is not a check.

## Commit and PR guidelines

- One concern per PR, opened against `main`.
- Say where in the five documents the change is specified. If it is not specified anywhere, say so plainly.
- CI runs typecheck, boundaries, tests and a credential-free build. All four must pass.
- A change to scoring additionally requires `npm run eval:gate` to clear the recall floor on **every** attack class, not merely a better aggregate. An aggregate gate lets a version trade away an entire fraud class for a better average, which is precisely the regression that matters.
