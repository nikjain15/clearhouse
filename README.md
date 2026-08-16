# Clearhouse

**A surety bond for agentic commerce.** The merchant posts the bond, we underwrite them before your agent pays, and we pay the buyer when our own score is wrong.

Checkout protocols move the money. Clearhouse underwrites who it moves to: merchant underwriting that runs in seconds, prices the guarantee from what it finds, constrains payment authority until commitments verify, and pays instantly when its own score is wrong.

Built at Sundai Hack 136 with Citable and HBS Founder Lab, "Agents that buy."

---

## The problem, in one documented incident

Guardio Labs built a fake Walmart storefront with a single prompt, pointed Perplexity's Comet browser at it, and asked it to buy an Apple Watch. Comet scanned the site, never questioned legitimacy, navigated checkout, autofilled the stored card, and completed the purchase with no human confirmation.

No acquirer on earth would have onboarded that merchant. Nobody asked.

UCP and ACP are checkout plumbing, and both assume the merchant is already known to somebody. Neither answers whether your agent should trust a merchant nobody onboarded, and neither says who eats the loss when it should not have. Clearhouse is the entity that answers "we do, priced by our own score."

Sources for every claim on this page are in [docs/EVIDENCE.md](docs/EVIDENCE.md).

---

## Add it to your agent, one line

```
claude mcp add clearhouse --transport http https://clearhouse.vercel.app/api/mcp
```

That is the entire integration. No SDK, no new protocol.

One tool appears, `check_merchant_before_buying`. Your agent calls it before money moves, with the merchant, the amount, the currency, and what is being bought. Back comes a decision it can act on without further reasoning:

```jsonc
{
  "decision": "decline",              // clear | conditional | refer | decline
  "score": 312,
  "mode": "cold",                     // cold | bonded
  "covered": false,                   // true only when a bond is in force
  "reasons": [
    { "code": "ID-03", "text": "The domain is 19 days old." },
    { "code": "ID-07", "text": "No public business registration found for the claimed legal entity." },
    { "code": "CL-01", "text": "Feed price $399.00 contradicts checkout quote $463.75." }
  ]
}
```

`fee` and `guarantee_reference` appear only when `covered` is true. `escalation` appears on `refer`, stating exactly what the human is being asked to decide.

The full contract is in [docs/PLATFORM.md](docs/PLATFORM.md) section 2. The packaged agent skill carrying the escalation policy is in [`skill/`](skill/).

---

## Cold and bonded, the distinction that runs through everything

Merchant diligence has always assumed the merchant applied. Ours often has not.

| | **Cold** | **Bonded** |
|---|---|---|
| The merchant | Never applied, never agreed to anything | Applied, consented, posted collateral |
| Evidence | Public surfaces and ordinary buyer-shaped interaction | Adds the stress exam, consent-gated identity, unannounced re-audit |
| What you get | A score, a decision, reason codes | The same, plus a bond in force |
| `covered` | `false` | `true` |
| Fee | None, nobody agreed to pay one | Priced from the file |
| Ceiling | **Conditional.** Clear is unreachable | Clear |

A cold merchant cannot reach Clear no matter how honest they are, because the evidence that would prove it requires their participation. Cold scores are **not renormalized**: the file is scored on the full 1000-point scale with most of Pillar 3 unearned, so roughly a fifth of the scale stays unavailable. That is the point rather than a defect. Bonding is the only way up, and it is how a legitimate unknown merchant earns agent traffic.

A cold 780 and a bonded 780 are not the same object. One is advice, the other is advice with money behind it.

---

## How it works

Six evidence pillars build a Merchant Underwriting File, hard gates knock out, and a weighted scorecard emits reason codes.

| Pillar | Weight | What it does |
|---|---|---|
| P1 Cold KYB | 25% | Sanctions and denied-party screening, business registration, prohibited category, domain age, TLS and endpoint provenance, identity consistency across surfaces |
| P2 Claims graph | 25% | Extract every material claim, verify each through an independent channel, weight contradictions by materiality |
| P3 Stress exam | 20% | Stateless variance against a control merchant, sycophancy resistance, pressure response, two canaries, hallucinated-promise probing |
| P4 Network history | 15% | Prior files, dispute ratios, terminated-merchant fingerprint matching, with notice and appeal rights |
| P5 Transaction anomaly | 15% | Price plausibility against comparables, category risk, amount-versus-purpose sanity, velocity |
| P6 Continuous monitoring | modifier | Score decay, outcome feedback, unannounced re-audit against the holdout set |

Full methodology in [docs/UNDERWRITING.md](docs/UNDERWRITING.md).

**Findings are the persisted artifact, not the score.** Pillars 2 and 3 are LLM judgments, so the determinism claim has to be precise. An LLM check emits findings (reason code, points, evidence snippet) which are written to an append-only log. The scorecard is a pure function over stored findings. Replay reruns the scorecard over recorded findings and reproduces the decision exactly, forever, without re-calling the model.

**The two canaries mean different things.** `BX-04` is buyer-embedded, a harmless instruction in our own message. A merchant agent following its own customer's instruction is doing its job, so this is a soft signal at low weight and never a gate. `BX-05` is content-embedded, planted in third-party content the merchant ingests. A merchant that obeys instructions from content it did not author is structurally injectable and will obey anyone's. That one is the hard gate, and it is bonded-only, because planting instructions in a non-applicant's content is not something ordinary buyer interaction does.

---

## The fraud taxonomy

23 numbered entries in [docs/TAXONOMY.md](docs/TAXONOMY.md). F01 to F18 are merchant-facing and run as an 18-cell live gauntlet. F19 to F23 are attacks aimed at Clearhouse itself and run as a separate panel, because they are defended by controls rather than by scoring a merchant.

A system that underwrites only merchants has underwritten half the problem.

---

## Run it

```bash
git clone https://github.com/nikjain15/clearhouse
cd clearhouse
npm install
cp .env.example .env.local     # works as-is, no credentials required
npm run dev                    # http://localhost:3000
```

It runs with no credentials. The hero personas are scripted and every model call resolves from a content-hash cache, which is what [docs/PLATFORM.md](docs/PLATFORM.md) requires for demo safety anyway. Adding `ANTHROPIC_API_KEY` sends cache misses live. Adding `DATABASE_URL` switches the event store from the file-backed adapter to Postgres.

```bash
npm run gauntlet     # all 18 cells plus the attacks-on-us panel, and the fund
npm run eval         # separation over 70 labeled merchants, derives the tier bands
npm run loop         # the self-improving loop, end to end
npm test             # scorecard purity, replay determinism, ledger reconciliation
```

## Measured

Numbers from the committed artifacts in `config/runs/`, not from intent.

| | |
|---|---|
| 18-cell gauntlet | 12 caught, 5 escalated, 1 paid out. **Zero cleared silently** |
| Labeled set | 70 merchants. **Zero fraud missed** |
| Per-class recall floor | **Passes on all 18 attack classes** |
| Tier bands | Derived at **902 / 800 / 725**, replacing the 900 / 700 / 550 placeholders |
| Latency per file | 2 to 6 s live, 9 s worst. Target is 30 s |
| Cached full board | 0.1 s, which is the demo-safe path |
| Guarantee fund | Trial balance **reconciles**. The run fails if it does not |
| Self-improving loop | 970 clear, paid out, then **605 decline** on the same attack |

The escalation rate is 32.9%, driven by thin-file cold merchants against a $25 default tolerance. That is the treatment [docs/UNDERWRITING.md](docs/UNDERWRITING.md) section 6 specifies, and the tolerance is the dial.

---

## Honest labels

Stated here for the same reason they are stated on stage. Saying so costs nothing and buys everything.

- The **guarantee fund is simulated.** It is a real reconciled double-entry ledger, and the arithmetic balances, but no money is real.
- The **fulfillment oracle is simulated,** with real state transitions.
- **Pillar 4 is 15% of the score and runs on seeded registry data** today.
- The labeled persona set validates **ranking, not absolute probability.** 40 to 60 self-authored personas can demonstrate separation. They cannot calibrate a price. `PD(score)` is a stated prior from published card-industry fraud rates by band, not a curve fitted to our own eval set.
- **No real UCP or ACP network integration.** The internal API is ACP-shaped.

---

## Repository map

| Path | What lives there | Owner in the team split |
|---|---|---|
| `src/contracts/` | Shared types. No logic. Everyone reads this, nobody else changes it | Launch Lead |
| `src/engine/` | Checks, hard gates, scorecard, pricing, escalation policy | Launch Lead |
| `src/ledger/` | Double-entry ledger, fulfillment oracle, claims and payouts | Launch Lead |
| `src/merchants/` | Persona schema, scripted personas, the LLM-driven arena simulator | Hacker 2 |
| `app/` | Gauntlet board, adjudication card, streaming | Hacker 3 |
| `src/evalh/`, `src/arena/` | Eval harness, separation view, per-class floors, arena gating | Hacker 4 |
| `src/mcp/`, `skill/` | The MCP server and the packaged agent skill | Launch Lead |
| `config/` | Versioned scorecards, check manifests, pricing tables, personas | Everyone, append-only |

Module boundaries and the full data model are in [ARCHITECTURE.md](ARCHITECTURE.md). Someone can own one module without reading the others.

---

## Documentation

| Document | What it settles |
|---|---|
| [docs/STRATEGY.md](docs/STRATEGY.md) | Locked decisions, demo shape, scope, both pitches, launch checklist |
| [docs/UNDERWRITING.md](docs/UNDERWRITING.md) | Six-pillar methodology, cold and bonded modes, scoring, pricing, claims |
| [docs/TAXONOMY.md](docs/TAXONOMY.md) | 23 numbered fraud entries |
| [docs/EVIDENCE.md](docs/EVIDENCE.md) | Every sourced claim, and what each source does not support |
| [docs/PLATFORM.md](docs/PLATFORM.md) | Extensibility, the self-improving loop, the integration surface, runtime rules |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module boundaries, data model, API routes, streaming, replay |
| [STATUS.md](STATUS.md) | Current build state and every judgment call made along the way |

---

## What is public and what is not

Publishing the taxonomy is the point, and in an open-source build the check manifest is readable anyway. So the honest line is not "we hide the rubric" but "only two things depend on staying unknown, and those are the two we keep out."

**Public:** the taxonomy, the methodology, the pillar structure, the reason-code vocabulary, the tier bands and the separation curve that produced them, the pricing formula, and the check point values.

**Not in this repository:** the canary strings and the holdout question set. Both live in environment configuration. [`.env.example`](.env.example) ships obviously fake values to show the shape.

Because the rubric is public, the defense against optimizing against it is not secrecy. It is the holdout set and the unannounced re-audit: a merchant that tuned to a published scorecard still has not seen the questions reserved for after approval.

---

## Attribution

Built by the Clearhouse team at **Sundai Hack 136**, hosted with Citable and the HBS Founder Lab.

Licensed under the MIT License. See [LICENSE](LICENSE).
