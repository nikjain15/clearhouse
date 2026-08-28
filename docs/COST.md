# Cost — Clearhouse

> **Provenance.** This document was drafted from the code, not from measurement. Every line is
> marked: **[code]** is read directly from the repository, **[priced]** applies published Anthropic
> rates to a **[code]** fact, and **[assumed]** is an inference that needs your confirmation or a
> real measurement to replace it. Nothing here came from a bill.

## What a call costs

**[code]** Two models, set in `src/model/client.ts`:

| Role | Model | Where |
|---|---|---|
| The six evidence pillars | `claude-sonnet-5` | `CLEARHOUSE_MODEL_CHECKS` |
| Adjudication and claim underwriting | `claude-opus-5` | `CLEARHOUSE_MODEL_ADJUDICATION` |

**[priced]** Published rates, per million tokens:

| Model | Input | Output |
|---|---|---|
| Sonnet 5 | $2.00 | $10.00 |
| Opus 5 | $5.00 | $25.00 |

## Cost per underwriting file

**[code]** The engine makes **12 model calls** per file, one per check that needs a judgment —
pillar 1 ×1, pillar 2 ×4, pillar 3 ×6, pillars 4-6 ×1. Cold intake and the arena add one call each,
outside the file. `max_tokens` defaults to 2048 (`src/model/client.ts`), and every call is forced to
a single `report` tool, so output is a small JSON object rather than prose.

**[code]** Each call sends a system prompt, an instruction, and the merchant's untrusted content
wrapped by `envelope()`. Persona fixtures in `config/personas/` run 1.9–3.1 KB, ~2.4 KB median.

**[assumed]** Taking ~2.4 KB of merchant content plus system and instruction at roughly 1,500 input
tokens per call, and tool output at roughly 150 tokens:

```
per call    12 × (1,500 × $2/1M  +  150 × $10/1M)  =  12 × $0.0045  ≈  $0.054
per file    ≈ 5.4 cents, cold, Sonnet only
```

**[assumed]** Adjudication on Opus 5 is not in that figure. If it is one call at similar size, add
roughly $0.011, giving **≈ 6.5 cents per fully adjudicated file**.

**Replace the assumed numbers before quoting them.** `messages.count_tokens` on one real persona
would turn all three into measurements. The order of magnitude — cents, not dollars — is what the
code supports today.

## Alternatives already in the design

**[code]** The content-hash cache in `src/model/client.ts` keys on
`sha256(model, system, instruction, untrusted, promptVersion)` and is checked before any network
call. A repeated underwrite of an unchanged merchant costs **$0**. This is the single largest cost
lever in the system and it is already built.

**[code]** `CLEARHOUSE_REPLAY_ONLY=1` refuses live calls entirely and serves only the cache. CI sets
it on the build step, so the production build costs nothing to run.

## Prompt caching does not apply here — a correction

**An earlier draft of this file claimed that twelve calls share one system prompt, which is re-sent
and re-billed twelve times, and that a `cache_control` breakpoint would cut most of it. Both halves
were wrong.** The correction, measured:

**[code]** Each of the twelve checks has its **own** system prompt — 12 distinct `system:` sites
across `pillar1.ts` (1), `pillar2.ts` (4), `pillar3.ts` (6), `pillar456.ts` (1). Nothing is shared
between them.

**[code]** Those prompts are **8 to 45 tokens** each:

| File | System prompts | Range |
|---|---|---|
| `pillar1.ts` | 1 | ~12 tokens |
| `pillar2.ts` | 4 | 36–45 tokens |
| `pillar3.ts` | 6 | 17–45 tokens |
| `pillar456.ts` | 1 | ~8 tokens |

**[priced]** The minimum cacheable prefix is 512–4096 tokens depending on the model. These prompts are
one to two orders of magnitude below the floor, so a `cache_control` block on them would cache nothing
at all — and silently, with no error.

**[code]** Nor is there a shared prefix further down. The user message is
`instruction + envelope(untrusted)`, and the instruction differs per check, so the merchant content
that follows it never lands at a common prefix position across calls.

**Conclusion: API-level prompt caching is not applicable to this workload as it is built.** It would
become applicable only if the checks were restructured to share a large common preamble — which is a
design change to justify on its own merits, not a cost optimisation to slip in.

**The caching that does work here is the one already built:** the content-hash cache makes a repeated
underwrite of an unchanged merchant cost exactly $0. For a demo that runs the same personas
repeatedly, that is the dominant effect, and it is a stronger result than prefix caching would give.

## Cost is now measured

**[code]** `src/model/client.ts` reads the `usage` block off every response and prices it with the
rate table in `src/model/pricing.ts`. The result is persisted on the cache entry
(`CachedModelCall.usage`) and returned on `Judged.usage`, so cost lands in the event store next to
latency instead of being estimated in this document.

A cache hit carries no usage, because it costs nothing. The estimates above stay marked `[assumed]`
until a live run replaces them with recorded totals — at which point this section should quote the
real number and the estimate should be deleted.

## Operating point and caps

**[code]** What is bounded today:

- `CLEARHOUSE_LATENCY_TARGET_MS=30000` — latency per file has a target, and anything slower is served
  from cache.
- `CLEARHOUSE_ARENA_RATE_LIMIT_PER_HOUR=5` and `CLEARHOUSE_ARENA_MAX_CHARS=4000` — the one
  unauthenticated endpoint that can spend money is bounded on both frequency and input size.
- The arena opens only inside an explicit time window; unset or unparseable means closed.
- Cold intake is off by default (`CLEARHOUSE_LIVE_FETCH`), so an unknown merchant returns unavailable
  rather than triggering a fetch and an extraction call.

**What is not bounded:** there is no spend cap, no per-key budget, and no cost recorded anywhere.
`src/model/client.ts` does not read `usage` from the API response, so input and output tokens are
never captured, and `onCall` reports `served` and `latencyMs` but not cost.

**This is the honest headline: latency has a target and a fallback; cost has neither.** In a product
whose thesis is pricing risk correctly, the cost of producing the price is the one number not
currently measured. Reading `usage` off each response and logging it to the event store is the
smallest change that would fix it.
