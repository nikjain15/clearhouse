/**
 * Clearhouse shared vocabulary.
 *
 * Types only. No logic, no imports, no IO. Every module reads this file and
 * nothing in it reads anything else, which is what lets four people own four
 * modules in parallel. See ARCHITECTURE.md section 1.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type FileId = string; // 'UF-0007'
export type MerchantId = string; // 'M-F04-northgate-outlet'
export type OrderId = string; // 'ORD-0003'
export type ClaimId = string; // 'CLM-0002'
export type RunId = string; // 'RUN-hero-01'
export type SessionId = string; // one interrogation session, for variance testing
export type ClaimNodeId = string;
export type ObservationId = string;

// ---------------------------------------------------------------------------
// Modes and decisions
// ---------------------------------------------------------------------------

/**
 * Cold: the merchant never applied and never agreed to anything. We score from
 * public surfaces and ordinary buyer-shaped interaction. No fee, no bond,
 * `covered: false`, and Clear is unreachable.
 *
 * Bonded: the merchant applied and consented. The stress exam, the
 * consent-gated identity checks and unannounced re-audit unlock, the bond is in
 * force, and the buyer is made whole when we are wrong.
 *
 * UNDERWRITING.md section 0.
 */
export type Mode = 'cold' | 'bonded';

export type Tier = 'clear' | 'conditional' | 'refer' | 'decline';

export type Pillar = 1 | 2 | 3 | 4 | 5 | 6;

/** Reason code, e.g. 'ID-03', 'CL-01', 'BX-05'. */
export type ReasonCode = string;

export type ReasonFamily = 'ID' | 'CL' | 'BX' | 'NW' | 'TX' | 'MN';

// ---------------------------------------------------------------------------
// Findings: the load-bearing persisted artifact
// ---------------------------------------------------------------------------

/**
 * The one thing that is written to the log and never recomputed.
 *
 * Pillars 2 and 3 are LLM judgments, so the determinism claim has to say
 * exactly what is deterministic. An LLM check emits findings; findings are
 * appended to the event log; the scorecard is a pure function over stored
 * findings. Replay reruns the scorecard over recorded findings and reproduces
 * the decision exactly, forever, without re-calling the model.
 *
 * PLATFORM.md section 1, "Determinism, honestly".
 */
export interface Finding {
  checkId: string;
  pillar: Pillar;
  code: ReasonCode;
  /** Points lost. Negative or zero. A finding never adds points. */
  points: number;
  /** Plain text a model can repeat to a human. 'ID-03' alone is not actionable. */
  text: string;
  /** The snippet a human can check the machine against. */
  evidence: string;
  /** True when this finding is a knockout regardless of score. */
  gate: boolean;
  /** Set for LLM-backed checks, so a transcript keeps its prompt version. */
  promptVersion: string | null;
  /** Taxonomy entries this finding bears on, for the per-class eval floors. */
  taxonomy: string[];
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export interface PillarScore {
  pillar: Pillar;
  /** Points earned after deductions. */
  earned: number;
  /**
   * Points reachable in this mode. In cold mode Pillar 3's available points
   * drop to the cold-reachable subset and are NOT renormalized, so roughly a
   * fifth of the scale stays unearned. UNDERWRITING.md section 2.
   */
  available: number;
  /** Full-scale weight, unchanged by mode. */
  weight: number;
  codes: ReasonCode[];
}

export interface Scorecard {
  score: number; // 0 to 1000
  pillars: PillarScore[];
  gatesFired: ReasonCode[];
  tier: Tier;
  mode: Mode;
  covered: boolean;
  scorecardVersion: string;
  /** True when a cold file was capped at Conditional because Clear is unreachable. */
  coldCeilingApplied: boolean;
  /** True when an unresolved high-materiality contradiction forced a refer. */
  materialityOverride: boolean;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface Pricing {
  /** Expected loss in minor units. EL = PD(score, mode) x LGD x amount. */
  expectedLossMinor: number;
  pd: number;
  lgd: number;
  lgdBasis: 'none_captured' | 'scoped_token' | 'scoped_token_plus_reserve';
  loading: number;
  correlationLoad: number;
  /** Guarantee fee in minor units. Present only when covered. */
  feeMinor: number | null;
  /** Fee as a fraction of amount. Above the cap we refuse to bond. */
  feeRate: number;
  feeCapBreached: boolean;
  collateralMinor: number;
  pricingVersion: string;
  /** Populated when a cap bound the decision rather than the score. */
  capsApplied: string[];
}

export interface ExposureState {
  perMerchantOutstandingMinor: number;
  perMerchantCapMinor: number;
  perClassOutstandingMinor: Record<string, number>;
  perClassCapMinor: number;
  fundCapitalMinor: number;
}

// ---------------------------------------------------------------------------
// The decision: what the MCP tool returns
// ---------------------------------------------------------------------------

export interface Reason {
  code: ReasonCode;
  text: string;
}

/**
 * One tool, one decision. PLATFORM.md section 2.
 *
 * `fee` and `guaranteeReference` are present only when `covered` is true.
 * `escalation` is present only on `refer`.
 */
export interface Decision {
  fileId: FileId;
  merchantId: MerchantId;
  decision: Tier;
  score: number;
  mode: Mode;
  covered: boolean;
  reasons: Reason[];
  feeMinor: number | null;
  currency: string;
  guaranteeReference: string | null;
  escalation: Escalation | null;
  amountMinor: number;
  expectedLossMinor: number;
  latencyMs: number;
  versions: Versions;
  issuedAt: string;
  /** Which layer of the degradation ladder served this. ARCHITECTURE.md section 10. */
  served: 'live' | 'model_cache' | 'last_good_run' | 'committed_hero';
}

export interface Escalation {
  /** Exactly what the human is asked to decide, so the agent renders rather than invents. */
  question: string;
  amountAtRiskMinor: number;
  topReasons: Reason[];
  contradictions: ContradictionView[];
  options: Array<{ action: 'approve_scoped' | 'decline'; terms: string }>;
}

export interface ContradictionView {
  claim: string;
  left: { channel: Channel; value: string };
  right: { channel: Channel; value: string };
  materiality: number;
}

export interface Versions {
  scorecard: string;
  checks: string;
  pricing: string;
}

// ---------------------------------------------------------------------------
// Claims graph, Pillar 2
// ---------------------------------------------------------------------------

export type Channel = 'feed' | 'conversation' | 'checkout' | 'policy_page' | 'external';

export type ClaimType =
  | 'price'
  | 'total_with_fees'
  | 'stock'
  | 'delivery'
  | 'refund'
  | 'warranty'
  | 'recurrence'
  | 'data_scope';

/** Materiality multipliers: price x5, fees x4, delivery x2, tone x1. */
export type Materiality = 5 | 4 | 2 | 1;

export interface ClaimNode {
  id: ClaimNodeId;
  type: ClaimType;
  materiality: Materiality;
  subject: string;
}

export interface Observation {
  id: ObservationId;
  claimId: ClaimNodeId;
  channel: Channel;
  /** Normalized: money in minor units, dates ISO, booleans real booleans. */
  value: string | number | boolean | null;
  evidence: string;
  /** Set for conversation observations, so variance is measurable per session. */
  sessionId: SessionId | null;
}

export interface Contradiction {
  claimId: ClaimNodeId;
  left: ObservationId;
  right: ObservationId;
  /** Normalized disagreement, 0 to 1. */
  delta: number;
  /** materiality x delta. Drives points lost. */
  severity: number;
  code: ReasonCode;
  text: string;
}

export interface ClaimsGraph {
  claims: ClaimNode[];
  observations: Observation[];
  contradictions: Contradiction[];
}

// ---------------------------------------------------------------------------
// Merchant surface, implemented by the persona runtime (Hacker 2)
// ---------------------------------------------------------------------------

export interface IdentitySurface {
  legalName: string;
  displayName: string;
  domain: string;
  domainAgeDays: number;
  tls: { valid: boolean; issuer: string; sanMatchesHost: boolean };
  registration: { found: boolean; jurisdictionClaimed: string; status: string | null };
  principals: Array<{ name: string; role: string; verified: boolean }>;
  sanctionsScreening: { hits: string[] };
  checkoutHost: string;
  independentExistence: boolean;
  category: string;
  adverseMedia: string[];
  /** Bonded only. Absent in cold mode by construction, not by oversight. */
  consentGated?: {
    beneficialOwnership: { verified: boolean; owners: string[] };
    settlementAccount: { validated: boolean };
    priorProcessorStatements: { provided: boolean; disputeRatio: number | null };
    licensing: { required: boolean; provided: boolean };
  };
}

export interface CatalogItem {
  sku: string;
  title: string;
  category: string;
  feedPriceMinor: number;
  currency: string;
  stock: 'in_stock' | 'low_stock' | 'out_of_stock';
  deliveryDays: number;
  marketComparableMinor: number;
  /** Free-text description, where F14 buries terms and F03 hides instructions. */
  description: string;
}

export interface ContentItem {
  kind: 'review' | 'qa' | 'rating_summary';
  author: string;
  body: string;
  /** Structured rating, where F08 plants machine-targeted spam. */
  rating?: number;
  ratingCount?: number;
}

export interface CheckoutQuote {
  sku: string;
  quantity: number;
  subtotalMinor: number;
  fees: Array<{ label: string; amountMinor: number }>;
  totalMinor: number;
  currency: string;
  /** What checkout demands. Beyond token scope is a hard gate. */
  dataRequested: string[];
  recurrence: 'none' | 'monthly' | 'annual';
  recurrenceDisclosed: boolean;
  checkoutHost: string;
  deliveryDays: number;
}

export interface Question {
  id: string;
  /** Which claim this question targets. Each question tests one claim through one channel. */
  claim: ClaimType | 'canary' | 'stress' | 'control';
  text: string;
  /** Set when the question carries a BX-04 buyer-embedded canary. */
  buyerCanary?: string;
  /** Set for sycophancy probes: a deliberately false premise. */
  falsePremise?: string;
  /** Set for pressure probes: an urgency or wealth signal. */
  pressureSignal?: 'urgency' | 'wealth';
  /** True for holdout questions, reserved and never used during initial underwriting. */
  holdout?: boolean;
}

export interface MerchantAnswer {
  questionId: string;
  sessionId: SessionId;
  text: string;
  /** True when the answer repeated a canary string it should not have. */
  canaryEchoed: { bx04: boolean; bx05: boolean };
  latencyMs: number;
  /** True when the merchant refused, stalled or rate-limited us. F23. */
  refused: boolean;
}

/**
 * The written policy page.
 *
 * An independent verification channel, and a necessary one: a returns-policy
 * mirage (F07) is a contradiction between what the merchant SAYS at sale and
 * what it has WRITTEN, so without this channel there is nothing for the
 * conversation to contradict. Hallucinated promises (F09) are checked against
 * it too.
 */
export interface PolicyPage {
  refundWindowDays: number;
  refundForm: 'full' | 'store_credit' | 'partial' | 'none';
  warrantyText: string;
  recurrence: string;
}

export interface MerchantSurface {
  readonly merchantId: MerchantId;
  readonly mode: Mode;
  identity(): Promise<IdentitySurface>;
  catalog(): Promise<CatalogItem[]>;
  content(): Promise<ContentItem[]>;
  policies(): Promise<PolicyPage>;
  ask(q: Question, session: SessionId): Promise<MerchantAnswer>;
  checkout(sku: string, quantity: number): Promise<CheckoutQuote>;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type AccountKind = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface LedgerLine {
  account: string; // 'fund.cash', 'collateral.M-0031', 'claims.expense'
  /** Positive debit, in minor units. Exactly one of debit or credit is non-zero. */
  debitMinor: number;
  creditMinor: number;
}

export interface LedgerPosting {
  id: string;
  memo: string;
  lines: LedgerLine[];
  /** Every posting balances. A single-sided entry is unrepresentable. */
  currency: string;
  at: string;
  refs: { fileId?: FileId; orderId?: OrderId; claimId?: ClaimId; merchantId?: MerchantId };
}

export interface TrialBalance {
  accounts: Array<{ account: string; kind: AccountKind; balanceMinor: number }>;
  totalDebitsMinor: number;
  totalCreditsMinor: number;
  balanced: boolean;
}

// ---------------------------------------------------------------------------
// Fulfillment, the delivery oracle
// ---------------------------------------------------------------------------

export type FulfillmentState =
  | 'authorized'
  | 'captured'
  | 'shipped'
  | 'in_transit'
  | 'delivered'
  | 'confirmed'
  | 'disputed'
  | 'adjudicated'
  | 'settled_by_payout'
  | 'denied'
  | 'refunded';

/**
 * Three independent sources write transitions. Disagreement between them routes
 * to adjudication rather than resolving to whoever spoke last. That rule is the
 * oracle. UNDERWRITING.md section 5.
 */
export type FulfillmentSource = 'carrier' | 'merchant_attestation' | 'buyer_confirmation' | 'system';

export interface FulfillmentTransition {
  orderId: OrderId;
  from: FulfillmentState;
  to: FulfillmentState;
  source: FulfillmentSource;
  evidence: string;
  at: string;
}

export interface Order {
  orderId: OrderId;
  fileId: FileId;
  merchantId: MerchantId;
  buyerId: string;
  amountMinor: number;
  currency: string;
  state: FulfillmentState;
  /** The binding deposition: what was promised, fixed at settlement time. */
  deposition: Deposition;
  covered: boolean;
  collateralMinor: number;
  authority: ScopedAuthority | null;
  history: FulfillmentTransition[];
}

/**
 * Merchant answers are recorded commitments. Settlement is authorized only
 * against the transcript, so a lie that evades detection still does not get
 * paid. UNDERWRITING.md section 4.
 */
export interface Deposition {
  fileId: FileId;
  totalMinor: number;
  currency: string;
  deliveryDays: number;
  refundWindowDays: number;
  refundForm: string;
  warrantyText: string;
  recurrence: string;
  /** Verbatim quotes backing each committed term. */
  quotes: Array<{ term: string; channel: Channel; text: string }>;
  recordedAt: string;
}

/**
 * Clearhouse does not hold the buyer's money. It constrains the authority:
 * scoped to a business, limited by amount and time, revocable.
 * EVIDENCE.md section 7.
 */
export interface ScopedAuthority {
  reference: string;
  merchantId: MerchantId;
  maxAmountMinor: number;
  currency: string;
  expiresAt: string;
  revoked: boolean;
  revokedReason: string | null;
}

// ---------------------------------------------------------------------------
// Claims and payouts
// ---------------------------------------------------------------------------

export type ClaimOutcome = 'paid' | 'denied' | 'adjudicating';

export interface ClaimEvidenceBundle {
  orderRecord: Order;
  fulfillmentState: FulfillmentState;
  fulfillmentHistory: FulfillmentTransition[];
  merchantCommunications: string[];
  buyerStatement: string;
  deposition: Deposition;
}

export interface ClaimUnderwriting {
  claimId: ClaimId;
  outcome: ClaimOutcome;
  reasons: Reason[];
  /** The buyer is a counterparty, not a trusted narrator. */
  buyerClaimHistory: { priorClaims: number; priorPayouts: number; claimRate: number };
  collusion: { pairScore: number; flagged: boolean };
  capsApplied: string[];
  payoutMinor: number;
  collateralAppliedMinor: number;
  residualReceivableMinor: number;
}

// ---------------------------------------------------------------------------
// Board and gauntlet views, consumed by the UI (Hacker 3)
// ---------------------------------------------------------------------------

export type CellOutcome = 'caught' | 'escalated' | 'paid_out' | 'cleared' | 'pending' | 'error';

export interface BoardCell {
  taxonomy: string; // 'F04'
  title: string;
  mode: Mode;
  merchantId: MerchantId;
  outcome: CellOutcome;
  score: number | null;
  tier: Tier | null;
  /** The pillar that caught it, shown on screen beside the taxonomy ID. */
  catchingPillar: Pillar | null;
  topReasons: Reason[];
  narrated: boolean;
  evidenceAnchor: string | null;
  latencyMs: number | null;
  fileId: FileId | null;
  served: Decision['served'] | null;
}

/**
 * F19 to F23 are not board cells. They are defended by controls rather than by
 * scoring a merchant, and a uniform cell would misrepresent how they work.
 * STRATEGY.md section 4.
 */
export interface AttackOnUsRow {
  taxonomy: string; // 'F19'
  attack: string;
  control: string;
  /** What was actually exercised to demonstrate the control holds. */
  demonstration: string;
  held: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Eval
// ---------------------------------------------------------------------------

export interface EvalRow {
  merchantId: MerchantId;
  label: 'honest' | 'fraud';
  taxonomy: string[];
  mode: Mode;
  score: number;
  tier: Tier;
  correct: boolean;
}

export interface SeparationCurve {
  /** Highest-scoring known fraud. The clear threshold sits above this. */
  highestFraudScore: number;
  /** Lowest-scoring known-honest merchant. The decline floor sits below this. */
  lowestHonestScore: number;
  /** The overlap region, where a human label is worth most. */
  overlap: { low: number; high: number; count: number };
  buckets: Array<{ from: number; to: number; honest: number; fraud: number }>;
}

export interface DerivedThresholds {
  clear: number;
  conditional: number;
  refer: number;
  derivedFrom: SeparationCurve;
  justification: string;
}

export interface ClassRecall {
  taxonomy: string;
  total: number;
  caught: number;
  recall: number;
  floor: number;
  passes: boolean;
}

export interface EvalReport {
  generatedAt: string;
  scorecardVersion: string;
  rows: EvalRow[];
  separation: SeparationCurve;
  thresholds: DerivedThresholds;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  escalationRate: number;
  perClass: ClassRecall[];
  gatePasses: boolean;
  /** Honest framing of what a self-authored set does and does not establish. */
  caveat: string;
}

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export interface ArenaSubmission {
  id: string;
  submittedAt: string;
  /** Hashed, never stored raw. */
  submitterHash: string;
  handle: string;
  /** Filtered before it renders. Never passed to a model as instructions. */
  personaText: string;
  provisionalTaxonomy: string | null; // 'F24' onward
  filtered: boolean;
  filterReasons: string[];
  outcome: CellOutcome | null;
  score: number | null;
  topReasons: Reason[];
  promoted: boolean;
}
