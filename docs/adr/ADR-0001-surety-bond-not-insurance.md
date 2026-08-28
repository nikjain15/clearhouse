# ADR-0001 — A surety bond, not insurance and not escrow

**Status:** accepted · **Date:** 2026-08-16 (recorded 2026-08-28) · **Source:** STRATEGY.md §1.3

## Decision
The money layer is structured as a **surety bond**. The merchant is the principal and posts the bond,
the buyer is the obligee, and Clearhouse pays the obligee then recovers from the principal. Payment
authority is *constrained* rather than escrowed: ACP Shared Payment Tokens scoped to a business,
limited by amount and time, and revocable. Reserves are collateral under an indemnity agreement.

## Rejected
- **Calling it insurance.** Different regulatory surface, and it misdescribes who the protected party is.
- **Holding buyer funds / escrow.** Sitting in the flow of funds is the thing that makes this a money
  transmission problem rather than an underwriting one. Standard surety practice does not require it.

## Trade-off accepted
Recovery from the principal is a real collections problem that escrow would have made trivial. We take
counterparty risk on the merchant in exchange for never touching buyer money.

## Reversal trigger
`[inferred]` If constrained payment authority proves unenforceable in practice — a token that cannot
actually be revoked mid-flight — the no-escrow position loses its safety and would need revisiting.
