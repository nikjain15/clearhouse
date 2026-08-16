# Clearhouse: strategy for Sundai Hack 136, "Agents that buy"

**Event:** Sundai Hack 136 with Citable and HBS Founder Lab, Sunday Aug 16 2026, 10:00 AM to 10:00 PM, HBS.
**Status:** Strategy locked (v3, post stress test). Design and build begin per Section 9.
**One-liner:** A surety bond for agentic commerce.
**The expansion, one sentence:** The merchant posts the bond, we underwrite them before your agent pays, and we pay the buyer when our own score is wrong.

**Written positioning statement** (for docs and the site, not for speaking): the clearinghouse for agentic commerce. Checkout protocols move the money; Clearhouse underwrites who it moves to, with merchant underwriting that runs in seconds, prices the guarantee from what it finds, constrains payment authority until commitments verify, and pays instantly when its own score is wrong.

Companion docs: [UNDERWRITING.md](UNDERWRITING.md) (the full methodology), [TAXONOMY.md](TAXONOMY.md) (the named fraud taxonomy), [EVIDENCE.md](EVIDENCE.md) (sourced real-world anchors), [PLATFORM.md](PLATFORM.md) (extensibility and the self-improving loop).

---

## 1. Locked decisions

1. **Name: Clearhouse.** The clearinghouse is the precise finance analogy: a central counterparty standing between two parties who do not trust each other, guaranteeing settlement with its own capital. *Accepted risk, eyes open:* Clearhaus is a European acquirer in the Unzer group, and The Clearing House is the US institution operating CHIPS and RTP, so in a payments room the name reads as adjacent to both. If asked, the answer is yes, deliberately: that is the analogy, and a central counterparty is exactly what we are describing.
2. **Core: the Merchant Underwriting File, in two modes.** Six evidence pillars, hard gates plus a weighted scorecard with reason codes, expected-loss pricing, tiered decisions (clear / conditional / refer / decline). **Changed in v3:** the file now exists in cold mode (merchant never applied, underwritten from public surfaces and buyer-shaped interaction) and bonded mode (merchant applied and consented, unlocking the stress exam and the consent-gated identity checks). Pillar 1 is renamed cold KYB and names the full real-world checklist, split by the consent each item requires. Full spec in UNDERWRITING.md.
3. **The money layer is the differentiator, structured as a surety bond.** **Changed in v3:** we do not hold buyer funds and we do not call it insurance. The merchant is the principal and posts the bond, the buyer is the obligee, and Clearhouse pays the obligee then recovers from the principal. Payment authority is constrained rather than escrowed: ACP Shared Payment Tokens are scoped to a business, limited by amount and time, and revocable. Reserves are collateral under an indemnity agreement, which is standard surety practice and does not require sitting in the flow of funds. Pricing carries loss given default, a correlation load, per-merchant and per-attack-class exposure caps, and stated fund capital.
4. **Who pays: the merchant, and only bonded merchants are covered.** **New in v3, extended in the re-audit.** The merchant funds the bond, which makes the rated party the paying party, and we disclose that rather than hide it. The mitigation is the one no rating agency ever had: we pay when our score is wrong, from a fund our own pricing must keep solvent. Being wrong costs us money. It follows that cold mode scores but does not guarantee: a merchant who never applied has funded nothing, and writing protection on a stranger while billing nobody is not a business. So cold answers "should your agent buy from these people" for free, and bonded adds "and we will make you whole if it goes wrong." That is the ladder, and it is why bonding is a growth product rather than a tax.
5. **Demo shape: taxonomy + gauntlet.** We publish the fraud taxonomy as a named artifact (TAXONOMY.md) and demo Clearhouse running the full gauntlet live: **all 18 merchant-facing taxonomy entries on the board**, each cell resolving to caught / escalated / paid-out with its pillar and reason code, with the five evidence-anchored scenes narrated as the slow-down moments.
6. **Evidence grounding.** Every scenario re-enacts a documented incident; every number traces to EVIDENCE.md; unsourced claims are cut from the pitch. Claims are attached to the specific finding that documents them, not to an adjacent one.
7. **Stack:** Next.js + Vercel + Claude API, with a named persistent store for the event log rather than process memory, and a cached replay path so a rate limit does not become a blank screen.
8. **Pitch: two scripts, one story.** **Changed in v3.** The morning recruiting pitch and the evening final are different jobs for different audiences and are written separately. Morning leads with what you get to build; evening leads scariest-first. See Section 6.
9. **Platform principles: everything is data, and every interaction is a label.** Attacks, checks, questions, scorecards, pricing curves, and eval cases are versioned config, never code; adding a fraud case is dropping a JSON file. Outcomes recalibrate pricing, every miss auto-becomes a permanent eval case, arena attacks become test assets **after a human promotes them**, and no new version ships without clearing per-class floors on the eval set. Full spec in PLATFORM.md. Demo moment: scam it once, it pays you; try the same scam twice, it is already in the immune system.
10. **Scope: build it completely, no shortcuts.** **Held consciously in v3 against the recommendation to cut.** The stress test found the build window is roughly six hours with a team formed at noon, and the agreed fixes add about 22 person-hours on top of an already full must-ship list. We are building the whole thing anyway. The consequences are accepted and named in Section 8: recruiting three hackers is a requirement rather than a hope, and the runtime fallbacks in Section 8 are what keep a full-scope build demo-safe.
11. **Integration surface: MCP first, one tool, one decision.** **New in v3.** Clearhouse ships as an MCP server so adoption is one URL and no SDK, with a packaged agent skill carrying the escalation policy and an ACP-shaped REST API underneath both. The common path is a single call: merchant, amount, what is being bought, returning a decision an agent can act on without further reasoning. A six-tool suite is an integration project and would not get used. Full contract in PLATFORM.md.

*Considered and deliberately not locked:* narrowing the market to the long tail outside curated catalogs. The argument is sound and is kept as pitch framing in Section 5, but it is not a strategic commitment.

## 2. Why this wins

- **The gap is real, and its shape is specific.** UCP (Google/Shopify, NRF Jan 2026, with Walmart, Target, Etsy and Wayfair) and ACP (OpenAI/Stripe, fifth release Apr 17 2026) are checkout plumbing. Both assume the merchant is already known to somebody. Neither answers whether the agent should trust a merchant nobody onboarded, and neither says who eats the loss when it should not have.
- **The threat is documented, not hypothetical.** Agents already buy from fake stores (Guardio/Comet). Companies already deploy hidden instructions commercially to bias what assistants recommend (Microsoft, 31 companies across 14 industries, MITRE ATLAS AML.T0080 Memory Poisoning). AI bots are 47.9% of commerce traffic on Akamai's network, most of it crawlers, and the same report documents agent hijacking and LLM-built synthetic identities in commerce.
- **The legal turn is 12 days old.** The Ninth Circuit vacated Amazon's preliminary injunction against Comet on Aug 4 2026, holding the agent is a tool operated by users. Perimeter blocking is legally weakened. Trust, identity, and underwriting are what replace it.
- **The liability question is the industry's open question.** Experian's 2026 forecast asks: when your agent buys from a fake store, who eats the loss? Clearhouse is the entity that answers "we do, priced by our own score."
- **Defensible depth.** Anyone with Claude lands near "trust layer for buying agents." The moat is execution: a real underwriting methodology cloned from mechanisms proven at card-network and acquirer scale, a published taxonomy, an eval that measures separation honestly, and mechanism design that makes lying unprofitable even when undetected.

## 3. The product in four sentences

1. Before money moves, Clearhouse builds a Merchant Underwriting File across six pillars, in cold or bonded mode, and scores it deterministically with reason codes.
2. The score prices the bond and picks a tier: clear, conditional (scoped authority plus reserve), refer (human adjudication card), or decline.
3. Merchant answers are binding commitments: settlement is authorized only against the deposition, so a lie that evades detection still does not get paid.
4. When a bonded purchase goes bad anyway, the dispute agent files the evidence bundle, the claim is underwritten in its own right, and the fund pays the buyer while the merchant's collateral and score absorb the loss.

**How anyone uses it.** One URL added to any MCP client, then a single tool call before money moves: here is the merchant, here is the amount, here is what I am buying. Back comes a decision, the reasons in plain language, the fee, and a guarantee reference. The packaged skill supplies the policy for when to call it and when to stop and ask a human. No SDK, no integration project, no new protocol to learn. Full contract in PLATFORM.md.

## 4. Demo: the gauntlet

The board lists all 18 merchant-facing taxonomy entries across the top. The Clearhouse buyer agent runs the full gauntlet live; each cell resolves to caught (with the reason code and pillar), escalated (adjudication card on screen), or paid-out (the closer). Five cells are the evidence-anchored scenes and get narrated. Three moments get slowed down completely, and the second is not a cell on the board at all:

- **Injection caught** on `BX-05`, the content-embedded canary, with the reason code trace on screen.
- **A real agent, not ours.** Add the Clearhouse MCP server to a stock Claude client on stage, one line, then ask it to buy something from a storefront we spun up. It calls the tool, gets a decline with reasons, and refuses in its own words. This is the only moment in the demo where the buying agent is not one we wrote, which is exactly why it lands: the board proves the system works, this proves anyone can use it in ten seconds.
- **The fraud that beats the score.** An approved purchase never ships. The fulfillment oracle disagrees with the merchant's attestation, the dispute agent files the deposition as evidence, the claim is underwritten, the fund pays the buyer on stage, the merchant's collateral is debited, the registry updates. Showing a priced miss beats claiming perfection.

**Every cell carries its mode, because the two-mode design is invisible otherwise.** Cold cells are merchants who never applied, caught on public surfaces and ordinary buyer interaction. Bonded cells are merchants who consented, where the stress exam and the commitment machinery run. The split is fixed in advance so nobody argues it at 3 PM:

- **Cold (10 cells):** F01, F04, F08, F11, F12, F13, F14, F15, F16, F18. Identity, claims, pricing and network attacks, all reachable without cooperation.
- **Bonded (8 cells):** F02, F03, F05, F06, F07, F09, F10, F17. Behavior under stress, binding commitments, and fulfillment outcomes, all of which need consent or a bond in force.

`BX-05`, the content canary, is a bonded instrument: planting an instruction in content a merchant ingests is not something ordinary buyer interaction does to a merchant who never agreed to anything. Saying that plainly is better than implying the gate protects a population it cannot reach.

**Beside the board: the "attacks on us" panel.** Five rows, F19 to F23, each against the control that answers it: first-party claim fraud against the fulfillment oracle and payout caps, collusion against pair detection, injection at the underwriter against untrusted-data handling, registry false flag against the human promotion gate and Pillar 4 appeal rights, denial of underwriting against scoring non-cooperation as absent evidence. These are not board cells, because they are defended by controls rather than by scoring a merchant, and a uniform cell would misrepresent how they work. The panel exists because a board showing only merchant-facing attacks reads as a system that underwrote one side of a two-sided market, which is the exact criticism UNDERWRITING section 5 says the industry deserves. Thirty minutes of UI to show the thinking that most separates this from a merchant checker.

Close with the eval: labeled merchant set, separation across bands, escalation rate, and the honest framing of what 40 to 60 self-authored personas do and do not establish.

## 5. Pitch framing

- **Hackers:** attack taxonomy x defense pillars, adversarial gauntlet, deterministic scorecard with replayable reason codes, two canaries with different meanings, a scored eval, and an arena where the whole room tries to break it.
- **HBS Founder Lab:** every buyer agent shipping today has this hole; checkout is commoditized plumbing; the surety position is the durable wedge; the registry compounds (network data is the moat, as MATCH lists and consortium data are for card networks). Bonding is a growth product for honest unknown merchants, not just a shield for buyers.
- **The answer to "why doesn't Stripe just do this":** inside ACP and UCP, merchants onboard through Stripe, Shopify and Google, who already run KYB and merchant risk scoring, and agent-side identity already has Visa TAP, Web Bot Auth, Forter and Riskified. We are not competing with any of that. The first customers are the merchants outside curated catalogs, which is where an agent following a link ends up and where nobody has underwritten anyone. That is the entry point, not the ceiling.
- **Citable handshake:** Citable helps merchants earn visibility in AI answers; Clearhouse helps them earn transactability by AI buyers. Same thesis, adjacent layer.
- **Key lines:** "Comet asked zero of these questions and bought an Apple Watch from a fake Walmart. No acquirer on earth would have onboarded that merchant." / "Each pillar is individually defeatable; jointly, the cost of a profitable attack exceeds the take." / "The score being wrong is a priced event, not a failure mode." / "Moody's never had to pay when a rating was wrong. We pay on every score we issue."

## 6. The two pitches

**Morning, 60 seconds, to recruit.** The room is choosing what to build, not what to invest in. Lead with the build. Written verbatim because 60 seconds is short enough that a wandering first sentence costs a third of it.

> **[memorize these two sentences]** I am building an AI merchant that lies, and an AI buyer that catches it. At 8 o'clock tonight, every person in this room gets to try to scam it, live, on that screen.
>
> This is not hypothetical. Researchers built a fake Walmart storefront with a single prompt, pointed Perplexity's browser at it, and it bought an Apple Watch. Real card, no questions, no confirmation.
>
> Clearhouse is a surety bond for agentic commerce. The merchant posts the bond, we underwrite them before your agent pays, and we pay the buyer when our own score is wrong.
>
> I need three people. One to build the merchants that lie. One to build the board where you watch them get caught. One to build the eval and the arena. Come find me.

Rehearse only the first two sentences to the word. Everything after can be spoken from the structure, and should be, so it does not sound recited. The three seats get named out loud because a vote is not a teammate.

**Evening final, scariest-first, as originally locked.** Open with the Guardio incident, then Microsoft's 31 companies, then the one-liner, then the gauntlet, then the priced miss, then the eval.

## 7. Sundai fit (from the official intro-for-newcomers doc)

- **Teams are minimum 2 with a Launch Lead; ideas are pitched and voted 10 to 12.** First deliverable is the 60-second morning pitch in Section 6.
- **Ship simple and working beats ambitious and incomplete.** We are consciously taking the ambitious side of this rule (locked decision 10), which raises the bar on the fallbacks in Section 8.
- **Launch checklist:** live deployed URL, open-source GitHub, project documentation on sundai.club, 30-second video, live user testing 8 to 9 PM, attribution to team and Sundai.
- **The 30-second video, specified now so it is not improvised at 6 PM.** Revised to lead with the install rather than the board: for someone who was not in the room, adoption cost is more persuasive than capability, and ours is one line.
  - **0 to 8 seconds, the install.** One line pasted into a stock Claude client. The Clearhouse tool appears. Nothing else happens, and that is the point: this is the entire integration.
  - **8 to 20 seconds, a real agent refuses.** "Buy me an Apple Watch from this store." The agent calls the tool, the decision comes back declined with the reasons in plain language, and the agent explains in its own words why it will not. The buying agent is not one we wrote, which is the whole argument.
  - **20 to 27 seconds, the priced miss.** Cut to the purchase that clears and goes bad anyway: the fund pays the buyer, the collateral is debited. The 18-cell board sits behind this for scale rather than taking a beat of its own.
  - **27 to 30 seconds, the one-liner card.**
  - Record it in the afternoon against the cached replay path, not against a live run.
- **First-time visitor path.** The live URL opens on a single primed run: one merchant, one purchase, the file building live with reason codes appearing, resolving in under 60 seconds without any input. Then two calls to action, in this order: the one line that adds the MCP server to their own agent, and "attack it yourself" into the arena form. A visitor who does nothing still sees the product work; a visitor who does one thing is using it in their own client.
- **Live user testing as an open red-team arena: "Scam our agent."** Other hackers submit malicious merchant personas through a form and try to get Clearhouse to buy. Every attempt streams on the board and feeds the eval numbers. Submissions are rate-limited, content-filtered before they render, treated as untrusted data by the underwriter, and promoted into the eval set by a human rather than automatically. See PLATFORM.md.
- **The arena has two doors, and the second one is better.** Door one is the submission form. Door two is: add our MCP server to your own agent and try to make it buy something it should not. That is real user testing rather than a form, it puts the product inside someone else's stack during the hour judges are watching, and every hacker in the room already has an MCP client open.
- **The arena is open during the 8 to 9 PM window only, then becomes a read-only archive.** The deployed URL stays live and public, as the checklist requires, and every attempt with its verdict stays visible afterward, which is a better artifact for a judge reviewing later than a dead form. It also means an unauthenticated endpoint calling a paid API is not left standing open on the indexed internet after everyone goes home.
- **Sundai-born ideas rule:** this work is preparation and evidence; the idea is pitched fresh at the event for the room to vote on and join.

Team split (2 to 4): Nik as Launch Lead owns scorecard, ledger, policy gate, pitch. Hacker 2: merchant simulator and red-team personas. Hacker 3: gauntlet board UI and streaming. Hacker 4: eval harness and the scam-our-agent submission form.

**If the vote yields one teammate.** Full scope needs three. With one, the order of sacrifice is fixed in advance so it is not argued at 4 PM: the arena form survives (it is a checklist requirement and the best demo), the board drops to the five anchored scenes, the eval runs precomputed, and the self-improving loop demo is shown on the two hero cells only. Nothing else changes, and nothing about the methodology docs changes.

## 8. One-day scope

**Must ship (morning):** merchant simulator with scripted deterministic personas for the anchored scenes, underwriting engine covering pillars 1, 2, 3, 5 live (pillar 4 as seeded registry data, pillar 6 via re-audit and the payout scene), deterministic scorecard with reason codes, tier gate with numeric bands, simulated ledger with scoped authorization, collateral and fulfillment states, gauntlet board UI with streaming.

**Must ship (afternoon):** full 18-cell gauntlet reliable end to end, adjudication card, claim and payout flow with the fulfillment oracle, eval harness over the labeled merchant set with separation view, MCP server exposing the single decision tool, plus the packaged agent skill, scam-our-agent form with gating and filtering, the self-improving loop demo path (payout auto-creates a candidate eval case, a human promotes it, the new scorecard version clears per-class floors, the same attack re-runs and is caught), deploy to Vercel, 30-second video.

**Added by the stress test, about 22 person-hours:** fulfillment oracle with real state transitions and claims logic (3h), cold-runnable KYB checks with their own reason codes (2h), the two canaries (2h), unannounced re-audit path (2h), eval set widened to 40 to 60 personas (2h), arena gating, filtering and per-class floors (2h), four runtime hardening items (4h): persist LLM findings rather than scores so replay is deterministic, name the latency target and the event store, build the cached replay fallback, and script the hero personas. Then a reconciled fund ledger (1h), the arena time window and archive (30m), moving canaries and the holdout set out of the repo into environment configuration (30m), the integration surface: MCP server wrapping the engine (2h) plus the packaged agent skill (1h), and the attacks-on-us panel beside the board (30m).

**The fund is a real ledger, not a display.** Fund balance, fees collected, merchant collateral and payouts reconcile as double-entry across the whole gauntlet run, all clearly labeled simulated. The payout scene debits the fund and the merchant's collateral on screen. This is the one place where a judge may add up the numbers, and reconciling arithmetic is a stronger signal than a convincing-looking figure.

**Runtime rules, non-negotiable:** every gauntlet run is cached so a rate limit or a dead network replays the last good result instead of showing a spinner; the eval results page is precomputed; the hero-path personas are scripted, not LLM-improvised, so the attacker cannot decline to attack in front of judges.

**Stretch:** registry page persisting scores across runs, Stripe test-mode integration instead of the simulated ledger, downloadable signed evidence bundle.

**Cut lines (pre-decided):** no real UCP/ACP network integration (ACP-shaped internal API only), no auth/user accounts, no mobile polish.

**Honest labels on stage:** pillar 4 is 15% of the score and runs on seeded registry data today; the fulfillment oracle is simulated; the guarantee fund is simulated. Saying so costs nothing and buys everything.

## 9. Next steps

1. Architecture doc: module boundaries matching the team split, merchant persona schema, claims-graph and scorecard data model, ledger and fulfillment-state design, event store choice, API routes, streaming design, cache and replay path.
2. Repo scaffold ready to deploy from minute one.
3. Event day: morning pitch at voting, build to Section 8, freeze at 6 PM, checklist 7 to 8, red-team arena 8 to 9, present.
