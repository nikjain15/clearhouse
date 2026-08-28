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
| Error | **[code]** Handled where failure is possible. `ArenaClient.tsx` catches and renders `error: 'network'`; `PromoteClient.tsx` holds an error state and explains the missing token. `TryIt.tsx` has no error branch because **it makes no network call** — the landing demo is a scripted `setTimeout` sequence over pre-baked reasons, so there is nothing to fail. |
| Slow / unsure model | **[code]** Handled below the UI rather than in it: `CLEARHOUSE_LATENCY_TARGET_MS=30000`, anything slower served from the content-hash cache, and `CLEARHOUSE_REPLAY_ONLY=1` as the switch to throw if conference wifi dies. The degradation ladder is real; it just never surfaces a message. |

**Correction.** An earlier draft of this file called the missing error state a P0. That was wrong on
two counts: the components that can fail already handle it, and the one that does not — `TryIt` —
cannot fail, because it never touches the network. The landing page is an illustration of an
underwrite, not an underwrite. That is a defensible choice for a demo whose worst enemy is conference
wifi, and it should be stated plainly rather than discovered by a reader.

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
| Semantic buttons, `disabled` state | ✅ present — the chooser and the run control are real `<button>`s, so the flow is keyboard-operable |
| Visible focus | ✅ **corrected** — an earlier draft called this missing. There is no custom focus style, but nothing sets `outline: none` either, so the browser default ring is intact |
| Selection state exposed | ✅ **fixed** — the chosen merchant was conveyed by border colour and shadow only; now `aria-pressed` |
| Progress and verdict announced | ✅ **fixed** — the theatre advances on timers and previously updated silently; now `aria-live="polite"` with `aria-busy` while running |
| WCAG AA contrast | ✅ **verified and fixed** — three muted greys failed AA for normal text; all now pass. Every text colour in `app/` was measured, not sampled |

**Corrected assessment.** The first draft called this the weakest part of the surface and said
keyboard users were unsupported. Measured, that was too harsh: the controls are semantic buttons and
focus rings were never suppressed, so the flow was always keyboard-operable. The real gap was narrower
and worth fixing — a screen-reader user could not tell which merchant was selected, and got silence
while the underwrite progressed. Both are closed. Contrast has since been measured and fixed — see below.

## Critique

- ~~**P0 — no error state.**~~ **Withdrawn.** The components that can fail handle it; `TryIt` makes no
  network call. See the correction above.
- ~~**P1 — no visible focus, effectively no ARIA.**~~ **Half withdrawn, half fixed.** Focus rings were
  never suppressed. The genuine gaps — unannounced selection and unannounced progress — are closed.
- ~~**P1 — contrast unverified.**~~ **Fixed.** Every text colour in `app/` was measured against its
  actual background. Three failed AA for normal text and were darkened by the smallest amount that
  clears 4.5:1, so the muted look survives:

  | Colour | Was | Now | Used for |
  |---|---|---|---|
  | `#8593a6` → `#6a7685` | 3.12:1 ❌ | 4.62:1 ✅ | secondary body text, 11.5–12.5px |
  | `#7a8aa0` → `#687588` | 3.52:1 ❌ | 4.68:1 ✅ | uppercase section labels, 11px |
  | `#8b93a6` → `#6e7483` | 3.08:1 ❌ | 4.68:1 ✅ | uppercase label, 12px |

  One colour that looks like a failure is not one: `#e6ecf5` reads 1.19:1 against white, but it is
  only ever used on `#0A2540` (the code block), where it measures **13.08:1**. Contrast is a property
  of a pair, not of a colour — checking against white alone would have produced a wrong fix.
- **P2 — eight pages, one narrative.** `/board`, `/ledger`, `/eval`, `/registry`, `/arena`,
  `/adjudicate`, `/promote` each make sense when narrated live. `[inferred]` Without narration, it is
  not obvious which to visit after the landing page, or in what order.
