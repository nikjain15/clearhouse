# The Clearhouse Agentic Commerce Fraud Taxonomy

A named, numbered catalog of the ways agent-mediated purchases go wrong. Published as an artifact in its own right; Clearhouse is the reference implementation that demonstrably catches them. Entries marked **agent-native** could not exist before LLM agents and are the least likely to be covered by anyone else. Real-world anchors are sourced in [EVIDENCE.md](EVIDENCE.md); catching pillars are specified in [UNDERWRITING.md](UNDERWRITING.md).

## Merchant deceives the buying agent

| # | Attack | Agent-native | Real-world anchor | Caught by |
|---|---|---|---|---|
| F01 | Feed drift / bait-and-switch: feed price or stock differs from checkout | | Stale feeds are endemic; agents cannot tell stale from scam | P2 |
| F02 | Item not as described / counterfeit | | Classic marketplace fraud, laundered through confident agent summaries | P2, P6 + payout |
| F03 | Prompt injection in product content: hidden instructions in descriptions or reviews | Yes | Hidden instructions in product pages and reviews are a documented e-commerce attack class (EVIDENCE section 3). Commercial memory poisoning of assistants is separately documented by Microsoft (31 companies, MITRE ATLAS AML.T0080) via prefilled chatbot URLs | P3 (`BX-05` content canary), hard gate |
| F04 | Spoofed storefront with a well-formed protocol endpoint | | Guardio Scamlexity: Comet bought an Apple Watch on a fake Walmart built from one prompt | P1 |
| F05 | Fulfillment fraud: takes money, never ships | | Experian's open liability question | Fulfillment oracle plus binding deposition; payout when missed |
| F06 | Sycophancy trap: merchant agent agrees with the buyer's false premise | Yes | The event blurb's literal ask | P3 |
| F07 | Returns-policy mirage: generous policy quoted at sale, different at claim | | Standard e-commerce complaint pattern | P2 + binding deposition |
| F08 | Machine-targeted reputation spam: fake structured ratings for agent consumption | Yes | GEO-adjacent manipulation, Citable's territory | P2, P4 |
| F09 | Hallucinated promises: merchant's own LLM invents warranty or refund terms | Yes | Moffatt v. Air Canada, BC Civil Resolution Tribunal 2024: Air Canada held liable for its chatbot's invented bereavement policy, about CA$812 | P3 + binding deposition |
| F10 | Agent tax: merchant detects agent traffic and quotes a higher price than humans see | Yes | Documented price discrimination patterns, now agent-detectable | P3 (pressure response), P2 |
| F11 | Drip pricing / junk fees: quoted $49, captured $63 | | Long-standing FTC deception enforcement. Note the 2024 FTC fees rule is scoped to live-event tickets and short-term lodging, so it is precedent for the harm, not coverage of e-commerce | P2 (total-with-fees claim) + settlement check |
| F12 | Subscription trap: one-time purchase recurs in the fine print | | ROSCA and state autorenewal laws. The FTC's revised negative-option rule was vacated by the Eighth Circuit in July 2025, so ROSCA is the live authority | P2 (recurrence claim) |
| F13 | False scarcity pressure: fake urgency to force fast agent decisions | Yes | Dark-pattern literature; agents optimize for task completion | P3, P5 |
| F14 | Context flooding: unfavorable terms buried mid-context to exploit attention decay | Yes | Lost-in-the-middle research | P2 (claims extracted regardless of position) |
| F15 | Unit and currency games: per-unit vs per-pack, wrong currency | | Standard pricing dark patterns | P2, P5 |
| F16 | Data over-collection at checkout: demands CVV, SSN, DOB beyond token scope | | ACP scoped tokens exist precisely for this | Hard gate |
| F17 | Fake human escalation: merchant claims a human supervisor approved | Yes | Adversaries attack the escalation mechanism itself | P3 |
| F18 | Identity laundering: burned merchant returns under a fresh endpoint | | Mastercard MATCH exists because this is universal | P4 fingerprinting plus corroboration |

## Attacks on the underwriter and the guarantee

Trust is two-sided, and a system that underwrites only merchants has underwritten half the problem. These are the attacks aimed at Clearhouse itself.

| # | Attack | Agent-native | Note | Caught by |
|---|---|---|---|---|
| F19 | First-party claim fraud: buyer receives the goods and claims otherwise to collect the payout | | The oldest fraud in commerce, pointed at an instant-payout facility | Fulfillment oracle, evidence bundle, buyer claim history, payout caps |
| F20 | Collusive claim: merchant and buyer cooperate to extract from the guarantee fund | | The profitable version needs both sides, which is why both are scored | Merchant and buyer pair collusion detection, exposure caps |
| F21 | Injection aimed at the underwriter: merchant content crafted to steer Clearhouse's own scoring, not the buying agent | Yes | The direct attack on us, distinct from F03 which targets the recommender | Merchant content handled as untrusted data, never as instructions; findings schema-constrained |
| F22 | Registry false flag: submitting attacks or evidence designed to tank an honest competitor's score | Yes | A negative file is a weapon if anyone can load it | Human promotion of arena cases, Pillar 4 notice and appeal, no fingerprint-alone gate |
| F23 | Denial of underwriting: merchant rate-limits, blocks, or stonewalls the examination | Yes | Refusing the exam is a strategy, not an error state | Non-cooperation scores as absent evidence, never as benefit of the doubt |

## Ecosystem-level (pitch, not demo)

| # | Attack | Note |
|---|---|---|
| E01 | Pay-to-rank conflict of interest | When the recommending platform takes fees from sellers, whose agent is it. We are exposed to a version of this ourselves: the merchant pays. Our answer is that we also pay when we are wrong |
| E02 | Buyer-side fraud at machine speed | HUMAN Security documented agents autonomously carding checkouts; refund abuse and promo stacking scale the same way. F19 and F20 are the parts of this we underwrite today |

## Rules

- Every demo scene names its taxonomy ID and its catching pillar on screen.
- New attacks discovered during the live red-team arena get provisional IDs from **F24 onward**, assigned on the spot; the taxonomy growing live on stage is a feature.
- A provisional ID is a candidate, not a finding. It becomes a permanent entry when a human promotes it, which is the same gate that protects the eval set.
