# TicketHub: System Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework from Part 1: requirements, estimates, API, data model, architecture, and trade-offs. Section 6 explains in detail how the design prevents two people from buying the same seat.

---

## 1. Requirements

### 1.1 Functional requirements

1. **Browse and search events** by artist, city, date, and category.
2. **View an event** with its venue, schedule, price tiers, and a live seat map showing which seats are available.
3. **Select seats and hold them** temporarily (10 minutes) while the buyer checks out.
4. **Pay and buy** the held seats. The buyer gets a confirmation and tickets with a QR code.
5. **View order history and tickets** in the buyer's account.
6. **Release seats** automatically when a hold expires, or manually when the buyer cancels.
7. **Waiting room** for very popular on-sales, so only a controlled number of buyers reach seat selection at a time.
8. **Organizer tools** (basic): create events, set prices, and open or close sales. These are not detailed further here.

**Out of scope:** resale marketplace, refunds workflow, dynamic pricing, mobile ticket wallet integrations.

### 1.2 Non-functional requirements

| Requirement | Target | Why it matters |
|---|---|---|
| **Correctness (no double-selling)** | A seat is sold to at most one buyer, always | The one requirement that must never be violated. It outranks everything else. |
| **Consistency of inventory** | Strong consistency for seat state; eventual consistency is acceptable for browsing and search | Buyers can tolerate a slightly stale event list, but not a seat sold twice. |
| **Availability** | 99.9% for buying; 99.99% for browsing (served mostly from cache) | Browsing should keep working even if checkout is degraded. |
| **Latency** | Browse p99 < 300 ms; hold request p99 < 500 ms; checkout < 3 s excluding the payment provider | Keeps the experience responsive. |
| **Scalability / spike handling** | Survive a 100x to 1000x traffic spike on a single event without affecting other events | Big on-sales are the defining load pattern. |
| **Durability** | Paid orders are never lost | Money has changed hands. |
| **Fairness** | Users admitted roughly in the order they arrived; bot traffic limited | Prevents a bad experience at big on-sales. |
| **Security and compliance** | HTTPS everywhere; no card data stored by us (use a payment provider); PII encrypted at rest | Keeps us out of PCI scope and protects user data. |
| **Idempotency** | Retried requests (double click, network retry) never create duplicate orders or charges | Checkout is the riskiest place for duplicates. |

---

## 2. Estimates

These are back-of-the-envelope numbers to size the system. The assumptions are stated so they can be challenged.

### 2.1 Normal traffic

**Assumptions:** 10M monthly active users, 1M daily active users, 20 page views per active user per day, 100,000 orders per day, 2.5 tickets per order, 20,000 events per year with 5,000 seats on average.

| Quantity | Calculation | Result |
|---|---|---|
| Page views | 1M x 20 = 20M per day; 20M / 86,400 s | ~230 requests/s average |
| Peak browsing (3x average) | 230 x 3 | ~700 requests/s |
| Orders | 100,000 / 86,400 s | ~1.2 orders/s average, ~10/s at peak |
| Tickets sold | 100,000 x 2.5 | 250,000 per day |
| Seat rows created per year | 20,000 x 5,000 | 100M rows; at ~100 B each, ~10 GB/year |
| Order and ticket rows per year | 36.5M orders x ~1 KB incl. tickets | ~40 GB/year |

**Conclusion:** normal traffic is tiny. One well-provisioned relational database with replicas, plus a cache, handles it comfortably. The design effort goes into the spikes.

### 2.2 Hot on-sale (very popular concert)

**Assumptions:** a stadium with 80,000 seats; 2,000,000 people try to get in within the first few minutes (25 users per seat); tickets sell out in minutes.

| Quantity | Calculation | Result |
|---|---|---|
| Users hitting the site at the on-sale moment | assumption | ~2M in the first 5 minutes |
| Peak arrival rate at the waiting room | 2M / 300 s, with a burst peak of about 3x | ~20,000 requests/s |
| Seat map polling | 100,000 admitted or browsing users refreshing every 5 s | ~20,000 requests/s, served from cache/CDN |
| Admission rate into seat selection | Limited deliberately, e.g. 3,000 users/minute | ~50 users/s |
| Hold attempts (writes to inventory) | Admitted users make several attempts each (seats taken by others) | ~500 to 2,000 writes/s peak |
| Minimum orders to sell out | 80,000 seats / ~4 tickets per order | ~20,000 orders |
| Order rate at sell-out | 20,000 orders over ~10 minutes | ~35 orders/s |
| Seat map payload | 80,000 seats x ~2 bits of state, compressed; sectional deltas of a few KB | A full map under ~100 KB, deltas ~5 KB |

**Comparison with normal traffic:**

| | Normal | Hot on-sale | Ratio |
|---|---|---|---|
| Inbound requests/s | ~700 | ~20,000 to 40,000 | ~30-50x |
| Inventory writes/s (system-wide) | ~10 | ~500 to 2,000 (all on one event) | ~100x+ |
| Contention | Almost none (different events, different seats) | Extreme: everyone wants the same few hundred "best" seats | n/a |

**Conclusions that shape the design:**

1. The 20,000 requests/s of raw traffic must be absorbed *before* it reaches the inventory database. That is the job of the CDN, the waiting room, and the cache.
2. The number of *writes* that touch inventory is small enough (a few thousand per second) for a single database primary, **if** admission is controlled. So the database can be the source of truth and no exotic technology is needed.
3. Contention, not volume, is the real problem. The same rows are hit by many writers. The write path must be cheap, atomic, and fail fast.

---

## 3. API

REST over HTTPS with JSON. All endpoints except public browsing require an auth token (`Authorization: Bearer ...`). Mutating endpoints that cost money or consume inventory accept an `Idempotency-Key` header.

| # | Endpoint | Purpose | Notes |
|---|---|---|---|
| 1 | `GET /v1/events?query=&city=&date_from=&date_to=&cursor=` | Search and list events | Cached, paginated by cursor. Served by the Catalog service. |
| 2 | `GET /v1/events/{event_id}` | Event details: venue, times, price tiers, sale status | CDN-cacheable. |
| 3 | `GET /v1/events/{event_id}/seats?section=` | Seat map with availability | Cache-backed; may be a few seconds stale. Advisory only (see Section 6). |
| 4 | `POST /v1/events/{event_id}/queue` | Join the waiting room for a hot on-sale | Returns a queue position and, when admitted, a short-lived `admission_token`. |
| 5 | `POST /v1/holds` | Hold seats for the buyer | Requires `admission_token` for queued events. |
| 6 | `DELETE /v1/holds/{hold_id}` | Release a hold early | Idempotent. |
| 7 | `POST /v1/orders` | Check out: pay for a hold and create the order | Requires `Idempotency-Key`. |
| 8 | `GET /v1/orders/{order_id}` | Order status and tickets | Owner only. |
| 9 | `GET /v1/me/tickets` | List the buyer's tickets | Owner only. |
| 10 | `POST /v1/payments/webhook` | Payment provider callback (async confirmation) | Signature-verified; not called by clients. |

### Key request and response shapes

**`POST /v1/holds`**

```json
// Request
{
  "event_id": "evt_123",
  "seat_ids": ["seat_A12", "seat_A13"]
}

// 201 Created
{
  "hold_id": "hld_9f2",
  "event_id": "evt_123",
  "seat_ids": ["seat_A12", "seat_A13"],
  "expires_at": "2026-11-05T19:10:00Z",
  "total_price": { "amount": 24000, "currency": "KES" }
}

// 409 Conflict (any one seat unavailable, so nothing is held)
{
  "error": "SEATS_UNAVAILABLE",
  "unavailable_seat_ids": ["seat_A13"]
}
```

**`POST /v1/orders`** (header `Idempotency-Key: 7c1e...`)

```json
// Request
{
  "hold_id": "hld_9f2",
  "payment_method_token": "pm_tok_abc"   // token from the payment provider, never raw card data
}

// 201 Created
{
  "order_id": "ord_771",
  "status": "CONFIRMED",
  "tickets": [
    { "ticket_id": "tkt_1", "seat_id": "seat_A12", "qr": "..." },
    { "ticket_id": "tkt_2", "seat_id": "seat_A13", "qr": "..." }
  ]
}

// 410 Gone: hold expired before payment completed (no charge made)
// 402 Payment Required: payment declined (hold is kept until it expires, so the buyer can retry)
```

Design notes:

- `POST /holds` is **all-or-nothing**: either every requested seat is held or none is. This avoids partial holds that leave a buyer with a broken seat pair.
- Seat availability on `GET .../seats` is deliberately **advisory**. The authoritative check happens in `POST /holds`.
- Errors use standard status codes (`409` for conflict, `410` for expired hold, `429` for rate limiting).

---

## 4. Data Model

**Choice of storage:** PostgreSQL for all transactional data (events, inventory, holds, orders, payments). We need ACID transactions and row-level locking on inventory, and the volumes from Section 2 are well within a relational database. Search uses a separate index (Section 5).

### 4.1 Tables

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Buyers and organizers | `user_id` (PK), `email` (unique), `name`, `created_at` |
| `venues` | Physical locations | `venue_id` (PK), `name`, `city`, `capacity` |
| `venue_seats` | The fixed seat layout of a venue | `seat_id` (PK), `venue_id` (FK), `section`, `row`, `number` |
| `events` | A show at a venue at a time | `event_id` (PK), `venue_id` (FK), `title`, `starts_at`, `sale_opens_at`, `status` |
| `event_seats` | **Inventory**: one row per seat per event | PK (`event_id`, `seat_id`), `status`, `hold_id`, `hold_expires_at`, `price`, `version` |
| `holds` | A temporary reservation of seats | `hold_id` (PK), `user_id` (FK), `event_id` (FK), `expires_at`, `status` |
| `orders` | A completed or pending purchase | `order_id` (PK), `user_id` (FK), `hold_id` (FK), `idempotency_key`, `status`, `total_amount` |
| `tickets` | One row per seat sold | `ticket_id` (PK), `order_id` (FK), `event_id`, `seat_id`, `qr_code` |
| `payments` | Payment attempts and their outcome | `payment_id` (PK), `order_id` (FK), `provider_ref`, `status`, `amount` |

### 4.2 Relationships

```
venues 1 ──< venue_seats
venues 1 ──< events
events 1 ──< event_seats >── 1 venue_seats      (each event_seat is one seat in one event)
users  1 ──< holds    >── 1 events
holds  1 ──< event_seats                         (seats currently held by that hold, via event_seats.hold_id)
users  1 ──< orders
holds  1 ── 1 orders                             (an order is created from exactly one hold)
orders 1 ──< tickets  >── 1 event_seats          (each ticket is one sold seat)
orders 1 ──< payments
```

### 4.3 Key schema details

```sql
CREATE TABLE event_seats (
  event_id        BIGINT      NOT NULL REFERENCES events(event_id),
  seat_id         BIGINT      NOT NULL REFERENCES venue_seats(seat_id),
  status          TEXT        NOT NULL DEFAULT 'AVAILABLE'
                  CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
  hold_id         BIGINT      NULL REFERENCES holds(hold_id),
  hold_expires_at TIMESTAMPTZ NULL,
  price           INTEGER     NOT NULL,
  version         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, seat_id)
);

CREATE TABLE tickets (
  ticket_id  BIGINT PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(order_id),
  event_id   BIGINT NOT NULL,
  seat_id    BIGINT NOT NULL,
  qr_code    TEXT   NOT NULL,
  UNIQUE (event_id, seat_id)          -- final backstop: a seat can only ever have one ticket
);

CREATE TABLE orders (
  order_id        BIGINT PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(user_id),
  hold_id         BIGINT NOT NULL UNIQUE REFERENCES holds(hold_id),  -- one order per hold
  idempotency_key TEXT   NOT NULL,
  status          TEXT   NOT NULL,
  total_amount    INTEGER NOT NULL,
  UNIQUE (user_id, idempotency_key)    -- retries return the same order
);
```

Why this shape:

- `event_seats` is the **single source of truth for seat state**. Every seat sale is decided by one row.
- The composite primary key `(event_id, seat_id)` means it is impossible to create two inventory rows for the same seat.
- `UNIQUE (event_id, seat_id)` on `tickets` and `UNIQUE (hold_id)` on `orders` are database-enforced guarantees that survive any application bug.
- The table is **partitioned/sharded by `event_id`**, so a hot event's contention stays on its own partition and does not slow down other events.

---

## 5. Architecture

### 5.1 Diagram

```
                         ┌────────────────────┐
   Browser / Mobile ────►│  CDN + WAF / bot   │  static assets, event pages,
                         │  protection        │  cached seat-map snapshots
                         └─────────┬──────────┘
                                   │
                         ┌─────────▼──────────┐
                         │  Load balancer /   │  auth, rate limiting
                         │  API gateway       │
                         └─────────┬──────────┘
        ┌──────────────┬───────────┼──────────────┬────────────────┐
        │              │           │              │                │
 ┌──────▼─────┐ ┌──────▼─────┐ ┌───▼────────┐ ┌───▼─────────┐ ┌────▼───────┐
 │  Catalog   │ │  Waiting   │ │ Inventory /│ │   Order     │ │  Account   │
 │  service   │ │  room svc  │ │ Reservation│ │   service   │ │  service   │
 └──────┬─────┘ └──────┬─────┘ │  service   │ └───┬─────┬───┘ └────┬───────┘
        │              │       └──┬─────┬───┘     │     │          │
 ┌──────▼─────┐   ┌────▼────┐     │     │         │     │          │
 │ Search     │   │  Redis  │◄────┘     │         │     │          │
 │ index      │   │ (queue, │ seat-map  │         │     │          │
 │(Elastic-   │   │  cache, │ cache     │         │     │          │
 │ search)    │   │  limits)│           │         │     │          │
 └────────────┘   └─────────┘           │         │     │          │
                                 ┌──────▼─────────▼─────▼──────────▼──┐
                                 │   PostgreSQL (primary + replicas)  │
                                 │   sharded by event_id              │
                                 │   users, events, event_seats,      │
                                 │   holds, orders, tickets, payments │
                                 └──────▲─────────────────────┬───────┘
                                        │                     │ outbox
                              ┌─────────┴────────┐     ┌──────▼───────────┐
                              │ Hold-expiry      │     │ Message queue    │
                              │ sweeper (worker) │     │ (Kafka)          │
                              └──────────────────┘     └──────┬───────────┘
                                                              │
                                              ┌───────────────┼───────────────┐
                                       ┌──────▼─────┐  ┌──────▼──────┐ ┌──────▼─────┐
                                       │ Notification│  │ Search index│ │ Analytics  │
                                       │ service     │  │ updater     │ │ pipeline   │
                                       │ (email/SMS) │  └─────────────┘ └────────────┘
                                       └────────────┘

   Order service ◄──────► External payment provider (card tokenization, charge, webhook)
```

### 5.2 Components

| Component | Responsibility | Why it exists / key decisions |
|---|---|---|
| **CDN + WAF / bot protection** | Serves static assets, event detail pages, and short-lived (2 to 5 s) seat-map snapshots. Blocks obvious bots and abusive IPs. | Absorbs most of the ~20,000 requests/s on a hot on-sale so they never reach our servers. |
| **Load balancer / API gateway** | Terminates TLS, authenticates tokens, applies per-user and per-IP rate limits, routes to services. | One place to enforce auth and throttling. Returns `429` instead of letting overload reach the database. |
| **Catalog service** | Event search, event details, pricing tiers. Read-heavy. | Reads from the search index and replicas. It is stateless and scales horizontally. Never touches the write path of inventory. |
| **Search index (Elasticsearch)** | Full-text and filtered search over events. | Fast text search that PostgreSQL does poorly. It is eventually consistent, fed by the search index updater from Kafka. |
| **Waiting room service** | Queues users for hot on-sales, issues signed, short-lived `admission_token`s at a controlled rate. | Converts an uncontrollable 20,000 requests/s burst into a steady ~50 admissions/s. Fair, first-come ordering. Uses Redis (sorted set keyed by arrival time). |
| **Redis** | Waiting-room queue state, cached seat-map snapshots, rate-limit counters. | Fast, in-memory, disposable. **It is never the source of truth for seat ownership**; losing Redis cannot cause a double sale (see Section 6). |
| **Inventory / Reservation service** | Creates and releases holds, and answers seat availability. The only component allowed to change `event_seats`. | Concentrates the critical correctness logic in one small, well-tested service. |
| **Order service** | Runs checkout: validates the hold, calls the payment provider, converts held seats to sold, creates tickets. | Owns idempotency and the payment-to-inventory handoff, the most failure-prone step. |
| **Payment provider (external)** | Tokenizes cards, authorizes and captures charges, sends webhooks. | Keeps card data out of our systems (reduces compliance scope). We treat it as unreliable and design for timeouts. |
| **PostgreSQL (sharded by `event_id`)** | Source of truth for all transactional data, with a primary per shard and read replicas. | ACID transactions and row-level atomic updates are what make double-selling impossible. Sharding by event isolates hot events. |
| **Hold-expiry sweeper** | Periodically releases expired holds (`HELD` to `AVAILABLE`) and marks holds expired. | Frees seats promptly for others and keeps the seat map accurate. **Correctness does not depend on it** (expired holds are also treated as available by the hold query itself). |
| **Message queue (Kafka) + outbox** | Reliable asynchronous events: `OrderConfirmed`, `HoldExpired`, `EventUpdated`. | Keeps slow work (emails, search updates, analytics) off the request path. The outbox pattern (write event in the same DB transaction) avoids lost messages. |
| **Notification service** | Sends confirmation emails/SMS with tickets. | Asynchronous so email problems never block or fail a purchase. |

### 5.3 Typical flows

**Browsing (normal):** Browser -> CDN -> (cache miss) Gateway -> Catalog service -> search index or replica.

**Hot on-sale purchase:**
1. User joins the waiting room, polls their position, and receives an `admission_token` when admitted.
2. User opens the seat map (CDN/Redis snapshot, slightly stale) and selects seats.
3. `POST /holds` -> Inventory service -> atomic conditional update in PostgreSQL. Success starts a 10-minute hold.
4. `POST /orders` -> Order service -> payment authorization -> atomic hold-to-sold conversion -> ticket creation -> capture.
5. `OrderConfirmed` goes to Kafka via the outbox, then the Notification service sends the email.

---

## 6. How the Design Prevents Two People from Buying the Same Seat

This is the core correctness guarantee. The approach is **defense in depth**: the main protection is a single atomic database operation, and there are additional independent safeguards behind it. No safeguard relies on the cache, on timing, or on the application "checking first".

### 6.1 The principle: one authority, one atomic decision

- The row in `event_seats` for `(event_id, seat_id)` is the **only** record of who may buy a seat.
- The decision "this seat is now yours" is made by **one atomic SQL statement** in the primary database, not by reading the state in the application and then writing it. A read-then-write ("check if available, then mark held") is exactly what causes double sales, because two users can both read "available" before either writes.

### 6.2 Step 1: Holding seats (`POST /holds`)

The Inventory service runs a single transaction:

```sql
BEGIN;

-- Seat ids are sorted before the statement to give a consistent lock order (prevents deadlocks)
UPDATE event_seats
SET    status          = 'HELD',
       hold_id         = :new_hold_id,
       hold_expires_at = now() + interval '10 minutes',
       version         = version + 1
WHERE  event_id = :event_id
  AND  seat_id  = ANY(:seat_ids)
  AND  (   status = 'AVAILABLE'
        OR (status = 'HELD' AND hold_expires_at < now()) );   -- expired holds count as available

-- Application checks the number of rows updated:
--   rows_updated == number of requested seats  -> COMMIT, return 201
--   otherwise                                  -> ROLLBACK, return 409 (all-or-nothing)
COMMIT;
```

Why this is safe:

- The `WHERE` clause is evaluated **while the database holds a row lock** on each matching row. If two users run this for the same seat at the same moment, PostgreSQL makes the second one wait for the first to finish. When the second then re-evaluates the condition, the seat is already `HELD` with a future expiry, so it no longer matches and the second update changes zero rows.
- Exactly one of the two statements can ever match the seat. The loser gets a `409` and is shown "seat just taken, please pick another".
- Because the check and the change are the same statement, there is **no gap** in which another buyer could slip in.
- All-or-nothing: if only some of the requested seats were updated, the transaction rolls back and no partial hold is left behind.

### 6.3 Step 2: Paying (`POST /orders`)

The risky moment is when payment is slow and the hold might expire, letting someone else take the seat while the first buyer is paying. The order is therefore:

1. **Validate and extend the hold.** In one conditional update, move the hold to a `PAYMENT_PENDING` state with a short extension (for example, a further 2 minutes), only if it is still held by this user and unexpired:
   ```sql
   UPDATE holds
   SET    status = 'PAYMENT_PENDING', expires_at = now() + interval '2 minutes'
   WHERE  hold_id = :hold_id AND user_id = :user_id
     AND  status = 'ACTIVE' AND expires_at > now();
   ```
   If zero rows are updated, the hold has expired. We return `410` and **do not charge** the buyer.
2. **Authorize** the payment with the provider (reserves the money but does not take it).
3. **Atomically convert held seats to sold:**
   ```sql
   BEGIN;
   UPDATE event_seats
   SET    status = 'SOLD', version = version + 1
   WHERE  event_id = :event_id AND hold_id = :hold_id AND status = 'HELD';
   -- rows_updated must equal the number of seats on the hold, else ROLLBACK
   INSERT INTO tickets (...) VALUES (...);            -- one per seat
   INSERT INTO orders  (...) VALUES (...);            -- unique on hold_id and idempotency key
   COMMIT;
   ```
4. **Capture** the authorized payment. If anything in steps 3 or 4 fails, **void the authorization** so the buyer is never charged for seats they did not get.

Because the seats are updated to `SOLD` **only if they are still held under this buyer's `hold_id`**, a buyer whose hold was lost cannot complete a purchase.

### 6.4 Backstops (independent of the main path)

| Safeguard | What it protects against |
|---|---|
| `PRIMARY KEY (event_id, seat_id)` on `event_seats` | Two inventory rows ever existing for the same seat. |
| `UNIQUE (event_id, seat_id)` on `tickets` | A seat getting two tickets even if there were an application bug. The second insert fails and the transaction rolls back. |
| `UNIQUE (hold_id)` on `orders` | Two orders being created from the same hold. |
| `UNIQUE (user_id, idempotency_key)` on `orders` | A double click or client retry creating two orders or two charges. A retry returns the original result. |
| Authorize, then convert, then capture | Charging a buyer for a seat they did not win. |
| Reconciliation job (nightly) | Detects anomalies, such as a seat with more than one active ticket or a captured payment with no order. It should find nothing, and alerts if it does. |

### 6.5 What the cache and queue do (and do not) do

- **Redis / CDN seat-map caches are advisory only.** A user may see a seat as available for a few seconds after it is taken. That only means their hold attempt fails with a clear message; it **cannot** cause a double sale, because the hold request is always decided by the database.
- **The waiting room reduces contention but is not part of correctness.** Even if it were bypassed entirely, the database would still reject every second claim on a seat.
- **We deliberately do not use a Redis lock as the authority** for seats. A distributed lock can expire or be lost during a pause or failover and then two holders believe they own a seat. Database row updates do not have that failure mode.

### 6.6 Race condition walkthrough

Alice and Bob both click seat A12 at the same instant.

| Time | Alice | Bob | Database state of A12 |
|---|---|---|---|
| t0 | Sees A12 available (cache) | Sees A12 available (cache) | `AVAILABLE` |
| t1 | `POST /holds` starts; her UPDATE acquires the row lock | `POST /holds` starts; his UPDATE waits for the lock | `AVAILABLE` (locked) |
| t2 | UPDATE changes 1 row; COMMIT | Lock released; condition re-checked: status is `HELD`, not expired, so no match | `HELD` by Alice's hold |
| t3 | Receives `201` with a 10-minute hold | UPDATE changes 0 rows; receives `409 SEATS_UNAVAILABLE` | `HELD` by Alice's hold |
| t4 | Pays; seats set to `SOLD` | Picks another seat | `SOLD` |

### 6.7 Failure cases

| Failure | Outcome |
|---|---|
| Alice's browser closes after holding | The hold expires after 10 minutes. The next hold request treats it as available, and the sweeper also releases it. The seat is not stuck. |
| Hold expires while Alice is paying | Step 1 of checkout extends the hold when it is still valid. If it was already expired, she gets `410` and is not charged. |
| Order service crashes after authorization but before conversion | The authorization is voided by a recovery job. Seats remain `HELD` until expiry, then become available. Nobody is charged without receiving seats. |
| Payment provider times out | We treat the result as unknown, keep the hold in `PAYMENT_PENDING`, and resolve it from the provider webhook or by polling. Seats are not released until the outcome is known or the extended hold expires. |
| Redis is lost | Waiting room and caches rebuild. No effect on seat ownership because Redis does not hold it. |
| Database primary fails | Failover to a synchronously replicated standby. The system briefly stops selling on that shard rather than risk selling from stale data. |
| Same request sent twice | Idempotency key returns the same order. No duplicate charge. |

### 6.8 How we will know it works

- A concurrency test fires, say, 1,000 parallel hold requests at the same seat, and asserts exactly one succeeds.
- A load test simulates an 80,000-seat sell-out and asserts that tickets issued equals seats sold, with no duplicate `(event_id, seat_id)`.
- The reconciliation job in production alerts on any seat with more than one active ticket.

---

## 7. Trade-offs

### Trade-off 1: Strong consistency for inventory vs. availability and speed

- **Choice:** Seat inventory lives in a single-primary relational database with synchronous replication. Writes for a given event go to one primary.
- **Benefit:** Simple, provable guarantee against double-selling.
- **Cost:** During a primary failure, selling on that shard pauses for the failover (tens of seconds) instead of continuing on possibly stale data. The primary for a hot event is also a throughput ceiling (a few thousand writes/s, which is enough here, per Section 2.2).
- **Why accepted:** Selling one seat twice is far worse than briefly not selling. If an event ever needed more write throughput, we would split it by section (each section's seats on its own shard), not give up the guarantee.

### Trade-off 2: Database conditional updates vs. a distributed lock (Redis) for holds

- **Choice:** Database row updates decide seat ownership; Redis is only for queues and caches.
- **Benefit:** No lock-expiry or failover pitfalls; one fewer system on the critical correctness path.
- **Cost:** Higher load on the database than an in-memory approach would give. All the contention is paid there.
- **Why accepted:** The waiting room caps admitted users, so contention is manageable. A Redis-first design would be faster but would need the database check anyway as a safety net, which means more complexity for little gain.

### Trade-off 3: Stale seat maps (cache) vs. always-accurate seat maps

- **Choice:** Seat maps are served from CDN/Redis snapshots that are 2 to 5 seconds old.
- **Benefit:** Cuts about 20,000 reads/s off the database during an on-sale.
- **Cost:** Users sometimes click a seat that was just taken and get a `409`. This is a worse experience in the moment.
- **Why accepted:** The error is harmless (no double sale) and is softened by showing a clear message and highlighting nearby alternatives. We can also push real-time "seat taken" updates to admitted users via WebSocket or short polling for the section they are viewing to reduce misses.

### Trade-off 4: Waiting room fairness and protection vs. user experience

- **Choice:** For hot events, users queue and are admitted at a fixed rate.
- **Benefit:** Protects the backend, makes the experience orderly, and discourages bot floods (combined with bot detection).
- **Cost:** Users wait, some for a long time, and some will give up. Admission rate is a tuning problem: too slow wastes the sale window, too fast overloads inventory.
- **Why accepted:** The alternative (letting 2M users hit the seat selection at once) leads to timeouts, errors, and an even worse experience, so queueing is the lesser evil.

### Trade-off 5: Hold duration (10 minutes)

- **Choice:** A hold lasts 10 minutes, extended briefly during payment.
- **Benefit:** Gives real buyers enough time to pay without losing seats.
- **Cost:** Seats are locked away from others, and abandoned carts reduce effective availability near sell-out. A longer hold makes this worse; a shorter hold causes more failed payments.
- **Why accepted:** 10 minutes is a common balance. The duration is a configurable per-event setting, and we can shorten it for hot events (for example, 5 minutes) since demand is high.

---

## 8. Summary

- **Normal traffic is small** (~700 requests/s peak); **hot on-sales are 30-50x bigger** and highly contended, so the design focuses on absorbing the burst (CDN, waiting room, cache) and on making the write path small, atomic, and fail-fast.
- **Seat ownership is decided in one place**: an atomic conditional `UPDATE` on `event_seats` in the primary database. Caches and queues are never the authority.
- **Double-selling is prevented in layers**: atomic hold, conditional hold-to-sold conversion, unique constraints on tickets and orders, idempotency keys, authorize-before-capture, and nightly reconciliation.
