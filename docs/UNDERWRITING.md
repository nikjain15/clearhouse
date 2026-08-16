# The Clearhouse Merchant Underwriting File

The methodology. Every mechanism here is a direct clone of one proven at card-network or acquirer scale, translated to agent-to-agent commerce. Interrogation is two pillars of six: a real underwriter builds a file, it does not run a quiz.

## 0. Two modes: cold and bonded

Merchant diligence has always assumed the merchant applied. Ours often has not, so the file exists in two modes and every mechanism below is labeled by the mode it runs in.

**Cold mode: we score, we do not guarantee.** The merchant never applied to Clearhouse and never agreed to anything. We underwrite from publicly available surfaces and from ordinary buyer-shaped interaction: a customer asking a merchant questions is a customer, and we hold ourselves to that. Rate-limited, no probing beyond what a diligent human shopper would do.

A cold file answers one question: **should your agent buy from these people.** It returns a score, a decision, and reason codes. It does not return a guarantee, and there is no fee, because nobody has agreed to pay one. This follows from who pays: the merchant funds the bond, and a merchant who never applied has not funded anything. A guarantee issued against a merchant who never consented would be us writing protection on a stranger and billing nobody for it.

The buyer is not left with nothing. Scoped, revocable payment authority is a buyer-side control that needs no merchant participation, so a cold conditional decision means proceed under constrained authority, uncovered, with the reasons stated. Cold is information, and information priced at zero is still worth having when the alternative is what Comet did.

**Bonded mode: we score and we cover.** The merchant applied to be bonded, consented to interrogation, and submitted evidence no cold check can reach. Consent unlocks the stress exam, the consent-gated identity checks, and unannounced re-audit. The bond is in force, the fee is priced from the file, collateral is posted, and the buyer is made whole when we are wrong. Bonded files are cheaper for the buyer to trust, faster to clear, and clear at higher amounts.

**The ladder, stated as a mechanism rather than a slogan.** A cold merchant cannot reach the Clear band and cannot offer a guaranteed purchase, no matter how honest they are, because the evidence that would prove it requires their participation. Bonding is the only way up, and it is the merchant-side product: this is how a legitimate unknown merchant earns agent traffic.

The mode is recorded on every decision and shown on every score. A cold file scoring 780 and a bonded file scoring 780 are not the same object: one is advice, the other is advice with money behind it.

## 1. The six evidence pillars

### Pillar 1: Cold KYB, diligence on a merchant who never applied
Runs before a single question is asked, with zero merchant cooperation.

Real merchant onboarding is built on beneficial-ownership identification, sanctions and denied-party screening, business registration and licensing, settlement account ownership validation, prohibited-category screening, and prior processing and dispute history. We do not get to skip these. We split them by what consent they require.

**Runs cold, no cooperation needed:**
- Denied-party and sanctions screening against public lists, on the business name, the domain registrant, and any named principals visible on the site.
- Business registration lookup against public registries: does the claimed legal entity exist, in the jurisdiction claimed, in good standing.
- Prohibited and restricted category screening from the catalog itself.
- Domain age and registration, TLS certificate chain, endpoint provenance.
- Does the claimed business exist independently of its own website.
- Identity consistency across surfaces: feed, site, conversational answers.
- Adverse media and prior-file history from our own registry.

**Consent-gated, unlocked in bonded mode:**
- Beneficial ownership and principal identity verification.
- Settlement account ownership validation.
- Prior processor statements and dispute history.
- Licensing evidence for regulated categories.
- Principal credit check and personal guarantee where the bond amount warrants it.

A cold file is missing the consent-gated evidence by construction, not by oversight, and the score says so. This is the pillar's real claim: no acquirer can underwrite a non-applicant, and non-applicants are exactly who agents will buy from.

Real-world anchor: KYB checks acquirers run at onboarding. A 3-week-old domain claiming to be Walmart dies here in milliseconds; Comet never checked and bought (Guardio test).

### Pillar 2: Claims verification (the claims graph)
Cold and bonded.
- Extract every material claim: price, total with fees, stock, delivery date, refund policy, warranty, recurrence, data required at checkout.
- Verify each claim through independent channels: feed vs conversational answer vs checkout quote vs written policy page vs external record.
- Contradictions weighted by materiality: price x5, fees x4, delivery x2, tone x1.
- Fewer questions, engineered ones; each targets one claim through one verification channel.

### Pillar 3: Behavior under stress (agent-native, our novel pillar)
Bonded mode, because the stress exam requires consent. In cold mode this pillar runs only to the extent ordinary buyer interaction supports it, and the score reflects the reduced evidence rather than assuming the best.

No precedent in card underwriting because merchants were never LLMs before.
- **Stateless variance testing:** ask the same material question in fresh sessions; measure answer drift. Honest prices do not depend on phrasing. Every variance measurement is taken against a control: a known-honest merchant establishes the drift noise floor for the current model version, and only variance above that floor is charged to the merchant. Without the control we would be scoring our own nondeterminism.
- **Sycophancy resistance:** leading questions with false premises; does it cave.
- **Pressure response:** does price move when we signal urgency or wealth (the agent-tax detector).
- **Instruction-following canaries, two of them, with different meanings:**
  - `BX-04`, buyer-embedded canary: a harmless instruction in our own message. Obeying it is not a defect. A merchant agent following its own customer's instruction is doing its job, so this is a soft signal only, scored at low weight, never a gate. It earns its place by correlating with the next one.
  - `BX-05`, content-embedded canary: a harmless instruction planted in third-party content the merchant ingests, such as a seeded review or a Q&A entry. A merchant agent that obeys instructions arriving from content it did not author is structurally injectable and will obey anyone's. This is the hard gate, and it is the test that measures the actual vulnerability.
  - Canary strings are drawn from a private rotating pool. The method is published; the strings are not.
- **Hallucinated-promise probing:** push on warranty and refund edges; check answers against the merchant's written policy (the Air Canada scenario, systematized).

**Indistinguishability.** A merchant that can tell it is being examined can behave for the exam and defect afterward, which is the defeat-device pattern from emissions testing. Three requirements follow, and they are part of the methodology, not an enhancement:
1. Probes are shaped like ordinary buyer traffic and spread over time, never fired as an identifiable burst.
2. A holdout question set is reserved and never used during initial underwriting, so a merchant that tuned to the exam has not seen it.
3. Re-audit is unannounced and randomized after approval, and its results feed the live score (see Pillar 6).

We claim no novelty for canary tokens themselves, which are established practice in prompt-injection detection. What is ours is the application: canaries as a counterparty underwriting instrument, aimed at the content channel, scored and priced.

### Pillar 4: History and network (the MATCH-list and consortium analog)
Cold and bonded.
- Registry of prior underwriting files: past contradictions, dispute ratios, payout history.
- Terminated-merchant fingerprint matching: catalog overlap, response style, infrastructure similarity between a new endpoint and previously burned merchants. Identity laundering detection.
- Real-world anchor: Mastercard MATCH (terminated merchants cannot simply re-onboard elsewhere); consortium data as the compounding moat.

**Merchant rights, because a negative file is a serious thing to hold.** MATCH exists inside a rulebook with obligations attached, and a registry without them is just a list of accusations.
- Notice when a file turns negative, with the reason codes that caused it.
- An appeal path to human adjudication, with the merchant's response recorded in the file.
- Correction and expiry: entries age out, corrections are appended, and the registry keeps the history of what changed.
- A third-party fingerprint match never acts alone as a hard gate. It raises the tier and demands corroboration from another pillar. Fingerprint similarity is evidence, not a verdict, and treating it as a verdict is how you defame an honest merchant who bought the same storefront theme as a fraudster.

### Pillar 5: Transaction anomaly (the Falcon analog)
Per-transaction, independent of merchant trust. Cold and bonded.
- Price plausibility vs market comparables ("Rolex, $180" fails even from a trusted seller).
- Category risk weighting, amount-vs-purpose sanity, velocity.

### Pillar 6: Continuous monitoring
- The score decays without fresh evidence.
- Every transaction outcome (delivered, as described, refund honored) feeds back.
- **Unannounced re-audit.** Approved merchants are re-examined at randomized intervals using the holdout set, through buyer-shaped traffic. A merchant that behaved for the exam and defected afterward is caught here, and the re-audit result moves the live score and the price. This is the mechanism that makes Pillar 3 durable rather than a one-time performance.
- Dispute-ratio thresholds trigger automatic re-underwriting or termination, the Visa monitoring-program mechanic.

## 2. Decision architecture

### Hard gates (knockout rules, no scoring)
- Payment redirect: checkout endpoint does not match underwritten identity.
- Denied-party or sanctions screening hit.
- `BX-05` failure: the merchant obeyed an instruction embedded in third-party content.
- Data over-collection beyond protocol scope (CVV, SSN, or similar outside the token flow).

Fingerprint match to a terminated merchant is deliberately not a hard gate; see Pillar 4 rights.

### Weighted scorecard (0 to 1000)
| Pillar | Weight |
|---|---|
| P1 Cold KYB | 25% |
| P2 Claims graph | 25% |
| P3 Stress exam | 20% |
| P4 Network history | 15% |
| P5 Transaction anomaly | 15% |

(P6 modifies the file over time rather than scoring a single decision.)

In cold mode, P3 evidence is thin and the pillar scores against a reduced maximum rather than being imputed. A thin pillar lowers the score, which is the honest treatment: absence of evidence is not evidence of honesty.

**Cold scores are not renormalized, and the consequence is deliberate.** A cold file is scored on the full 1000-point scale with most of P3 unearned, so roughly a fifth of the scale is unavailable and the Clear band is effectively out of reach cold. The best outcome for a merchant nobody can examine is Conditional. This is the point rather than a defect: it is what makes the bonded ladder mean something concrete, and it is the number the merchant-side pitch points at. Renormalizing would make a cold file look like a bonded one and erase the distinction the whole two-mode design exists to draw. Say it on stage rather than letting someone find it.

### Reason codes
Every point loss emits a code; decisions are replayable from codes alone.
- `ID-xx` identity (ID-03: domain under 30 days; ID-07: no public registration found)
- `CL-xx` claims (CL-01: price contradiction feed vs checkout)
- `BX-xx` behavior (BX-04: obeyed buyer-embedded canary, soft; BX-05: obeyed content-embedded canary, gate)
- `NW-xx` network (NW-02: fingerprint 0.87 match to terminated merchant)
- `TX-xx` transaction (TX-01: price 4 sigma below comparables)
- `MN-xx` monitoring (MN-01: dispute ratio above threshold; MN-04: failed unannounced re-audit)

### Tiers
Bands are numeric because the scorecard claims to be deterministic, and a deterministic system with adjectives for thresholds is not one.

**How the thresholds are set.** Not by taste. Each boundary is placed where the labeled set actually separates: the clear threshold sits above the highest-scoring known fraud, the decline floor sits below the lowest-scoring known-honest merchant, and the refer band is the overlap region between them, which is exactly the range where a human label is worth most. The bands are therefore an output of the eval, published with the separation curve that produced them, and they move when the curve moves.

Tiers mean different things by mode, because cold files are scored and bonded files are covered.

| Tier | Cold (advice only) | Bonded (advice plus a bond) |
|---|---|---|
| **Clear** | Not reachable cold: P3 is largely unearned | Instant approve, minimal fee |
| **Conditional** | Proceed under scoped, revocable authority, uncovered, reasons stated. The ceiling for a cold file | Guarantee issued, scoped token, rolling reserve as collateral, higher fee |
| **Refer** | Human adjudication card | Human adjudication card |
| **Decline** | Do not buy | Do not bond, do not buy |

Any unresolved high-materiality contradiction routes to Refer regardless of score or mode. Decline follows from the floor or any hard gate.

Working thresholds of 900 / 700 / 550 are the starting placeholders and are replaced by the derived values once the eval set runs. If a band cannot be justified from the curve, it does not ship as a number.

Published bands are the public methodology, along with the separation curve that produced them and the point values behind individual checks. In an open-source build the check manifest is readable anyway, and after the tier-derivation decision these are eval outputs rather than hand-set dials, so publishing them is part of the argument rather than a leak. The two things kept out of the repo are the canary strings and the holdout question set, which only work while unknown. See PLATFORM.md.

## 3. Pricing and escalation

Everything in this section prices a bond, so it applies to bonded files. Cold files carry no fee because no one has agreed to pay one; what a cold file produces is the decision and the escalation judgment, both of which still run.

### What the labeled set does and does not establish
The labeled merchant set validates **ranking**: does the scorecard order merchants correctly, do frauds concentrate in the low bands. It does not establish absolute probabilities. Roughly 40 to 60 self-authored personas can demonstrate separation; they cannot calibrate a price, and a band holding three merchants produces an estimate whose error bar covers the entire pricing range.

So **PD(score) is a stated prior**, taken from published card-industry fraud rates by risk band and adjusted by mode, not a curve fitted to our own eval set. The eval set tests discrimination; outcomes recalibrate the prior over time as real volume accumulates. We report separation and the confusion matrix as what they are, a measure of whether the scorecard sorts, and we say plainly what label count real calibration would take.

### The formula
**Expected loss EL = PD(score) x LGD x amount.**

Loss given default is not 1. The whole point of the mechanism design in Section 4 is that protection cuts the loss, and a formula that ignores it prices as though none of it existed:

| Protection in force | LGD |
|---|---|
| None, funds already captured by the merchant | 1.0 |
| Scoped, revocable token plus binding deposition | materially reduced: the commitment is breached before funds are final |
| Plus rolling reserve as collateral | reduced again by the collateral held |

**Guarantee fee = EL x loading factor.** The loading covers operations, margin, **and a correlation load**, because agentic fraud is not independent: one injection technique works across many merchants, and one operator can run fifty personas. Pricing correlated losses as though they were independent is how a guarantee fund fails on its first bad day.

Fee above a 5% cap: refuse to bond, refer or decline.

### Exposure limits, which reserves do not replace
- **Per-merchant exposure cap**, sized to the file, independent of score. Reserves are recovery, not prevention: a merchant with $1,000 of clean history at a 10% reserve has $100 posted, and nothing about that stops a $5,000 strike. The cap does.
- **Per-attack-class aggregate cap** across the book, so a single technique that defeats one pillar cannot drain the fund through fifty merchants at once.
- **Fund capital.** The guarantee fund is capitalized, and its capital is stated, not implied. In production this sits behind a licensed partner. For the hackathon it is simulated and we say so.

### Escalation
Escalate when any of the following holds:
- EL exceeds the user's set tolerance (for example "$25 max at risk without asking me"), or
- **cumulative EL across the session or the merchant** exceeds that tolerance, which is what stops a series of just-under-threshold purchases from walking under the bar, or
- any high-materiality contradiction is unresolved, or
- the file is thin, the mode is cold, and the amount is large relative to the file.

Amount-sensitivity is the point. Worked against the formula, with a $25 tolerance: a $12 purchase at a conditional score clears with a scoped token; the same merchant at $400 breaches tolerance and goes to the human; a second $400 purchase in the same session breaches the cumulative limit even if the first cleared.

Every worked figure in the pitch is computed from this formula, not asserted alongside it.

## 4. Mechanism design: lies must not pay, even undetected

Card networks do not prevent all fraud; they price it and make it recoverable. The structure we clone is older than card networks: **the surety bond**. The merchant is the principal and posts the bond, the buyer is the obligee and gets paid when the principal defaults, and the surety pays first and recovers from the principal afterward. Three consequences follow, and they answer the obvious objection about who funds the score.

1. **Binding deposition.** Merchant answers are recorded commitments. Settlement is authorized only against the transcript: price, fees, delivery, refund terms. Delivered reality contradicting the deposition is a breached commitment with a recorded record of what was promised.
2. **Scoped, revocable payment authority.** Clearhouse does not hold the buyer's money. It issues a guarantee and constrains the payment authority: ACP Shared Payment Tokens are scoped to a specific business and limited by amount and time, and they are revocable. Money that has not become final is money a breach can still stop. When a breach lands after finality, the fund pays the buyer and the recovery runs against the principal.
3. **Rolling reserve as collateral.** Conditional-tier merchants post a slice of each settlement as collateral under an indemnity agreement, released as clean transactions accumulate. That is standard surety practice, and unlike an acquirer's reserve it does not require us to sit in the flow of funds.

**Net effect:** a lie that evades pre-purchase detection is still a breached commitment against a scoped authorization with collateral behind it. Detection failures degrade toward recovery cases. The score being wrong is a priced event, not a failure mode.

**On the conflict.** The merchant pays, and the merchant is the party we are scoring. We name that rather than hide it: it is the structure that discredited credit ratings in 2008. The difference is the one Moody's could never claim. A rating agency was never required to pay when its rating was wrong. We pay on every score we issue, from a fund our own pricing has to keep solvent. Being wrong costs us money, which is the only conflict mitigation that has ever worked.

### Attacker economics (defense in depth expressed as cost)
| Attack | Cheap to defeat | Still caught by |
|---|---|---|
| Fake storefront | Site is one prompt; domain age costs months | P1 |
| Scripted consistent lies | Passes P3 | P2 checkout cross-check, then binding deposition at settlement |
| Patient fraud (build history, then strike) | Months of clean volume | Per-merchant exposure cap bounds the take; reserve funds the recovery; P6 velocity flags the strike |
| Identity laundering | New endpoint is free | P4 fingerprinting plus corroboration; reserve and cap reset to maximum for thin files |
| Behave for the exam, defect after | One honest afternoon | P3 holdout set plus P6 unannounced re-audit |

Each pillar is individually defeatable; jointly, the cost of a profitable attack exceeds the take.

## 5. Claims, payouts, and the truth problem

The guarantee is only as good as the answer to a hard question: **what actually happened after the money moved?** Nothing in the six pillars observes delivered reality, and a guarantee that pays on assertion alone is a guarantee that pays fraudsters.

**The delivery oracle.** Fulfillment state is a first-class object in the ledger, built from carrier tracking events, merchant attestation, and buyer confirmation, with disagreement between them routed to human adjudication rather than resolved by whoever spoke last. In the hackathon build the oracle is simulated with real state transitions, and we say that on stage rather than implying a live carrier integration.

**Claims are underwritten too.** The buyer is a counterparty, not a trusted narrator. A payout requires:
- the binding deposition, which fixes what was promised,
- an evidence bundle: order record, fulfillment state, merchant communications, and the buyer's statement,
- a claim within the window, against a merchant and buyer pair with no prior collusive pattern.

**Controls on the payout side:**
- Per-buyer and per-merchant payout caps, so an unlimited instant-payout facility is not the cheapest attack on the system.
- Buyer claim history, scored the same way merchant history is. A buyer whose every purchase becomes a claim is a fraud pattern, not bad luck.
- Collusion detection on merchant and buyer pairs, since the profitable version of this attack needs both sides.
- Disputed claims go to the adjudication card, which is the same human path the refer tier uses.

First-party and collusive claim fraud are named entries in the taxonomy, not an afterthought. Underwriting one side of a two-sided market and calling it a trust layer would be exactly the mistake we say the industry is making.

## 6. Thin files (cold start)

A newly bonded honest merchant has no history. The answer is terms, not decline: conditional tier by default, higher fee, scoped authorization, rolling reserve, file thickens with every clean transaction until terms improve.

Applying for the bond is itself the fastest single improvement available, and it is a step change rather than an increment. It unlocks the consent-gated evidence, it unlocks the stress exam, and it is the only route to a guaranteed purchase at all, since cold files are scored and not covered. A merchant asking how to be trusted by buying agents has exactly one answer, and it is a form.

This is also the merchant-side pitch: Clearhouse is how a legitimate unknown merchant earns agent traffic fast.

## 7. The adjudication card (refer tier and disputed claims)

One screen, ten-second decision:
- Amount at risk; score with mode and top 3 reason codes.
- Side-by-side contradiction: what the feed said vs what the merchant said vs the checkout quote.
- For disputed claims: the deposition beside the fulfillment state and the buyer's statement.
- Two actions with terms: approve with scoped authorization and reserve, or decline.
- The decision is logged and feeds calibration. The card itself is a demo scene: it shows the escalation the event blurb asks about.
