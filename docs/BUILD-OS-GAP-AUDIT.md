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
| `adr` | ⚠️ drafted | `docs/adr/` — five ADRs reconstructed from `STRATEGY.md` §1 on 2026-08-28. Decision and Rejected are sourced; **Reversal trigger is marked `[inferred]` and needs confirmation**. |
| `UX.md` | ⚠️ drafted | `docs/UX.md` — flow and states read from the code. Found two real gaps: **no error state** and **effectively no accessibility support**. No user has been observed. |
| `COST.md` | ⚠️ drafted | `docs/COST.md` — 12 model calls per file, ≈5.4¢ cold. **Token counts are `[assumed]` until a live run.** Cost is now recorded per call (`src/model/pricing.ts`); the prompt-caching finding in the first draft was wrong and is corrected in the document. |
| `STAKEHOLDERS.md` | ⚠️ drafted | `docs/STAKEHOLDERS.md` — internal split is sourced from the PR template; **every external row is `[inferred]` from team-written documents, not from talking to anyone.** |

**Score: 6 present, 3 partial, 4 drafted-pending-your-review** (was 4 missing; drafted 2026-08-28 from repo evidence, with every inferred claim marked).

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
