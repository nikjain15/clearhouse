# Build OS gap audit

Clearhouse measured against the Build OS artifact set (`skill/SKILL.md`, step "Existing → read the
repo first, produce a Gap Audit"). Taken 2026-08-28.

This audits **coverage of substance, not filenames**. Clearhouse names its documents after the
domain rather than after the template, and a document that does the job under a different name is
not a gap. Four artifacts are genuinely absent.

## The 13 tracked artifacts

| Artifact | Status | Where it lives here |
|---|---|---|
| `README.md` | ✅ present | Strong. Every claim sourced to `docs/EVIDENCE.md` — the best version of this practice in the portfolio. |
| `ARCHITECTURE.md` | ✅ present | 461 lines: module boundaries, event store, persona schema, claims graph, determinism, pricing, ledger. Boundaries are enforced in CI by `npm run lint:boundaries`, not merely described. |
| `FAILURE_MODES.md` | ✅ covered | `docs/TAXONOMY.md` (the fraud taxonomy — the domain's failure modes, with rules) plus `AUDIT.md` (adversarial audit: 42 findings raised, each decided, plus a re-audit). |
| `SAFETY.md` | ✅ covered | `SECURITY.md`: what is deliberately public, what must never enter the repository, how untrusted content is handled. Now enforced mechanically by `.gitleaks.toml`. |
| `evals` | ✅ present | `src/evalh/{harness,loop,separation}.ts`, `npm run eval:gate` with a recall floor on every attack class, and a committed separation curve. |
| `app` | ✅ present | Next.js app, MCP server, arena, board, ledger, registry. |
| `PRD.md` | ⚠️ partial | `docs/STRATEGY.md` carries the product in four sentences, the locked decisions, and why this wins. What a PRD adds and this does not: the user, the problem statement, and success metrics stated as targets rather than as pitch framing. |
| `ENGINEERING.md` | ⚠️ partial | Split across `AGENTS.md` (conventions, testing, PR rules) and `docs/PLATFORM.md` (runtime shape, extensibility). No single document, which is survivable — but the split means a newcomer reads two files to learn one thing. |
| `DECISION_LOG.md` | ⚠️ partial | `STATUS.md` (170 lines) and `docs/STRATEGY.md` §1 "Locked decisions" record *what* was decided. Neither records *what was rejected and why*, which is the half a decision log exists for. |
| `adr` | ❌ missing | No ADRs. The decisions are real and consequential — Postgres as event store, fail-closed on cold intake, exposure caps binding cumulatively, scoring out of 1000 — but they are recorded as conclusions, not with context, options considered, and consequences. |
| `UX.md` | ❌ missing | The landing page was redesigned as a guided underwrite and the arena has a live window, so UX decisions were clearly made. None are written down. |
| `COST.md` | ❌ missing | `ARCHITECTURE.md` §6 covers **pricing of the guarantee** — product economics. It does not cover **run economics**: token cost per underwriting file, cost of the Opus adjudication path, or what the cache saves. `CLEARHOUSE_LATENCY_TARGET_MS` exists, so latency has a target and cost does not. |
| `STAKEHOLDERS.md` | ❌ missing | The four-way team split is encoded in the PR template's module ownership. Nothing records who the external stakeholders are or what they need. |

**Score: 6 present, 3 partial, 4 missing.**

## The larger gap

`clearhouse` does not appear in `docs/data/scorecards.json` in the Build OS hub. Five projects are
scored — `founderfirst-one` 78, `roleos-app` 78, `pulse` 84, `rally` 79, `conduit` 80 — and
Clearhouse is not among them. **The Build OS loop has never been run on this repository.**

That is why this file is a gap audit and not a scorecard. Build OS grades answers the builder gives
during the interview; the hub's own rule is that scores are real or absent, never projected or
illustrative. A scorecard inferred from reading the repo would be a fabricated number on a public
dashboard, which is exactly what that rule exists to prevent.

## What to do about it

Run the loop: in Claude Code, `run build os on this repo`. It will interview phase-by-phase, write
the four missing artifacts from real answers rather than inference, and produce a `scorecard.json`
plus an entry in the hub.

Based on this audit, the interview will probably find its weakest pillar in **Economics** — the one
dimension with no artifact and no target anywhere in the repo, in a product whose entire thesis is
pricing risk.
