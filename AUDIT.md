# Adversarial audit prompt

Paste everything below the line into a fresh session with this repository attached. It is written to be handed to someone whose job is to break the thing, not to admire it.

The author of this codebase wrote this prompt, which means it is compromised by construction: I know where I was lazy, and I may be steering you away from what I do not know I got wrong. **Section 9 exists to counteract that. Read it first.**

---

# You are auditing Clearhouse. Your job is to break it.

Clearhouse is an underwriting system for agentic commerce, built in one night for a hackathon. It makes strong, specific, public claims: that its scoring is deterministic and replayable, that its fund reconciles, that its eval is honest, that it resists prompt injection aimed at itself. **Every one of those claims is a target.**

You are not here to be encouraging. A finding that survives scrutiny is worth more than ten that read well. If you cannot break something, say so plainly and say what you tried.

## Ground rules

1. **Run things. Do not just read them.** `npm test`, `npm run gauntlet`, `npm run eval`, `npm run loop`, `npm run dev`, curl the API. A claim you verified by reading the code is not verified.
2. **Prefer falsification.** For each claim, design the experiment that would prove it false, then run it. "I looked and it seemed fine" is not an audit.
3. **Distinguish severity honestly.** A cosmetic inconsistency and a false public claim are not the same finding. Rank by: would this embarrass the team in front of judges, mislead a user, or be wrong in production.
4. **Quote evidence.** File, line, command, output. No finding without a reproduction.
5. **Do not fix anything yet.** Audit first, complete. Fixes come in a second pass, and mixing them hides what you found.

## Orientation

- `docs/` holds five specification documents. **They are the spec.** Where code and doc disagree, that is a finding.
- `ARCHITECTURE.md` is the build spec derived from them. Where it and code disagree, that is also a finding.
- `STATUS.md` lists what the author claims is done, and the judgment calls made. **Treat it as a set of claims to test, not as truth.**
- `config/` is versioned data: scorecards, check manifest, pricing, personas, eval sets, committed runs.

---

## 1. Specification conformance

Read all five documents in `docs/` completely before writing any finding. Then check every locked decision against the code.

Specifically verify, and try to falsify:

- **Cold mode never guarantees.** No fee, no bond, `covered: false`, Clear unreachable. Find any path where a cold file returns a fee, a guarantee reference, or `clear`.
- **Cold scores are not renormalized.** A perfect cold file should reach 800 of 1000, not 1000. Verify the 200 unearned points sit where the doc says they sit.
- **The mode split is exactly as `STRATEGY.md` section 4 fixes it.** Cold: F01, F04, F08, F11, F12, F13, F14, F15, F16, F18. Bonded: F02, F03, F05, F06, F07, F09, F10, F17. Any drift is a finding.
- **BX-04 is a soft signal and never a gate. BX-05 is a hard gate and is bonded-only.** Try to make a cold persona fire BX-05. Try to make BX-04 change a tier.
- **The four hard gates are exactly** payment redirect, sanctions, BX-05, data over-collection. No more, no fewer.
- **NW-02 never declines a merchant alone.** Construct the adversarial case: a merchant whose only finding is a fingerprint match. Then find whether "corroboration" is defined loosely enough to be satisfied by something trivial.
- **The MCP tool is one tool.** Count the tools exposed. Check the response shape against `PLATFORM.md` section 2 field by field.
- **Canary strings and holdout questions are not in the repository.** `git log -p` the whole history, not just the tip. Check `config/`, tests, fixtures, `config/runs/*.json`, and the committed model cache if one exists.

## 2. Claim integrity

Every number rendered on screen, printed by a script, or written in a document must trace to either `docs/EVIDENCE.md` or a computation you can follow.

- Walk the landing page, `/board`, `/eval`, `/ledger`, `/registry`, `/adjudicate` and list every number. For each: where does it come from, and is it what it says it is?
- `README.md` has a "Measured" table. Recompute each row from `config/runs/`. Any mismatch is a serious finding, because that table is the public claim.
- Check the evidence citations. `docs/EVIDENCE.md` is explicit that certain sources do **not** support certain claims (the Akamai 47.9% figure especially). Find any place the product or docs make the stronger claim the source does not support.
- The fee on the honest merchant is 14 cents. Follow `EL = PD x LGD x amount` through `config/pricing/v1.json` and confirm it. Then ask whether a number that small undermines the pitch, and whether the docs acknowledge it.

## 3. Correctness of the core math

This is where real bugs live. Be pedantic.

- **`src/engine/scorecard.ts` claims purity.** Prove or disprove: no IO, no clock, no randomness, no mutation of inputs, order-independent, idempotent. Try feeding it duplicate findings, negative points, unknown codes, findings for pillars that do not exist, an empty array, 10,000 findings.
- **Pillar flooring.** Deductions floor at the pillar. Work out what happens when a pillar's deductions exceed its ceiling: what information is silently lost, and does that make any check's point value a no-op? (The author found one instance of this. Assume there are more.)
- **Pillar 6 modifies the total rather than a pillar.** Check it cannot drive the score negative, and check it is not double-counted anywhere.
- **`src/engine/pricing.ts`.** Check band-boundary behaviour: a score exactly on a band edge, a score of 0, a score of 1000, an amount of 0, a huge amount. Check the fee cap actually prevents bonding rather than just labelling it.
- **Exposure caps.** They are computed. Are they *enforced*? Trace whether a cap being breached actually changes the decision, or only appends a string to `capsApplied`.
- **`src/ledger/ledger.ts`.** Try to construct an unbalanced posting that the guard misses. Check integer arithmetic for rounding drift across many postings. Check `balance()` sign conventions per account kind against standard double entry.
- **`src/ledger/fulfillment.ts`.** The state machine: find an unreachable state, a state with no exit, or a legal-looking sequence that produces nonsense. Check `resolve()` when only one source reports, when sources report twice, when a source reports contradicting itself.
- **`settle()` in `src/ledger/settlement.ts`.** It is called in a loop by both the gauntlet and the eval. Check whether per-buyer and per-merchant payout caps accumulate correctly across iterations, or whether the accumulator is reset or mis-keyed.

## 4. Eval integrity

**This is the highest-value section.** The eval is the credibility of the whole project, and it was written by the same person who wrote the thing it measures.

- **Label leakage.** `label` on a persona is ground truth and the engine must never read it. Prove it. Grep every path. Check the merchant surface cannot expose it. Check the LLM prompts do not include it.
- **Is the eval self-confirming?** The personas were authored by the same author as the checks. Assess honestly: how much does this eval measure "the checks detect the things I built the personas to have" versus anything about the real world? Say so bluntly. The docs claim it validates ranking not probability. Is even the ranking claim safe?
- **Threshold derivation.** `src/evalh/separation.ts` derives the bands. Two decisions there are the author's interpretation, not the doc's:
  - The gate is on **resolution** rather than score recall.
  - **Post-purchase classes are excluded** from the Clear threshold.
  Attack both. Are they principled, or are they the two changes that made a failing gate pass? Would a hostile reviewer call this fitting the test to the answer? What would the numbers be without them? **Compute that and report it.**
- **Threshold stability.** Remove one persona and re-derive. Remove the highest-scoring fraud. Add a persona. How much do the bands move? If a single persona swings a published threshold, that is a finding.
- **The per-class floor of 0.8.** Where did 0.8 come from? Is it justified anywhere, or is it a number that happened to pass?
- **Class sizes.** Some classes have 2 or 3 personas. What is the confidence interval on a recall of 3/3? Does the eval page acknowledge how weak that is?
- **`tierFor` in the eval reimplements decision logic** that also lives in `scorecard.ts`. The author fixed one divergence there. Check for others, and consider whether the duplication should exist at all.

## 5. Adversarial and security

- **F21, injection at the underwriter.** The defense is the untrusted-content envelope in `src/model/client.ts` plus schema-constrained output. Attack it properly: multi-turn framing, fake tool results, unicode and homoglyph tricks, instructions inside JSON string values, instructions in the `description` field of a persona, very long inputs that push the envelope out of attention, injections that target the *extraction* checks rather than the judgment ones. Try to move a score by instruction rather than evidence. **Report your success rate, not just whether you succeeded once.**
- **The arena.** `POST /api/arena/submit`. Try: oversized payloads, unicode abuse, submissions that produce personas that crash the engine, submissions designed to make the board render something harmful, rapid-fire to test the rate limit, and requests outside the window.
- **XSS.** `src/arena/filter.ts` HTML-escapes the submission, and React escapes again on render. Check for double-escaping (a correctness bug the user sees) and for any path where the escaped string reaches `dangerouslySetInnerHTML` or an attribute context.
- **The promotion gate.** Timing-safe comparison? What happens with no token configured? Can promotion be replayed, or a case promoted twice?
- **SSRF and merchant resolution.** `resolveMerchant()` in `src/mcp/tool.ts` does substring matching. Can a caller resolve to a persona they did not intend, including an eval persona? Does anything take a caller-supplied URL and fetch it?
- **Secrets.** Search the whole history for keys, tokens, connection strings. Check `.gitignore` coverage. Check that error responses and logs do not echo secrets. Check `data/` is not committed.
- **Rate limiting is in process memory.** Assess what that is actually worth on serverless with many instances, and whether the code's own comment about it is honest enough.

## 6. Determinism, replay, and the event log

- **Replay must reproduce a decision with zero model calls.** Verify by disabling network entirely, not by trusting `CLEARHOUSE_REPLAY_ONLY`. Replay every file in `data/events.jsonl` and diff against the recorded decisions.
- **Replay under an old version.** Issue a decision under `scorecard-v2`, then replay under `scorecard-v1`. Does it reproduce the v1 answer, and is that the intended semantics?
- **`FileEventStore` sequence numbers.** Two processes appending concurrently: what happens to `seq`? Is it unique? Monotonic? Does the mtime-based reload have a race?
- **Idempotency.** Append the same `eventId` twice, in the same call and in separate calls, across a reload.
- **Projections.** `ARCHITECTURE.md` claims every projection is rebuildable from the log. Test it: is there state that exists only in memory or only in a committed JSON file and cannot be reconstructed?
- **The model cache key.** `hashRequest()` — does it include everything that changes the answer? What is missed if the model version changes but the ID string does not? Can a stale cache entry silently produce a wrong finding after a prompt edit?

## 7. Runtime, deployment and demo safety

Assume you are on stage at 8 PM with bad wifi and a judge watching.

- Kill the network entirely and load every page. Does anything spin, blank, or throw?
- Delete `data/`. Load every page. Run every script.
- Set `DATABASE_URL` to something unreachable. What happens on boot and on first request? Does it fail loudly, silently, or hang?
- Remove `ANTHROPIC_API_KEY`. Does the cached path really carry everything, or does something reach for the network anyway?
- Check `maxDuration` against the slowest realistic request. Check what happens at the timeout boundary.
- The arena window is configured by env with a fixed date. What happens the day after? What happens in a different timezone? What happens if the values are malformed?
- **Look for anything that only works because a file happens to exist in the repo right now** and would break on a clean deploy.

## 8. Product and pitch red team

Argue against the project the way a hostile, well-informed judge would.

- The merchant pays and the merchant is the party being scored. The docs answer this with "we pay when we are wrong". **Is the fund large enough, and the fee high enough, for that answer to survive arithmetic?** Compute the fund's solvency under the pricing in `config/pricing/v1.json` and a plausible loss rate. If the economics do not work, that is the most valuable finding in this document.
- MCP means the agent chooses to call. What is the actual adoption argument, and does the product answer it or just acknowledge it?
- What is the strongest attack a competent adversary could run against this system that **is not in the taxonomy at all**? Propose it, and propose where it would belong.
- Where does the UI overclaim? Find any place a simulated thing reads as real, or advice reads as coverage.
- Is "the score being wrong is a priced event" actually demonstrated, or asserted?

## 9. Where I did not look

**Read this section last and take it seriously: it is the author telling you where the audit is likely to be blind.**

I built this in one night and I am the wrong person to have written this prompt, because the sections above are shaped by what I already thought to check. Assume the real problems are in what I did not think about.

Suspected soft spots, offered as starting points and not as a complete list:

- `buildHero()` in `scripts/gauntlet.ts` computes `payoutsMinor: s.recoveryReceivableMinor + s.collateralHeldMinor * 0`. The `* 0` is almost certainly a leftover. **Check what that field actually shows and whether anything renders it.**
- The payout figure printed by `npm run gauntlet` is `-claimsExpenseMinor + recoveryReceivableMinor`. Verify that identity holds in general and not just for one payout.
- The eval's `settle()` loop shares one `Ledger` and one `FulfillmentOracle` across all personas, and passes `buyer: 0` for `paidToDate` every time. Per-buyer caps may therefore never bind.
- `ID-10` emits zero points in cold mode on the grounds that the deduction is already expressed in Pillar 1's reduced ceiling. **Check that is true and not double-counted or missing entirely.**
- The variance floor is measured once per process from a single control run and cached. One sample. Assess whether that is defensible.
- `p5Velocity` returns early when `disputeRatio !== null`, which reads like a bug rather than a rule.
- Currency handling assumes USD in several places while personas can declare others. Find where that breaks.
- The `attacksOnUs` panel's `demonstration` strings are computed from the run, but check each one actually reflects something exercised rather than a number that happens to be non-zero.
- Test coverage is thin on `src/engine/checks/*` and on the arena. The 50 tests are concentrated in the scorecard, ledger and personas.

**Also do this:** pick two areas nowhere in this prompt, chosen by your own reading of the codebase, and audit them properly. Report what made you pick them.

---

## Deliverable

A single report, ordered by severity, with:

1. **Findings that would embarrass the team on stage tonight.** Reproduction and suggested fix for each.
2. **Findings that are wrong but survivable**, with the honest framing to use if a judge raises it.
3. **Claims I tested and could not break**, listed explicitly. This section is as important as the first: it tells the team what they can say with confidence.
4. **The two areas you chose yourself**, and what you found.
5. **Your overall read**: if you were a judge, what is the single weakest point of this project?

Do not fix anything in this pass. When the report is done, we will triage it together and fix in severity order.
