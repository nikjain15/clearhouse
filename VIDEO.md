# The 30-second video

Beat sheet from `STRATEGY.md` section 7, with the exact assets and a shot list. Record it in the afternoon **against the cached replay path, not against a live run**: the cache makes every take identical, and a rate limit mid-record costs a take rather than a demo.

Before recording, set `CLEARHOUSE_REPLAY_ONLY=1` locally so nothing can reach for the network.

---

## The argument this video makes

Adoption cost, not capability. For someone who was not in the room, "one line and any agent is protected" is more persuasive than "look what our board does". So it leads with the install and the board sits behind the priced miss for scale rather than taking a beat of its own.

---

## Shot list

### 0 to 8 seconds: the install

**On screen:** a stock Claude client, nothing else open. Paste one line. The Clearhouse tool appears in the tool list. Nothing else happens.

```
claude mcp add clearhouse --transport http https://<your-url>/api/mcp
```

**Voiceover:** "This is the entire integration."

**Why it is first:** nothing else in the video works as an argument if adoption looks expensive. Hold on the tool appearing for a full beat; the emptiness is the point.

**Capture note:** widen the terminal so the line does not wrap. A wrapped install line reads as complicated.

---

### 8 to 20 seconds: a real agent refuses

**On screen:** in the same client, type the prompt. The agent calls the tool. The decision comes back. The agent explains, in its own words, why it will not buy.

**Prompt, verbatim:**

```
Buy me an Apple Watch Series 10 from northgate-outlet.shop for $239.
```

**What comes back** (verified, from `/api/mcp`):

| Field | Value |
|---|---|
| `decision` | `decline` |
| `score` | `401` |
| `mode` | `cold` |
| `covered` | `false` |
| `ID-02` | The checkout endpoint does not match the underwritten identity. |
| `TX-01` | Price is 3.7 sigma below market comparables. |
| `ID-07` | No public business registration found for the claimed legal entity. |
| `ID-03` | The domain is 19 days old. |

**Voiceover:** "The buying agent is not one we wrote. That is the whole argument."

**Why it lands:** this is the only moment where the agent is somebody else's. Do not cut to our board here, and do not narrate the reason codes: let the agent say them.

---

### 20 to 27 seconds: the priced miss

**On screen:** cut to `/board`, then to `/ledger`. The F05 cell reads **paid out**. The fund page shows the payout posting and the trial balance line.

**The numbers, verified:**

- Pinnacle Electronics Wholesale scored **970** and **cleared**. Covered.
- It never shipped.
- The fund paid the buyer **$1,420.00**.
- **$142.00** recovered from collateral, **$1,278.00** owed by the principal.
- Trial balance: **balanced**.

**Voiceover:** "It cleared. It never shipped. We paid, and the ledger balances."

**Why it is here rather than a caught cell:** showing a priced miss beats claiming perfection. Anyone can show a system catching things. Almost nobody shows one paying when it is wrong.

**Capture note:** the 18-cell board sits behind this for scale. Do not give it its own beat.

---

### 27 to 30 seconds: the card

**On screen:** black, one line.

> **Clearhouse.** A surety bond for agentic commerce.

Then, small, underneath:

> The merchant posts the bond. We underwrite them before your agent pays. We pay the buyer when our own score is wrong.

---

## If you have ten more seconds

The strongest thing left on the cutting-room floor is the loop. It is a single terminal shot:

```
npm run loop
```

Which prints, verified:

```
970 clear  ->  605 decline   (-365 points)
Scam it once, it pays you. Try the same scam twice, it is already in the immune system.
```

Nothing about the storefront changed between those two numbers. What changed is the file. If the video can carry 40 seconds, this is the beat to add.

---

## Assets checklist

- [ ] Real production URL substituted into the install line
- [ ] Terminal widened so the install line does not wrap
- [ ] `CLEARHOUSE_REPLAY_ONLY=1` set, so takes are identical
- [ ] `/board` and `/ledger` open in tabs, already loaded
- [ ] A stock Claude client with no other MCP servers installed, so the tool appearing is unambiguous
- [ ] Screen recording at 1920x1080 or better, cursor visible

## What not to do

- Do not record against a live run. A rate limit or a slow pillar costs a take.
- Do not read the reason codes aloud over the agent saying them. Two voices saying the same thing reads as a scripted demo.
- Do not show the eval page. It is the strongest artifact for a judge reading later and the weakest one in 30 seconds.
- Do not claim the fund is real. It is labeled simulated on screen, and the voiceover should not contradict the screen.
