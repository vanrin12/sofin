# Async Events (RabbitMQ)

Async, fire-and-forget side-effects use a message broker so services stay
decoupled. REST is used only when the caller needs an immediate answer.

> **Implementation note.** `EventBus` (`libs/common/src/event-bus.ts`) is an
> abstract `publish`/`subscribe` surface with two providers selected by
> `CommonModule.forRoot(service)`: `RabbitEventBus` when `RABBITMQ_URL` is set
> (durable topic exchange `sofin.events`, one durable queue per service per
> subscription — e.g. `crm.enrollment.created`), else `InProcessEventBus` for
> single-process dev. Producers (`bus.publish('enrollment.created', …)`) and
> consumers (`bus.subscribe(…)` in `OnModuleInit`) depend only on the abstract
> bus, so the transport is a provider swap — call sites are unchanged. Messages
> are persistent and ack'd after the handler succeeds; a throwing handler nacks
> (requeue=false → routed to a per-queue `.dlq`).
>
> **Producers do not call `bus.publish()` directly.** They write the event to an
> `outbox` table in the same transaction as the business change; an `OutboxRelay`
> (`libs/common/src/outbox.ts`) polls unpublished rows and publishes them — see
> [Transactional outbox](#transactional-outbox) below.

## Topology

- **Exchange:** `sofin.events` (type `topic`).
- **Routing keys:** `<domain>.<event>` e.g. `enrollment.created`.
- Each consumer binds its own **durable queue** with patterns it cares about.
- Messages are **persistent**; consumers **ack** after successful handling.

```
 Publisher ──► [exchange: sofin.events (topic)] ──► queue: notif.q  ──► Notification
                          │                     ──► queue: crm.q    ──► CRM
                          └─ routing key: enrollment.created
```

## Event catalogue

| Routing key | Producer | Consumers | Payload (jsonb) |
|---|---|---|---|
| `user.created` | Auth | CRM, LMS | `{ userId, email, name }` |
| `user.updated` | Auth | CRM, LMS | `{ userId, changed:{...} }` |
| `enrollment.created` | LMS | CRM, Notification | `{ userId, courseId, courseTitle }` |
| `lesson.completed` | LMS | Notification | `{ userId, courseId, lessonId }` |
| `deal.stage_changed` | CRM | Notification | `{ dealId, contactId, from, to }` |
| `deal.won` | CRM | Notification, LMS | `{ dealId, contactId, amount }` |

> Scaffold status: `user.created`, `user.roles_changed` (Auth), `enrollment.created`
> (LMS), `deal.stage_changed`, `deal.won` (CRM) are wired through the outbox.
> `user.updated` / `lesson.completed` are catalogued but not yet emitted.

## Standard message envelope

```json
{
  "eventId": "uuid",
  "type": "enrollment.created",
  "occurredAt": "2026-06-09T10:00:00Z",
  "producer": "lms",
  "correlationId": "uuid",
  "data": { "userId": "...", "courseId": "...", "courseTitle": "..." }
}
```

## Example flow — user enrolls in a course

```
1. POST /lms/courses/:id/enroll        (sync, returns 201 immediately)
2. LMS writes enrollment row
3. LMS publishes enrollment.created  ──► exchange
4. CRM consumes  → adds a "system_event" activity to the contact
5. Notification consumes → sends welcome email + in-app notification
```

The user's HTTP request (step 1) does **not** wait on steps 4–5.

## Transactional outbox

Producers never publish to the broker directly — that would risk "DB committed
but event lost" (or the reverse) if the process dies between the two operations.
Instead the event row and the business change commit atomically:

```
1. tx.start
2.   write business row(s)        (e.g. enrollments.insert)
3.   write outbox row             (outboxData({ type, payload, producer }))
4. tx.commit                      ← change + event are now durable together
5. OutboxRelay (polling)          → reads unpublished rows → bus.publish(...)
6.                                → stamps outbox.published_at
```

- **Helpers** live in `libs/common/src/outbox.ts`: `outboxData()` builds the row,
  `OutboxRelay` does the polling/publishing. Each producing service registers the
  relay with `{ provide: OUTBOX_PRISMA, useExisting: PrismaService }`.
- **Polling**: every `OUTBOX_POLL_MS` (default `1000`), oldest-first, batches of 50.
- **Stable event id**: the relay reuses the **outbox row id as the `eventId`**, so a
  redelivery carries the same id and idempotent consumers dedupe it.
- **At-least-once**: a publish failure leaves `published_at` null → retried next tick.

## Reliability rules

- **At-least-once delivery** → consumers must be **idempotent**
  (dedupe on `eventId`, or upsert).
- **Atomic emission** → producers use the transactional outbox (above); they
  never call `bus.publish()` inside request handlers.
- **Dead-letter queue** per consumer for messages that fail repeatedly
  (`<queue>.dlq`, fed by the broker's dead-letter exchange).
- **Retry with backoff** on transient handler failures before DLQ.
