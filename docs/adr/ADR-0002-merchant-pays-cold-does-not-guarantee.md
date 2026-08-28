# ADR-0002 — The merchant pays, and cold mode scores without guaranteeing

**Status:** accepted · **Date:** 2026-08-16 (recorded 2026-08-28) · **Source:** STRATEGY.md §1.4

## Decision
The merchant funds the bond, making the rated party the paying party — disclosed rather than hidden.
Only **bonded** merchants are covered. **Cold** mode underwrites a merchant who never applied, from
public surfaces, and answers "should your agent buy from these people" for free; it does not pay out.

## Rejected
- **Buyer-funded coverage.** Would remove the conflict, but there is no buyer relationship at the moment
  the agent needs the answer.
- **Guaranteeing cold merchants.** Writing protection on a stranger while billing nobody is not a business.

## Trade-off accepted
The rated party pays us, which is the exact conflict that discredited the ratings agencies. The
mitigation is structural rather than promissory: **we pay when our score is wrong, from a fund our own
pricing must keep solvent.** Being wrong costs us money — the incentive no rating agency ever had.

## Reversal trigger
`[inferred]` If loss experience shows pricing cannot stay solvent while the merchant funds it, the
payer has to change or the guarantee has to shrink.
