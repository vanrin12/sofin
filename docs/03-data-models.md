# Data Models (database-per-service)

Each service owns an isolated PostgreSQL database. IDs are UUIDs.
Cross-service references store only the **foreign UUID** (e.g. `user_id`) —
never a FK to another DB. Denormalized copies (e.g. contact name) are kept
in sync via events.

> **Implementation note.** These shapes are implemented as **Prisma schemas**,
> one per service (`apps/<name>/prisma/schema.prisma`), against a Postgres
> database per service (`auth`, `lms`, `crm`, `notification` — created by
> `infra/postgres/init.sql`). Each app has its own generated client
> (`@sofin/prisma-<name>`) and a `PrismaService`. Versioned migrations live in
> `apps/<name>/prisma/migrations/`; run `pnpm db:migrate` to apply them.
> A couple of scaffold simplifications vs. the diagrams below: Auth stores
> `roles` as a `String[]` column (not `roles`/`role_permissions` join tables),
> and lessons/templates tables aren't created yet. Each **producing** service
> (Auth, LMS, CRM) also owns an `outbox` table — see [Outbox table](#outbox-table-producing-services).

## Auth DB

```
users
  id            uuid PK
  email         text unique
  password_hash text
  name          text
  status        enum(active, suspended)
  created_at    timestamptz

roles
  id    uuid PK
  name  text unique          -- admin, instructor, sales, manager, learner

permissions
  id    uuid PK
  name  text unique          -- resource:action e.g. course:create, *:*

user_roles                   -- many-to-many: a user can have many roles
  user_id  uuid FK→users
  role_id  uuid FK→roles

role_permissions             -- many-to-many: a role grants many permissions
  role_id        uuid FK→roles
  permission_id  uuid FK→permissions

refresh_tokens
  id          uuid PK
  user_id     uuid FK→users
  token_hash  text            -- hashed, rotated on use
  expires_at  timestamptz
  revoked     boolean
  created_at  timestamptz
```

## LMS DB

```
courses
  id           uuid PK
  title        text
  description  text
  instructor_id uuid          -- references Auth user (no FK)
  status       enum(draft, published, archived)
  created_at   timestamptz

lessons
  id         uuid PK
  course_id  uuid FK→courses
  title      text
  content    text
  position   int

enrollments
  id          uuid PK
  course_id   uuid FK→courses
  user_id     uuid            -- Auth user (no FK)
  enrolled_at timestamptz
  unique(course_id, user_id)

lesson_progress
  id            uuid PK
  enrollment_id uuid FK→enrollments
  lesson_id     uuid FK→lessons
  status        enum(not_started, in_progress, completed)
  updated_at    timestamptz
```

## CRM DB

```
contacts
  id          uuid PK
  name        text
  email       text
  phone       text
  owner_id    uuid            -- Auth user (sales rep), no FK
  source      text
  created_at  timestamptz

deals
  id          uuid PK
  contact_id  uuid FK→contacts
  title       text
  amount      numeric
  stage       enum(lead, qualified, proposal, won, lost)
  owner_id    uuid
  created_at  timestamptz

activities                    -- timeline; some rows created from events
  id          uuid PK
  contact_id  uuid FK→contacts
  type        enum(note, email, call, system_event)
  payload     jsonb
  created_at  timestamptz
```

## Notification DB

```
notifications
  id          uuid PK
  user_id     uuid            -- recipient (Auth user)
  channel     enum(in_app, email, sms)
  template    text
  payload     jsonb
  status      enum(pending, sent, failed, read)
  created_at  timestamptz

templates
  id    uuid PK
  key   text unique           -- welcome_email, deal_won ...
  body  text
```

## Outbox table (producing services)

Auth, LMS, and CRM each own an identical `outbox` table in their own DB. Events
are written here in the same transaction as the business change and published by
the `OutboxRelay` — see [05-events.md → Transactional outbox](05-events.md#transactional-outbox).

```
outbox
  id             uuid PK         -- reused as the published event's eventId
  type           text            -- routing key, e.g. enrollment.created
  payload        jsonb
  producer       text            -- auth | lms | crm
  correlation_id text null
  created_at     timestamptz
  published_at   timestamptz null -- null = not yet published (relay picks it up)
```

`published_at` is indexed so the relay can scan unpublished rows cheaply.

## Handling shared data (no cross-DB joins)

- **Need a user's name in CRM/LMS?** Consume `user.created` / `user.updated`
  events and store a denormalized copy, OR call `GET /auth/users/:id`.
- **Enrollment must show course title?** Same-DB join (course lives in LMS).
- Eventual consistency is acceptable for denormalized copies.
