# ADR-0004 — MCP first, one tool, one decision

**Status:** accepted · **Date:** 2026-08-16 (recorded 2026-08-28) · **Source:** STRATEGY.md §1.11, PLATFORM.md §2

## Decision
Ship as an MCP server so adoption is one URL and no SDK. **One tool**,
`check_merchant_before_buying`: merchant, amount, currency, what is being bought, returning a decision
the agent can act on without further reasoning. A packaged agent skill carries the escalation policy;
an ACP-shaped REST API sits underneath both.

## Rejected
- **A six-tool suite** (score, price, bond, claim, dispute, verify). More expressive, and it would not
  get used: a six-tool surface is an integration project, and the adoption moment is one line in a config.
- **SDK-first distribution.** An SDK is a dependency decision; a URL is not.

## Trade-off accepted
One tool cannot express everything the engine can do, so advanced flows go through REST and are not
reachable from the MCP surface. Expressiveness traded for a one-line install.

## Reversal trigger
Real integrators repeatedly needing a capability the single tool cannot express — at which point the
second tool must earn its place rather than arrive as a suite.
