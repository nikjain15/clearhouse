# Stakeholders — Clearhouse

> **Provenance.** Drafted 2026-08-28 from `.github/PULL_REQUEST_TEMPLATE.md`, `docs/STRATEGY.md`, and
> `README.md`. The internal split is **[code]** — it is encoded in the PR template. Everything about
> external parties is **[inferred]** from the strategy documents and needs your correction; no
> stakeholder has been interviewed.

## Who

| Who | Needs from us | Decision they own | Risk |
|---|---|---|---|
| **Buying agents / their developers** `[inferred]` | One line to install, one call, a decision actionable without further reasoning | Whether to call us before money moves | The real user of the product and the one furthest from the room. Nobody on this list has been observed integrating it. |
| **Merchants (bonded)** `[inferred]` | A fair score, a stated price, a path to improve it | Whether to apply, consent to checks, and post the bond | They fund the bond, so they are the paying and the rated party — the conflict named in ADR-0002 |
| **Merchants (cold)** `[inferred]` | Not to be defamed by a wrong score they never asked for | Nothing — they never applied | Scored without consent. `[inferred]` The reputational and legal exposure of a low cold score on a legitimate business is not addressed anywhere in the repo. |
| **Buyers (obligees)** `[inferred]` | To be made whole when the score was wrong | Whether to trust the agent that trusted us | Protected party but not the paying party |
| **Sundai Hack 136 judges** `[code]` | To see the claim demonstrated, not asserted | The verdict on the build | `docs/EVIDENCE.md` and the gauntlet exist for this audience |
| **Citable / HBS Founder Lab** `[code]` | Fit with "Agents that buy" | Programme direction | Named in `README.md` as the hosting context |
| **The four-way build team** `[code]` | Module boundaries that do not collide | Their own module | Encoded as checkboxes, enforced by `npm run lint:boundaries` |

## Internal ownership

**[code]** From the PR template — module ownership is a checkbox on every pull request, and CI
enforces the boundaries across 58 files rather than trusting the checkbox:

| Module | Owner |
|---|---|
| `src/engine/`, `src/ledger/`, `src/mcp/` | Launch Lead |
| `src/merchants/`, `config/personas/` | Hacker 2 |
| `app/` | Hacker 3 |
| `src/evalh/`, `src/arena/` | Hacker 4 |
| `src/contracts/`, `config/` | Shared — requires a second reader |

**[inferred]** This is unusually good practice for a hackathon: three people who form a team at noon
cannot accidentally couple their modules, because the coupling fails the build rather than surfacing
in review.

## Sign-offs

| Approval | Owner | Status |
|---|---|---|
| Promotion of an arena case into the eval set | A human, token-gated | **[code]** enforced — `CLEARHOUSE_PROMOTION_TOKEN`; unset returns 503 |
| Promotion of a provisional taxonomy ID to permanent | Same gate | **[code]** enforced |
| Changes to `src/contracts/`, `config/` | A second reader | **[code]** asked for in the PR template; not mechanically enforced |
| Anything touching scoring | `npm run eval:gate`, recall floor on every attack class | **[code]** enforced in the template's checklist |

## Pushback

**[code]** One disagreement is on the record, in `STRATEGY.md` §1.10. The adversarial stress test found
the build window was roughly six hours for a team formed at noon, that the agreed fixes added ~22
person-hours on top of an already full must-ship list, and recommended cutting scope.

**The recommendation was rejected, consciously.** "Build it completely, no shortcuts," with the
consequences named rather than waved away: recruiting three hackers became a requirement rather than a
hope, and the runtime fallbacks — cached replay, `CLEARHOUSE_REPLAY_ONLY`, a closed-by-default arena —
are what make a full-scope build demo-safe.

**[inferred]** This is the right shape for a logged defense: the steel-man is stated, the decision goes
against it, and the mitigation is specific and was actually built. A second disagreement is recorded in
§1.1 — the name's collision with Clearhaus and The Clearing House — also accepted with eyes open.

## What is missing

`[inferred]` No external stakeholder here has been talked to. Every row except the internal split and
the two named programme partners is reconstructed from strategy documents written by the team, about
audiences the team has not yet met. The highest-value correction to this file is one conversation with
one agent developer.
