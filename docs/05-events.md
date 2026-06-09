# Async Events (RabbitMQ)

Async, fire-and-forget side-effects use a message broker so services stay
decoupled. REST is used only when the caller needs an immediate answer.

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

## Reliability rules

- **At-least-once delivery** → consumers must be **idempotent**
  (dedupe on `eventId`, or upsert).
- **Outbox pattern** (recommended): write the event to an `outbox` table in
  the same DB transaction as the business change, then a relay publishes it.
  Prevents "DB committed but event lost" inconsistencies.
- **Dead-letter queue** per consumer for messages that fail repeatedly.
- **Retry with backoff** on transient handler failures before DLQ.
