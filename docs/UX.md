# UX — Clearhouse

> **Provenance.** Drafted 2026-08-28 from the code in `app/`, not from a design process or user
> testing. **[code]** is read from the repository; **[inferred]** is my reading of intent and needs
> your confirmation. No user has been observed using this.

## User flow

**[code]** The landing page (`app/page.tsx` + `app/components/TryIt.tsx`) is a guided underwrite
rather than a description of one. The visitor picks a merchant and watches the file get built.

**[code]** The main path is a five-state machine, `Phase` in `TryIt.tsx:25`:

```
idle  →  finding  →  examining  →  reasons  →  verdict
```

**[inferred]** The sequence is doing rhetorical work, not just loading: it shows the evidence being
gathered *before* it shows the number, so the score arrives as a conclusion the visitor watched being
reached rather than an assertion to be taken on faith. For a product whose whole claim is "trust this
score", that ordering is the argument.

**[code]** Supporting surfaces, each a page: `/board` (the gauntlet — all taxonomy entries resolving
to caught / escalated / paid-out), `/registry`, `/ledger`, `/eval`, `/arena`, `/adjudicate`,
`/promote`.

## States

| State | Treatment |
|---|---|
| Empty | **[code]** Not a state. `TryIt` opens with `merchants[0]` preselected, so the first paint is a live example, not a blank form. |
| Loading | **[code]** The four working phases *are* the loading state — progressive disclosure instead of a spinner. The submit button carries `disabled={running}` with `disabled:opacity-60`. |
| Success | **[code]** A verdict with a score shown `/ 1000` (`TryIt.tsx:249`) and reason codes. |
| Error | **[gap]** No error branch is visible in `TryIt.tsx` — no `catch`, no error state in `Phase`. |
| Slow / unsure model | **[code]** Handled below the UI rather than in it: `CLEARHOUSE_LATENCY_TARGET_MS=30000`, anything slower served from the content-hash cache, and `CLEARHOUSE_REPLAY_ONLY=1` as the switch to throw if conference wifi dies. The degradation ladder is real; it just never surfaces a message. |

**The honest gap:** the demo path is well defended, and the failure path is undefined. Because the
hero path is scripted and cached, an error is unlikely in the demo — which is exactly why nobody has
had to design what it looks like.

## Feedback loop

**[code]** Stronger than most products have, and it is a *product* loop rather than a support inbox:

1. A miss becomes a candidate eval case automatically.
2. `/promote` is the human gate — a person promotes an arena attack into the permanent eval set
   (`app/promote/page.tsx`).
3. Promotion is token-gated (`CLEARHOUSE_PROMOTION_TOKEN`); unset means the route returns 503.
4. No new version ships without clearing per-class recall floors (`npm run eval:gate`).

**[code]** The arena is open only inside an explicit window, capped at 5 submissions/hour and 4,000
characters, and becomes a read-only archive otherwise.

**[inferred]** The demo moment this buys: scam it once and it pays you; try the same scam twice and it
is already in the immune system.

## Accessibility

**[code]** Measured, not estimated:

| Check | State |
|---|---|
| Semantic buttons, `disabled` state | ✅ present |
| ARIA labels | ❌ one `aria-hidden` in the entire app (`app/page.tsx:116`) |
| Visible focus styles | ❌ no `focus` rule in `app/globals.css` |
| Keyboard path through the underwrite | ❓ untested |
| WCAG AA contrast | ❓ unverified |

**This is the weakest part of the product's surface.** A keyboard-only or screen-reader user has not
been considered. It is also cheap to fix relative to everything else here: focus-visible styles and
labels on the merchant selector and submit control would close most of it.

## Critique

- **P0 — no error state.** Any failure outside the cached path has no defined appearance. The
  degradation ladder protects the demo; it does not protect a real user.
- **P1 — no visible focus, effectively no ARIA.** Keyboard and assistive-technology users are
  currently unsupported.
- **P2 — eight pages, one narrative.** `/board`, `/ledger`, `/eval`, `/registry`, `/arena`,
  `/adjudicate`, `/promote` each make sense when narrated live. `[inferred]` Without narration, it is
  not obvious which to visit after the landing page, or in what order.
