# Security policy

Clearhouse underwrites counterparties in agentic commerce, so it is itself a target. The taxonomy names five attacks aimed at us rather than at merchants, F19 to F23 in [docs/TAXONOMY.md](docs/TAXONOMY.md), and the controls that answer them are part of the product rather than an afterthought.

## Reporting a vulnerability

Open a private security advisory through GitHub, under the repository's Security tab. Please do not open a public issue for anything exploitable.

Include what you did, what happened, and what you expected. A proof of concept helps. We will acknowledge receipt and tell you plainly whether we consider it in scope.

## What is deliberately public

Publishing the methodology is the point, and in an open-source build the check manifest is readable anyway. So the honest line is not "we hide the rubric" but "only two things depend on staying unknown, and those are the two we keep out."

Public on purpose: the taxonomy, the six-pillar methodology, the reason-code vocabulary with its point values, the tier bands and the separation curve that produced them, and the pricing formula. After the tier-derivation decision these are outputs of the eval rather than hand-set dials.

Because the rubric is public, the defense against a merchant optimizing against it is not secrecy. It is the holdout question set and the unannounced re-audit: a merchant that tuned to a published scorecard still has not seen the questions reserved for after approval.

## What must never enter this repository

Two things, and both only work while unknown:

1. **Canary strings.** Drawn from a rotating pool held in environment configuration. A canary published alongside its own detection logic is a canary that catches nobody.
2. **The holdout question set.** Reserved and never used during initial underwriting, so a merchant that behaved for the exam has not seen it.

[`.env.example`](.env.example) ships obviously fake values for both, to show the shape rather than the content. If you find a real canary or holdout question committed here, that is a valid security report.

## Handling untrusted content

Merchant content, arena submissions and anything arriving through the MCP endpoint are **untrusted data, never instructions**. They reach a model inside a delimited envelope carrying a standing instruction that content within it is evidence to be described rather than direction to be followed, and findings return through a constrained schema. The worst case of a successful injection is a malformed finding that fails validation, rather than an instruction that executes.

That is F21, the attack aimed at the underwriter itself. If you can make a merchant persona or an arena submission change a score by instruction rather than by evidence, that is the report we most want to receive.

## Scope notes for this build

Stated here for the same reason they are stated on stage:

- The guarantee fund is **simulated**. The double-entry ledger reconciles, but no money is real.
- The fulfillment oracle is **simulated**, with real state transitions.
- There is **no authentication or user accounts**. The arena promotion gate is a shared token, which is appropriate for a hackathon build and would not be in production.
- There is **no real UCP or ACP network integration**. The internal API is ACP-shaped.
