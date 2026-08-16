# Evidence pack: every scenario is a documented, real incident

The idea alone is not the moat. Anyone prompting Claude lands near "trust layer for buying agents." The differentiation is grounding: every demo scene re-enacts a documented incident, every number in the pitch is sourced, and the economics use real fraud-loss data. This file is the source of truth for the pitch and the demo scripts.

**The discipline that makes this worth anything:** a claim is attached to the finding that documents it, not to an adjacent finding that sounds similar. Two claims in v2 of this file failed that test and are corrected below. Getting this right matters more for us than for anyone else in the room, because sourcing everything is the differentiation.

## 1. Fake storefronts already fool buying agents (documented test)

Guardio Labs "Scamlexity" (Aug 2025): researchers built a fake Walmart storefront with a single Lovable prompt, then asked Perplexity's Comet to buy an Apple Watch. Comet scanned the site, never questioned legitimacy, navigated checkout, autofilled the stored credit card and address, and completed the purchase with no human confirmation. Same research: Comet processed a live Wells Fargo phishing page and the PromptFix hidden-prompt exploit.

- Demo mapping: the spoofed-storefront scene (F04) is a re-enactment. Say so on stage: "This is not our invention. Guardio did this to Comet with a store built from one prompt."
- Sources: guard.io/labs/scamlexity, BleepingComputer "Perplexity's Comet AI browser tricked into buying fake items online", TheHackerNews PromptFix coverage.

## 2. Companies are already manipulating AI recommendations, commercially, in the wild

Microsoft Security (Feb 10 2026), "Manipulating AI memory for profit: The rise of AI Recommendation Poisoning": 31 companies across 14 industries observed deploying hidden instructions that bias assistant memory toward treating their brand as trusted or preferred. Over 50 distinct prompts found by reviewing AI-related URLs observed in email traffic over 60 days. Attackers use off-the-shelf commercial tooling, not custom hacks. MITRE ATLAS classifies memory poisoning as AML.T0080.

**Be precise about the vector.** Microsoft documented delivery through "Summarize with AI" buttons and prefilled chatbot URLs, observed in email traffic. That is not the same as a hidden instruction inside a product description. Both are real; only one of them is Microsoft's finding.

- Pitch use: manipulation of AI recommendations is not a future threat, it is a current commercial practice with vendors selling tooling for it. Cite it for that, and for MITRE's classification.
- Sources: microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning, The Register, Help Net Security coverage.

## 3. Hidden instructions in product content are a documented e-commerce attack class

Documented techniques: hidden HTML comments in product pages instructing agents to ignore competitor reviews and state the product is highest rated; injected instructions in user reviews to boost ranking or discredit competitors; complete marketing copy injected into assistant memory. OpenAI itself classifies prompt injection as a frontier, unsolved security challenge.

- Demo mapping: the injection scene (F03) uses a hidden HTML comment in a product description, and it is cited to **this** section, not to section 2.
- Sources: OpenAI "Understanding prompt injections", Retail Technology Innovation Hub on the hidden prompt problem.

## 4. The scale: agents are a large and growing share of commerce traffic

Akamai, "Securing the Agentic Storefront: Attacks on Commerce" (Jul 15 2026, covering Jul to Dec 2025): as of Dec 2025, 47.9% of all commerce traffic on Akamai's global network is AI bots. **The same report says AI training crawlers account for more than 70% of AI bot triggers in commerce, with OpenAI, ByteDance and Anthropic the top three.** Commerce organizations put 90%+ of AI bot activity in "monitor" mode and let three quarters of the rest pass unrestricted. The report also documents agent hijacking to abuse stored payment credentials, and LLM-generated synthetic identities bypassing static defenses. HUMAN Security has documented AI agents autonomously carding: testing stolen credit cards against merchant checkouts.

**What this number does not support.** It cannot be used to claim the counterparty in your agent's purchase is half the time another machine. Most of that traffic is crawlers, and the correction is in the same press release we are citing. Use it for the true and sufficient claim: machine traffic is already the majority of what commerce sites see, and almost nobody is underwriting machine-to-machine trust.

- Sources: Akamai press release Jul 15 2026, Unit 42 "Retail Fraud in the Age of Agentic AI", HUMAN Security carding findings.

## 5. The economics: real losses, and the liability question is open

- FTC: consumers reported losing more than $12.5B to fraud in **2024**, the figure published in the FTC's March 2025 data release.
- FBI IC3 2025 Internet Crime Report: 22,364 complaints referencing artificial intelligence, $893M in reported losses, the first year IC3 broke out AI as a category. Total across all categories was $20.9B on 1,008,597 complaints.
- **Framing rule for both numbers.** These size fraud generally and AI-enabled fraud broadly, which is mostly business email compromise, romance, employment and investment scams. Neither is a measure of agentic-commerce loss, and neither is a market size for Clearhouse. Use them to establish that the ground is expensive, not to imply the number is ours.
- Experian Future of Fraud Forecast (2026): predicts a tipping point forcing the liability question: when your agent buys from a fake store with your card, who eats the loss, you, the AI company, or the bank? That open question is literally the product: Clearhouse is the entity that answers "we do, priced by our own score."
- The authorized-fraud trap: card dispute frameworks treat agent purchases as authorized (the user delegated). The closest precedent is authorized push payment fraud (Zelle-style scams), where "authorized" historically meant no reimbursement. Agent purchases inherit this gap by default.
- Sources: FTC fraud data (2024 release), FBI IC3 2025 report, Experian Future of Fraud Forecast via Fortune.

## 6. The legal turn that makes trust scoring the control surface

Ninth Circuit, Aug 4 2026: vacated the preliminary injunction Amazon obtained against Perplexity's Comet in March 2026, holding Amazon unlikely to succeed on its CFAA claim because the agent is a tool operated by users, who are the ones accessing Amazon's servers. The panel limited the ruling to the record before it and declined to set broader principles for agentic AI; the case returns to the Northern District of California.

- Pitch use: **twelve days old** at hack time. "The courts just took away the blunt instrument. What replaces it is underwriting."
- Use it carefully: it is narrow, and it cuts both ways. It is also the reason cold-mode underwriting stays inside ordinary buyer-shaped interaction rather than aggressive probing of merchants who never consented (UNDERWRITING section 0).
- Sources: Cooley, Wilson Sonsini and Ropes & Gray client alerts (Aug 2026), Courthouse News, PYMNTS coverage.

## 7. The payment primitive the money layer relies on

Stripe Shared Payment Tokens, the primitive at the core of ACP: tokens are scoped to a specific business, limited by time or amount, revocable at any time, and monitored via webhook events. Expanded in 2026 to work with Visa and Mastercard agentic network tokens.

- This is what the guarantee mechanic is built on: constrained and revocable payment authority, not an escrow account we hold. Say "scoped, revocable authority," not "we hold the funds."
- **Do not claim ACP has a named delayed-capture feature.** We could not verify that, so it does not appear in the pitch.
- Sources: Stripe agentic commerce blog and docs, ACP specification releases (2025-09-29, 2025-12-12, 2026-01-16, 2026-01-30, 2026-04-17).

## Scene-to-evidence map (the five narrated scenes)

The board carries all 18 merchant-facing taxonomy entries. These five are the ones we slow down and narrate, because these five have anchors.

| Scene | Taxonomy | What happens on stage | Real-world anchor |
|---|---|---|---|
| 1. Honest merchant | | Full purchase completes via ACP-shaped flow, scoped token, commitments verified | Stripe Shared Payment Tokens, scoped and revocable (section 7) |
| 2. Spoofed storefront | F04 | Well-formed merchant endpoint, cold KYB catches identity inconsistency | Guardio fake-Walmart test on Comet (section 1) |
| 3. Injection | F03 | Hidden instruction in product content; `BX-05` content canary fires | Documented hidden-instruction techniques (section 3); memory poisoning as commercial practice (section 2) |
| 4. Sycophancy trap | F06 | Leading question; merchant agent caves; escalation to human at threshold | Event blurb's literal ask; agent-native, our contribution |
| 5. Fraud beats the score | F05 | Approved purchase never ships; oracle contradicts attestation; claim underwritten; payout from the fund | Experian's open liability question; APP-fraud reimbursement gap (section 5) |

## Rule for the day

No invented statistics on stage. Every number traces to this file. If a claim cannot be sourced, it is cut from the pitch. If a source says something narrower than we want it to say, we say the narrower thing.
