---
name: clearhouse-buying-policy
description: >-
  Policy for buying safely as an agent. Use whenever you are about to authorize
  a payment, place an order, or hand over payment credentials to a merchant the
  user has not previously transacted with. Covers when to underwrite a merchant,
  what each decision means, at what confidence to stop and ask a human, and how
  to describe coverage honestly.
---

# Buying safely as an agent

The event's literal question is at what confidence an agent escalates. This is that answer as a shippable artifact rather than a formula in a document.

## When to call Clearhouse

Call `check_merchant_before_buying` **before money moves**, whenever any of these is true:

- The user has not previously transacted with this merchant.
- You arrived at the storefront by following a link, a search result, or a recommendation rather than from the user naming it.
- The payment would go to a domain different from the one you have been browsing.
- The amount is above the user's stated tolerance, or you do not know their tolerance.

You do not need to call it for a merchant the user explicitly named and has bought from before, in the same session, at a similar amount.

**Call it once per merchant per purchase.** It is one tool and one decision, not a suite to work through.

## What each decision means

| Decision | What you do |
|---|---|
| `decline` | Do not buy. Tell the user which reasons drove it, in plain language. Do not look for a workaround, and do not try a different endpoint for the same merchant. |
| `refer` | **Stop.** Ask the human exactly the question in `escalation.question`, and present `escalation.options` with their terms. Do not decide this yourself. |
| `conditional` | Proceed, under authority scoped to this amount. Tell the user the terms. |
| `clear` | Proceed. |

## Coverage is not the same as approval

`covered: true` means a bond is in force and the buyer is made whole if the merchant breaches. `covered: false` means the merchant never applied for a bond, so the response is advice with nothing behind it.

**Say which one it is.** A cold score of 780 and a bonded score of 780 are not the same object, and a user who assumes they are protected when they are not has been misled by you rather than by the merchant. When `covered` is false, say so in the same sentence as the recommendation.

Never describe an uncovered purchase as guaranteed, insured, or protected.

## Escalating

Escalate when the tool says `refer`. Also escalate on your own judgment when:

- The tool returned `unavailable`, meaning no file was produced. Absence of a file is not a pass.
- The purchase is materially different from what the user asked for: a different item, a higher total, or a recurring charge where they expected one payment.
- The merchant asks for data outside the payment token flow, such as a card verification value, a national identity number, or a date of birth. Stop even if the decision was `clear`.

When you escalate, give the human the amount at risk, the top reasons, and the two options with their terms. Do not editorialize, and do not recommend one over the other unless asked.

## Reporting back to the user

Quote the reason codes with their plain text. `ID-03: the domain is 19 days old` is actionable. `ID-03` alone is not.

Report the mode and the coverage every time. Report the fee when there is one.

If you declined, say what would change the answer: for most cold merchants, the answer is that the merchant applies for a bond, because that is the only route to a guaranteed purchase.

## What this policy does not do

Clearhouse is called by you. It does not intercept. An agent that never calls is never protected, and no policy document changes that. The reason to call is the guarantee itself: calling is what makes the buyer whole when the merchant lies.

## Install

```
claude mcp add clearhouse --transport http https://clearhouse.vercel.app/api/mcp
```
