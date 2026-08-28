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

## The gap: no API-level prompt caching

**[code]** The request body in `src/model/client.ts` sets `model`, `max_tokens`, `system`,
`messages`, `tools`, and `tool_choice`. There is **no `cache_control` block anywhere in `src/`**.

The content-hash cache only helps on an exact repeat. Within a single underwriting file, twelve calls
share the same system prompt and differ only in instruction and merchant content — so the shared
prefix is re-sent and re-billed twelve times at full input rate.

**[priced]** Cached input reads at roughly 0.1× and cache writes at roughly 1.25×. If the system
prompt is a meaningful share of the ~1,500 input tokens per call, a `cache_control` breakpoint after
the system block would cut most of that repetition on eleven of the twelve calls.

**[assumed]** This is worth doing, but the size of the win depends on how large the system prompts
actually are relative to merchant content — which nobody has measured. Measure first; the fix is one
field.

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
