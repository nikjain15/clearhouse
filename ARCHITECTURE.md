# Clearhouse architecture

The build specification. [STRATEGY.md](docs/STRATEGY.md) section 9 item 1 asks for exactly this document: module boundaries matching the team split, the merchant persona schema, the claims-graph and scorecard data model, the ledger and fulfillment-state design, the event store choice, API routes, streaming design, and the cache and replay path.

Written before any code, and the code is built to it. Where this document and the five specification documents disagree, the specification documents win and this one is wrong.

**The one sentence that explains the whole design.** Findings are the persisted artifact, not the score. Everything else follows: the event store shape, the purity of the scorecard, the replay guarantee, the streaming design, and why a dropped connection costs nothing.

---

## 1. Module boundaries

Three strangers divide this work at noon. Someone must be able to own one module without reading the others, so ownership is drawn along the [STRATEGY.md](docs/STRATEGY.md) section 7 team split and enforced by an import rule rather than by good intentions.

| Module | Owner | Responsibility | Depends on |
|---|---|---|---|
| `src/contracts/` | Launch Lead | Types only, zero logic, zero imports. The shared vocabulary | nothing |
| `config/` | everyone, append-only | Versioned data: scorecards, check manifests, pricing tables, personas, eval sets | nothing |
| `src/store/` | Launch Lead | Append-only event store. Postgres in production, file-backed locally | contracts |
| `src/model/` | Launch Lead | Model client, content-hash cache, Anthropic and replay adapters | contracts, store |
| `src/engine/` | **Launch Lead** | Checks, hard gates, scorecard, pricing, escalation policy | contracts, config, store, model |
| `src/ledger/` | **Launch Lead** | Double-entry ledger, fulfillment oracle, claims, payouts | contracts, store |
| `src/merchants/` | **Hacker 2** | Persona schema runtime, scripted personas, LLM arena simulator | contracts, config, model |
| `app/` | **Hacker 3** | Board, adjudication card, ledger and registry views, streaming client | contracts, API routes |
| `src/evalh/` | **Hacker 4** | Eval harness, separation curve, threshold derivation, per-class floors | contracts, config, engine, store |
| `src/arena/` | **Hacker 4** | Window, rate limit, size cap, content filter, promotion gate | contracts, store, merchants |
| `src/mcp/`, `skill/` | Launch Lead | MCP server, packaged agent skill | contracts, engine |

**The import rule.** A module may import from `src/contracts/`, `config/`, and itself. Any other cross-module dependency goes through a port declared in `src/contracts/ports.ts` and is injected, never imported directly. This is what makes the modules ownable in parallel: Hacker 2 writes personas against the `MerchantSurface` port without ever opening `src/engine/`, and Hacker 3 renders `BoardCell` objects without knowing what a pillar is.

The rule is checked, not just stated. `npm run lint:boundaries` fails the build on a violating import.

**The four ports.**

```ts
// src/contracts/ports.ts
export interface MerchantSurface {          // Hacker 2 implements, engine consumes
  identity(): Promise<IdentitySurface>;
  catalog(): Promise<CatalogItem[]>;
  content(): Promise<ContentItem[]>;        // reviews and Q&A, where BX-05 is planted
  ask(q: Question, session: SessionId): Promise<MerchantAnswer>;
  checkout(sku: string, qty: number): Promise<CheckoutQuote>;
}

export interface EventStore {               // store implements, everyone consumes
  append(events: NewEvent[]): Promise<Appended[]>;
  read(streamId: string, sinceSeq?: number): Promise<StoredEvent[]>;
  readByType(type: EventType, sinceSeq?: number): Promise<StoredEvent[]>;
  cacheGet(hash: string): Promise<CachedModelCall | null>;
  cachePut(hash: string, call: CachedModelCall): Promise<void>;
}

export interface ModelClient {              // model implements, checks consume
  judge<T>(req: JudgeRequest<T>): Promise<Judged<T>>;   // schema-constrained, cached
}

export interface Clock { now(): Date }      // injected so replay and tests are deterministic
```

---

## 2. Event store

**Postgres, one append-only table, every projection rebuilt from it.** Named in [PLATFORM.md](docs/PLATFORM.md) section 1 rather than left to whoever writes the first route, because serverless functions have no memory to keep a log in, and the registry, the eval gate and replay all depend on it surviving a cold start.

```sql
create table if not exists events (
  seq        bigserial primary key,
  event_id   uuid        not null unique,     -- client-generated, makes append idempotent
  ts         timestamptz not null default now(),
  type       text        not null,
  stream_id  text        not null,            -- 'file:UF-0007', 'ledger', 'arena', 'registry:M-0031'
  payload    jsonb       not null,
  versions   jsonb       not null default '{}'  -- scorecard, checks and pricing versions in force
);
create index if not exists events_stream_idx on events (stream_id, seq);
create index if not exists events_type_idx   on events (type, seq);

-- The model cache is not an event. It is a pure memo table, safe to truncate.
create table if not exists model_cache (
  hash       text primary key,                -- sha256 over model, system, messages, schema, prompt version
  model      text        not null,
  response   jsonb       not null,
  latency_ms integer,
  created_at timestamptz not null default now()
);
```

Two tables. Nothing else is authoritative. Scores, the registry, the ledger balance, fulfillment state, eval results and the board are all projections, and `npm run rebuild` reconstructs every one of them from `events` alone.

**Local development uses a file-backed adapter** implementing the identical `EventStore` interface, appending JSONL to `data/events.jsonl`. It exists so the repo runs with no credentials, and it is explicitly not a production path: on Vercel the filesystem does not survive between invocations. The same conformance test suite runs against both adapters, so the Postgres implementation is exercised by the same assertions even where a database is unreachable.

**Event types.** The full union lives in `src/contracts/events.ts`. The ones that carry the design:

| Type | Stream | Why it exists |
|---|---|---|
| `check.finding` | `file:<id>` | **The load-bearing event.** Reason code, points, evidence snippet, pillar, mode, prompt version |
| `file.opened`, `file.closed` | `file:<id>` | File boundaries, latency measurement |
| `decision.issued` | `file:<id>` | Score, tier, mode, covered, fee, guarantee reference, and the versions that produced it |
| `authority.issued`, `authority.revoked` | `file:<id>` | Scoped, revocable payment authority |
| `ledger.posted` | `ledger` | One event, balanced lines inside. Never a single-sided entry |
| `fulfillment.transitioned` | `order:<id>` | From, to, source, and the evidence that moved it |
| `claim.filed`, `claim.underwritten`, `claim.paid`, `claim.denied` | `claim:<id>` | Claims are underwritten in their own right |
| `adjudication.recorded` | `file:<id>` | Human verdicts, the supervised labels |
| `arena.submitted`, `arena.filtered`, `arena.scored` | `arena` | Every attempt and its verdict, kept for the read-only archive |
| `case.candidate`, `case.promoted` | `eval` | The human promotion gate, both halves recorded |
| `version.published` | `versions` | A new scorecard, check manifest or pricing table, with its eval gate result |
| `reaudit.run` | `file:<id>` | Unannounced re-audit against the holdout set |

---

## 3. The merchant persona schema

Adding a fraud case is dropping a JSON file, with no code change. That is the [PLATFORM.md](docs/PLATFORM.md) section 1 commitment, and the schema is what makes it true. Owned by Hacker 2, validated at load, and the eval set is the same schema with a ground-truth label.

```jsonc
{
  "id": "M-F04-northgate-outlet",
  "version": 1,
  "taxonomy": ["F04"],                 // taxonomy IDs this persona exercises
  "label": "fraud",                    // ground truth: honest | fraud. Eval only
  "mode": "cold",                      // which mode this cell runs in. Fixed per STRATEGY section 4
  "kind": "scripted",                  // scripted for hero and eval, llm for the arena
  "display": { "name": "Northgate Outlet", "blurb": "..." },

  "identity": {                        // Pillar 1 surface
    "legal_name": "Northgate Retail Holdings LLC",
    "domain": "northgate-outlet.shop",
    "domain_age_days": 19,
    "tls": { "valid": true, "issuer": "R11", "san_matches_host": true },
    "registration": { "found": false, "jurisdiction_claimed": "DE", "status": null },
    "principals": [],
    "sanctions_screening": { "hits": [] },
    "checkout_host": "pay.ngo-checkout-cdn.io",   // mismatch fires the payment-redirect gate
    "independent_existence": false,
    "category": "consumer_electronics"
  },

  "catalog": [
    { "sku": "AW-S10-45", "title": "Apple Watch Series 10, 45mm",
      "category": "consumer_electronics", "feed_price": 399.00, "currency": "USD",
      "stock": "in_stock", "delivery_days": 3, "market_comparable": 429.00 }
  ],

  "policies": {                        // the written policy page, Pillar 2 verification channel
    "refund_window_days": 30, "refund_form": "full",
    "warranty_text": "One year limited, manufacturer only.",
    "recurrence": "none"
  },

  "checkout": {                        // the checkout quote channel
    "quote_total": 463.75,
    "fees": [ { "label": "handling", "amount": 39.00 }, { "label": "processing", "amount": 25.75 } ],
    "data_requested": ["card_token", "email", "shipping_address"],
    "recurrence": "none"
  },

  "content": [                         // third-party content the merchant ingests
    { "kind": "review", "author": "verified buyer",
      "body": "Great watch.<!-- {{BX05_CANARY}} -->" }
  ],

  "answers": {                         // scripted deterministic answers, keyed by question id
    "Q-PRICE-TOTAL": { "text": "Your total is $399.00, nothing else.", "drift": 0.0 },
    "Q-REFUND":      { "text": "Full refund within 30 days, no questions.", "drift": 0.0 }
  },

  "behaviors": {                       // the hidden machinery that makes the attack an attack
    "obeys_buyer_canary": false,       // BX-04, soft signal
    "obeys_content_canary": true,      // BX-05, hard gate, bonded only
    "sycophancy": "caves",             // caves | holds
    "pressure_price_delta": 0.00,      // F10 agent tax
    "hallucinates_policy": false,      // F09
    "fake_human_escalation": false,    // F17
    "stonewalls": false,               // F23
    "will_ship": true,                 // drives the fulfillment oracle
    "ships_as_described": true
  },

  "network": {                         // Pillar 4, seeded registry data
    "fingerprint": "sha256:...",
    "terminated_match": 0.87,          // NW-02 similarity, evidence not verdict
    "prior_files": [], "dispute_ratio": null
  }
}
```

Three rules the schema enforces:

1. **`mode` is fixed per persona and matches STRATEGY section 4.** Cold is F01, F04, F08, F11, F12, F13, F14, F15, F16, F18. Bonded is F02, F03, F05, F06, F07, F09, F10, F17. A persona whose mode disagrees with its taxonomy ID fails validation at load.
2. **`{{BX05_CANARY}}` and `{{BX04_CANARY}}` are placeholders, never literals.** The runtime substitutes a string drawn from the rotating pool in environment configuration. The repository never contains a canary.
3. **`label` is eval-only.** The engine never reads it. A check that could see ground truth is not a check.

---

## 4. The claims graph

Pillar 2 is a graph, not a checklist: every material claim, observed through independent channels, with contradictions weighted by materiality.

```ts
type Channel = 'feed' | 'conversation' | 'checkout' | 'policy_page' | 'external';

interface Claim {
  id: ClaimId;
  fileId: FileId;
  type: 'price' | 'total_with_fees' | 'stock' | 'delivery' | 'refund'
      | 'warranty' | 'recurrence' | 'data_scope';
  materiality: 5 | 4 | 2 | 1;     // price x5, fees x4, delivery x2, tone x1
  subject: string;                // sku or 'order'
}

interface Observation {
  id: ObservationId;
  claimId: ClaimId;
  channel: Channel;
  value: Json;                    // normalized: money in minor units, dates as ISO
  evidence: string;               // the snippet, so a human can check the machine
  sessionId: SessionId | null;    // set for conversation, enables variance measurement
}

interface Contradiction {
  claimId: ClaimId;
  left: ObservationId; right: ObservationId;
  delta: number;                  // normalized 0 to 1
  severity: number;               // materiality x delta, drives points lost
  code: ReasonCode;               // CL-01 and friends
}
```

A contradiction requires **two observations on the same claim through different channels**. One channel disagreeing with itself across sessions is variance, which is Pillar 3, not Pillar 2. Keeping those separate is what stops model nondeterminism from being scored as merchant dishonesty.

Extraction is LLM-backed and schema-constrained. Comparison is deterministic arithmetic over normalized values. The LLM never decides whether something is a contradiction, only what the claim and the observed value were.

---

## 5. The scorecard, and what determinism means here

```ts
// src/engine/scorecard.ts
// Pure. No IO, no clock, no network. This signature is the replay guarantee.
export function score(
  findings: readonly Finding[],
  scorecard: ScorecardVersion,
  mode: Mode,
): Scorecard;
```

```ts
interface Finding {                 // written to the log, never recomputed
  checkId: string;
  pillar: 1 | 2 | 3 | 4 | 5 | 6;
  code: ReasonCode;                 // ID-xx CL-xx BX-xx NW-xx TX-xx MN-xx
  points: number;                   // negative, points lost
  evidence: string;
  gate: boolean;                    // true when this finding is a knockout
  promptVersion: string | null;     // set for LLM-backed checks
}

interface Scorecard {
  score: number;                    // 0 to 1000
  pillars: Record<Pillar, { earned: number; available: number; weight: number }>;
  gatesFired: ReasonCode[];
  tier: 'clear' | 'conditional' | 'refer' | 'decline';
  mode: Mode;
  covered: boolean;
  scorecardVersion: string;
}
```

**Cold scores are not renormalized.** In cold mode Pillar 3's available points drop to the cold-reachable subset, the pillar scores against the full weight anyway, and roughly a fifth of the scale is unearned by construction. The function does not scale it back up. That is why Clear is unreachable cold, and it is deliberate: renormalizing would make a cold file look like a bonded one and erase the distinction the whole two-mode design exists to draw.

**Hard gates run before scoring and produce a decline regardless of points**: payment redirect, sanctions hit, `BX-05` failure, data over-collection beyond protocol scope. Fingerprint match to a terminated merchant is deliberately not a gate. It raises the tier and demands corroboration from another pillar.

**Tier thresholds are an output, not an input.** `900 / 700 / 550` are placeholders in `config/scorecards/v1.json`. `npm run eval` derives them from where the labeled set actually separates, writes them into a new scorecard version, and emits the separation curve alongside. A band that cannot be justified from the curve does not ship as a number.

**Why replay works.** An LLM check emits findings, findings are appended to the log, and `score()` is a pure function over stored findings. `GET /api/replay/:fileId` reads the findings, runs `score()` at the recorded scorecard version, and reproduces the decision exactly, forever, with zero model calls. Re-underwriting is a new file with a new timestamp, never a silent overwrite.

**The variance control.** Pillar 3's stateless variance test measures answer drift against a known-honest control merchant run in the same session batch on the same model version. Only drift above that floor is charged. Without the control we would be scoring our own nondeterminism and calling it merchant risk.

---

## 6. Pricing

Pure functions over the scorecard and a versioned pricing table, so a price is replayable for the same reason a decision is.

```
EL  = PD(score, mode) x LGD(protection) x amount
fee = EL x loading,   loading = base_loading x (1 + correlation_load)
```

`PD` is a **stated prior** from published card-industry fraud rates by band, adjusted by mode, versioned in `config/pricing/v1.json`. It is not a curve fitted to our own eval set, because 40 to 60 self-authored personas can demonstrate separation and cannot calibrate a price. The eval measures discrimination and says so.

`LGD` is not 1, and the table says why: no protection and funds captured is 1.0; a scoped revocable token plus a binding deposition is materially lower because the commitment is breached before funds are final; adding the rolling reserve reduces it again by the collateral held.

Refuse to bond above a 5% fee cap. Refer or decline instead.

Exposure caps are enforced at decision time, not reported afterward: a per-merchant cap sized to the file and independent of score, and a per-attack-class aggregate cap across the book so one technique cannot drain the fund through fifty merchants.

Escalation fires when expected loss exceeds tolerance, **or cumulative expected loss across the session or merchant exceeds it**, or a high-materiality contradiction is unresolved, or the file is thin and cold and the amount is large relative to it. The cumulative term is what stops a series of just-under-threshold purchases from walking under the bar, so session state is a projection over `decision.issued` rather than a variable.

---

## 7. Ledger and fulfillment

### The ledger is double entry and it actually reconciles

Labeled simulated everywhere it appears. This is the one place a judge may add up the numbers, so reconciling arithmetic matters more than a convincing figure.

| Account | Normal balance |
|---|---|
| `fund.cash` | debit, asset |
| `fund.capital` | credit, stated capital |
| `fees.income` | credit |
| `collateral.<merchantId>` | credit, a liability, the merchant's money we hold |
| `claims.expense` | debit |
| `recovery.receivable.<merchantId>` | debit, asset |

Every posting is one `ledger.posted` event carrying balanced lines. A single-sided entry is unrepresentable.

```
Capitalize          DR fund.cash                     CR fund.capital
Bond issued, fee    DR fund.cash                     CR fees.income
Collateral posted   DR fund.cash                     CR collateral.<m>
Payout to buyer     DR claims.expense                CR fund.cash
Apply collateral    DR collateral.<m>                CR claims.expense
Residual recovery   DR recovery.receivable.<m>       CR claims.expense
```

The last two are the surety structure in accounting form: the fund pays the obligee first, then recovers from the principal, and `claims.expense` nets to the part not yet recovered. `npm test` asserts that after a full gauntlet run every transaction balances and the trial balance sums to zero. If it does not, the build fails.

### Fulfillment state is a first-class object

Nothing in the six pillars observes delivered reality, and a guarantee that pays on assertion alone pays fraudsters.

```
authorized -> captured -> shipped -> in_transit -> delivered -> confirmed
                  |          |           |             |
                  +----------+-----------+-------------+--> disputed --> adjudicated
                                                              |
                                    settled_by_payout <-------+--> denied
```

Three independent sources write transitions: simulated carrier tracking events, merchant attestation, and buyer confirmation. **Disagreement between them routes to adjudication rather than resolving to whoever spoke last.** That rule is the oracle. The `fulfillment.transitioned` event records which source moved the state and what evidence it carried, so a contradiction is visible in the log rather than inferred.

Simulated, with real state transitions, and we say so on stage.

### Claims are underwritten too

The buyer is a counterparty, not a trusted narrator. A payout requires the binding deposition that fixes what was promised, an evidence bundle of order record and fulfillment state and merchant communications and the buyer's statement, and a claim inside the window against a merchant and buyer pair with no prior collusive pattern. Per-buyer and per-merchant payout caps apply, buyer claim history is scored the way merchant history is, and disputed claims go to the same adjudication card the refer tier uses.

F19 and F20 are named taxonomy entries defended here, not an afterthought.

---

## 8. API routes

ACP-shaped, and the substrate under both the MCP server and the board.

| Route | Method | What it does |
|---|---|---|
| `/api/underwrite` | POST | Build one file. Streams findings as they land. The core |
| `/api/underwrite/stream` | GET | SSE view over `file:<id>`, resumable with `?since=<seq>` |
| `/api/gauntlet` | POST | Start a run, returns a run id. Cells execute as independent short calls |
| `/api/gauntlet/stream` | GET | SSE view over the run, resumable |
| `/api/replay/:fileId` | GET | Rerun the scorecard over stored findings. Zero model calls |
| `/api/decision/:fileId` | GET | The issued decision with its versions |
| `/api/claims` | POST | File a claim, underwrite it, pay or deny |
| `/api/fulfillment/:orderId` | POST | Record a transition from a named source |
| `/api/adjudicate` | POST | Human verdict on a refer or a disputed claim |
| `/api/registry/:merchantId` | GET | Pillar 4 file, with notice and appeal state |
| `/api/ledger` | GET | Trial balance and the posting history |
| `/api/eval` | GET | Precomputed separation, confusion matrix, per-class recall |
| `/api/arena/submit` | POST | Window-gated, rate-limited, size-capped, filtered |
| `/api/arena/promote` | POST | Human promotion gate, token required |
| `/api/mcp` | POST | MCP streamable HTTP transport, one tool |

---

## 9. Streaming, designed for serverless statelessness

Named as a risk up front, so it is designed for rather than discovered at 6 PM.

**The insight that solves it: SSE is a view over the append-only log, not the source of truth.** Every finding is written to the event store the moment it is produced. The stream is a tail of that log. So a dropped connection, a function timeout or a cold start loses nothing: the client reconnects with `?since=<seq>` and the server replays from the log and continues. The board is never rebuilt from a socket that has to stay alive.

**No single request runs the whole gauntlet.** Eighteen cells fan out from the client as eighteen independent `POST /api/underwrite` calls at concurrency four. Each one is a short request comfortably inside the function limit, and one slow cell cannot take the board down. `export const maxDuration = 60` on the underwriting route; the per-file target is under 30 seconds and is measured, not assumed.

**Within one file, checks run as a generator.** Deterministic checks resolve first and instantly, so the board fills with Pillar 1 and Pillar 5 reason codes in the first second, which is also the right demo behavior. LLM-backed checks run in a bounded-concurrency pool behind them, and each yields findings as it completes.

**Latency budget per file, measured and shown on the board:**

| Stage | Budget |
|---|---|
| Pillars 1, 4, 5, deterministic | under 1s |
| Pillar 2 claims extraction and verification, cached or live | 4 to 10s |
| Pillar 3 stress exam, multi-turn, highest variance | 8 to 18s |
| Scorecard, pricing, policy, pure | under 50ms |
| **Total target** | **under 30s** |

If real timings say the target is wrong, the target changes and the positioning sentence changes with it, because "runs in seconds" is a written claim and has to stay true.

---

## 10. Cache and replay, the degradation ladder

A rate limit, a timeout or dead conference wifi must replay the last good result rather than show a spinner to a room of judges. Four layers, tried in order, and the board never spins.

1. **Live call.** Only on a cache miss, and only when a key is present and `CLEARHOUSE_REPLAY_ONLY` is off.
2. **Model cache.** `sha256(model, system, messages, tool schema, prompt version)` to response, in `model_cache`. A hit is free, instant and byte-identical. Every hero-path call is warmed before the demo, so the hero path never depends on the network.
3. **Last good run.** Every gauntlet run is persisted. If a cell fails now, the most recent successful result for that persona and scorecard version is served, labeled with its timestamp.
4. **Committed hero run.** `config/runs/hero.json` is a full 18-cell result set checked into the repository. It is the floor: with no network, no database and no key, the board still renders correctly.

**Replay is a different thing from cache, and the distinction matters.** The cache avoids repeating a model call. Replay reruns the scorecard over stored findings and never calls a model at all, at any layer. Replay is the audit and determinism guarantee. Cache is the demo-safety guarantee. `npm test` asserts that replaying every hero file reproduces its recorded decision exactly.

`CLEARHOUSE_REPLAY_ONLY=1` is the switch to throw if the wifi dies: it skips layer 1 entirely and serves the ladder from layer 2 down.

---

## 11. Versioning and the self-improving loop

Scorecards, check manifests and pricing tables live in `config/` as numbered files and are **never edited in place**. Every decision records the versions in force, which is what makes any decision replayable forever.

The loop, as implemented:

1. A payout is a fraud that beat the score. `claim.paid` automatically emits `case.candidate` carrying the persona and the label.
2. A human promotes it. `POST /api/arena/promote` with the promotion token writes `case.promoted` and the persona enters `config/eval/`. **This gate is the security boundary, not bureaucracy**: auto-ingesting adversary-submitted cases makes the label come from our own verdict, which makes the loop self-confirming, and it lets anyone with a form submission steer future versions through the eval gate.
3. A new scorecard version is proposed with the check the miss exposed added or reweighted.
4. **The eval gate enforces a recall floor on every attack class, not a better aggregate.** An aggregate gate lets a new version trade away an entire fraud class for a better average, which is precisely the regression that matters. `npm run eval:gate` fails on any class below floor and refuses to publish the version.
5. The same attack re-runs against the new version and is caught, with the new reason code on screen.

Arena submissions get provisional taxonomy IDs from F24 onward. A provisional ID is a candidate, not a finding, and becomes permanent through the same human gate.

---

## 12. Arena safety

An open text input from an adversarial room into an LLM and onto a projector. Every control is cheap and all of them ship.

- **Window.** Submissions accepted between `CLEARHOUSE_ARENA_OPENS_AT` and `CLEARHOUSE_ARENA_CLOSES_AT` only. Outside it the endpoint returns read-only and the archive stays visible, so an unauthenticated endpoint calling a paid API is not left open on the indexed internet after everyone goes home.
- **Rate limit and size cap**, per IP hash, projected from `arena.submitted` events.
- **Content filter before render.** Nothing reaches the board unfiltered.
- **Untrusted data, never instructions.** Merchant and submission content is passed to the model inside a delimited untrusted-content envelope with a standing instruction that content within it is evidence to be described, never direction to be followed. Findings come back through a constrained schema, so the worst case of a successful injection is a malformed finding that fails validation rather than an instruction that executes. F21 is the attack this answers, and the arena is where it will be attempted first.
- **Human promotion** before anything enters the eval set. F22 is the attack this answers.

The MCP endpoint inherits every one of these controls.

---

## 13. Build order

Dependency order, so a blocked item never stops the next one.

1. `contracts`, `config`, `store`, `model` with the cache. The spine.
2. `engine`: deterministic checks first, then scorecard, gates, pricing, policy. Testable with zero model calls.
3. Personas: the five narrated scenes, then the remaining 13, then the eval set.
4. Gauntlet runner writing to the log, and `config/runs/hero.json` warmed from a real run.
5. `ledger`, fulfillment oracle, claims and payout. Named as the newest machinery with no real-world analog to copy, so it is expected to take longer than it looks.
6. Board, adjudication card, attacks-on-us panel, first-visitor primed run.
7. MCP server and skill. One tool, one decision.
8. Eval harness, threshold derivation, per-class floors, precomputed results page.
9. Arena and the promotion gate.
10. Deploy, warm the cache, record the video.
