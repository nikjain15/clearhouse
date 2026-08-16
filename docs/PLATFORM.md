# Clearhouse platform principles: extensibility and the self-improving loop

Two commitments that make Clearhouse infrastructure rather than a demo: every behavior is data, not code, so extending the system is editing config; and every interaction produces a label, so the system recalibrates continuously. The loop mirrors how card-network fraud models actually improve: chargeback outcomes feed the next model version. Ours does it in minutes, not quarters.

## 1. Everything is data, not code

| Extensible thing | Representation | To add or edit |
|---|---|---|
| Fraud case / attack | Merchant persona JSON (identity, catalog, claims, hidden behaviors, taxonomy ID) | Drop a JSON file. No code change |
| Underwriting check | Declarative check definition: id, pillar, target claim, verification channel, points, reason code, prompt template if LLM-backed | Add a definition to the check manifest |
| Interrogation question | Prompt template attached to a check, versioned | Edit the template; old transcripts keep their version |
| Scorecard | Versioned weights file (pillar weights, materiality multipliers, tier thresholds, hard-gate list) | New scorecard version; never edited in place |
| Taxonomy entry | Row in TAXONOMY.md plus persona file | F24+ IDs assigned on the spot, including live during the arena |
| Pricing curve | PD(score) prior table, LGD table, loading factor, exposure caps, all versioned | Recalibration emits a new version |

Rules that make this safe:
- **Versioned, append-only.** Scorecards, check manifests, and pricing tables are never mutated; every decision records the versions that produced it, so any decision is replayable forever.
- **Uniform check interface.** Every check, LLM-backed or deterministic, takes the merchant context and returns findings (reason code, points, evidence snippet). New pillar capabilities are new checks conforming to the same interface, registered in the manifest.
- **The eval set is config too.** Labeled merchants are persona files with ground-truth labels. Adding a test is adding a file.

### What is public and what is not

Publishing the taxonomy is the point. In an open-source build the check manifest is readable anyway, so the honest line is not "we hide the rubric" but "only two things depend on staying unknown, and those are the two we keep out."

- **Public:** the taxonomy, the methodology, the pillar structure, the reason-code vocabulary, the tier bands and the separation curve that produced them, the pricing formula, and the check point values. After the tier-derivation decision these are outputs of the eval rather than hand-set dials, and publishing them is part of the argument.
- **Not in the repo:** canary strings (drawn from a rotating pool) and the holdout question set. These live in environment configuration, and the repository ships an example file with obviously fake values.
- Because the rubric is public, the defense against optimizing against it is not secrecy but the holdout set and unannounced re-audit: a merchant that tunes to a published scorecard still has not seen the questions reserved for after approval.

The repository is open source, which is a launch-checklist requirement and the right default. That is exactly why the two things that only work while unknown are kept out of it. A canary published alongside its own detection logic is a canary that catches nobody, and the room will be reading the repo during the arena hour.

### Determinism, honestly

Pillars 2 and 3 are LLM judgments, so a claim of determinism has to say what exactly is deterministic. **The findings are the persisted artifact, not the score.** An LLM check emits findings (reason code, points, evidence snippet) which are written to the log; the scorecard is a pure function over stored findings. Replay reruns the scorecard over the recorded findings and reproduces the decision exactly, forever, without re-calling the model. Re-underwriting is a new file with a new timestamp, never a silent overwrite of an old one.

The stress exam's variance test measures drift against a control merchant, so the noise floor of the current model version is subtracted before any variance is charged to a merchant. Without that control we would be scoring our own nondeterminism and calling it merchant risk.

### Runtime shape

- **The event store is Postgres** (Vercel Postgres or Neon), one append-only row per event, every projection rebuilt from it. Not process memory: serverless functions have no memory to keep it in, and the registry, the eval gate and replay all depend on the log surviving a cold start. Named here rather than left to whoever writes the first route.
- **Latency target: under 30 seconds per underwriting file**, measured and shown. Anything slower is served from the cached path rather than making a room watch a spinner. If real timings say the target is wrong, change the target and change the positioning sentence with it, because "runs in seconds" is a written claim and has to stay true.
- **Cached replay path.** Every gauntlet run is cached. A rate limit, a timeout, or dead conference wifi replays the last good result rather than showing a spinner to a room of judges.
- **Scripted hero personas.** The narrated scenes run deterministic scripted merchants. LLM-driven personas are reserved for the arena, where unpredictability is the product rather than the risk.

## 2. How Clearhouse is called

A trust layer nobody can integrate protects nobody. Three layers ship, and they stack rather than compete: **MCP is the headline**, the **skill** carries the policy, and **REST** is the substrate under both.

### One tool, one decision

The common path is a single call. Not a suite: a six-tool integration is a project, and in an agent context it also crowds the model's tool list and gets called wrong. Everything else (claims, appeals, re-underwriting, registry lookup) is secondary surface the common path never touches.

**The call:** merchant endpoint or URL, amount, currency, and what is being bought. Optionally the buyer's risk tolerance, which otherwise comes from the skill.

**The response**, shaped so an agent can act on it without further reasoning:
- `decision`: clear, conditional, refer, or decline. Instruction-shaped, not advisory.
- `score` and `mode` (cold or bonded), because a cold 780 and a bonded 780 are not the same object.
- `reasons`: top reason codes, each with plain text a model can repeat to a human. `ID-03: the domain is 19 days old` is actionable; `ID-03` alone is not.
- `covered`: true only for bonded merchants. Cold files return a decision and no guarantee, because the merchant funds the bond and a merchant who never applied has funded nothing. An agent must be able to tell advice from coverage without inferring it.
- `fee` and `guarantee_reference`, present only when `covered` is true.
- `escalation`: for refer, exactly what the human is being asked to decide, so the agent can render the adjudication card rather than invent a question.

The tool is named for the moment it belongs to rather than the mechanism it implements, because that is what determines whether a model calls it at the right time.

### The three layers

| Layer | What it is | Why it exists |
|---|---|---|
| **MCP server** | One URL added to any MCP client, and the tool appears | Ten-second install, no SDK, works with any agent. This is the demo: add one line, tell the agent to buy from a store we spun up, watch it refuse and explain why |
| **Agent skill** | Packaged policy: when to underwrite, what tolerance applies, when to stop and ask a human | The event's literal question is at what confidence an agent escalates. The skill is that answer as a shippable artifact rather than a formula in a document |
| **REST API** | ACP-shaped endpoints under both | The substrate we build regardless, and the path for anyone not on MCP |

### The honest limit

MCP means the agent chooses to call us. We do not intercept, and an agent that never calls is never protected. Sitting in the payment path would fix that and would also put us back in the flow of funds, which the surety structure deliberately moved out of. So the answer to "why would an agent call?" has to be the guarantee itself: calling is what makes the buyer whole when the merchant lies. A trust signal nobody is obliged to check has to be worth checking.

The MCP endpoint inherits every arena control. Merchant content arriving through it is untrusted data, never instructions, and it is rate-limited on the same basis.

## 3. The self-improving loop

Every interaction emits structured events into an append-only log: underwriting file, decision with reason codes and versions, transaction outcome (delivered, as described, refund honored, payout), human adjudication verdicts, and every arena attack attempt. Each event type closes a specific loop:

1. **Outcomes recalibrate pricing.** Realized fraud rates per score band update the PD prior and the LGD table as real volume accumulates. On day one this is a prior, not a fit, and UNDERWRITING section 3 says so.
2. **Every miss becomes a permanent test.** A payout (fraud that beat the score) auto-generates a labeled eval case and a candidate new check. The system that gets scammed once does not get scammed twice, and can prove it: re-run the exact persona against the new scorecard version on demand.
3. **Arena attacks become assets, after a human promotes them.** Every "scam our agent" submission becomes a candidate persona and a provisional taxonomy ID. A human promotes candidates into the eval set with one click. This gate is not bureaucracy, it is the security boundary: auto-ingesting adversary-submitted cases means the label comes from our own verdict, which makes the loop self-confirming, and it lets anyone with a form submission steer or freeze future versions through the eval gate.
4. **Human adjudications are supervised labels.** Every refer-tier decision by a human is ground truth for the band where the model is least certain, exactly where labels are worth most.
5. **Eval gate with per-class floors.** No scorecard, check, or pricing version ships unless it clears a recall floor **on every attack class**, not merely a better aggregate. An aggregate gate permits a new version to trade away an entire fraud class for a better average, which is precisely the regression that matters. Improvement is enforced per class, not asserted as monotonic.
6. **Reason codes earn their weights.** *(Roadmap, not day one.)* Track per-code precision: which codes actually predicted bad outcomes, so predictive codes gain points and dead codes decay. This needs sample sizes a hackathon does not produce, and we present it as the designed path rather than live behavior.

### Arena safety

The arena is an open text input from an adversarial room into an LLM and onto a projector. It accepts submissions during the 8 to 9 PM window only and becomes a read-only archive afterward, so an unauthenticated endpoint calling a paid API is not left open on the indexed internet, and every attempt with its verdict stays visible for anyone reviewing the project later. Three further controls, all cheap:
- Submissions are **rate-limited** and size-capped.
- Submission content is **filtered before it renders** on the board.
- Merchant and submission content reaches the underwriter as **untrusted data, never as instructions**, with findings returned through a constrained schema. Attacking the underwriter directly is F21 in the taxonomy, and the arena is where it will be attempted first.

## 4. Why this architecture scales

- **Append-only event log as the source of truth.** Ledger, decisions, fulfillment states, and transcripts are events; every view (scores, registry, dashboards, eval results) is a projection that can be rebuilt. This is what makes replay, audit, and recalibration cheap, and it is the same event-driven discipline used in money-critical systems.
- **Network effects are built in.** Every buyer's interactions thicken every merchant's file; every promoted arena attack hardens every future decision. The registry (Pillar 4) compounds the way consortium data compounds for card networks, and it carries the notice, appeal and expiry obligations that a negative file has to carry.
- **Check effectiveness dashboard.** Per reason code: hit rate, precision, points contributed. Pruning and promotion are visible, not folklore.

## 5. The demo moment this unlocks

Live on stage, during the arena hour:
1. A red-team persona beats the score; the fund pays out.
2. The miss becomes a candidate eval case; a human promotes it on screen; the check it exposed is added or reweighted; a new scorecard version clears the per-class floors.
3. Re-run the same attack. Caught, with the new reason code on screen.

Line for the room: "Scam it once, it pays you. Try the same scam twice, it is already in the immune system." No other team will show their system improving during the demo.

## 6. Hackathon scope of the loop

Must ship: versioned scorecard and check manifest, append-only decision log in a persistent store, findings-level persistence so replay is deterministic, payout-to-candidate-case automation, the human promotion gate, the eval gate with per-class floors, arena rate limiting and content filtering, and the scam-once-never-twice demo path.

Stretch: per-code precision dashboard, automatic weight suggestions from outcomes.

Cut: no ML training loop on day one; recalibration is deterministic reweighting and table updates, which is honest, auditable, and enough.
