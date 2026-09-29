# ADR-DB-01: Prisma Schema Design for MySQL

- **Status:** Accepted
- **Date:** 2026-09-25
- **Decision Maker:** Entire Development Team (All Members)
- **Draft Prompt:** p2-1a-db-schema-decide, GitHub Copilot (Claude Sonnet 5)

## Context

`docs/spec/06-database.md` defines the MySQL schema. This ADR records the mapping used by the current implementation: MySQL 8.4 with Prisma 7.10 and the MariaDB driver adapter. Prisma schema limitations still require selected constraints to be added to migration SQL.

## Decisions

### 1. UUID v7 generation (`CHAR(36)`)

UUID-v7 primary keys are declared with Prisma's `@default(uuid(7))` on the client-generated Prisma models. IDs are stored as `CHAR(36)`; the database does not generate them and the application does not install a separate UUID library or Prisma client extension.

```prisma
model User {
  id String @id @default(uuid(7)) @db.Char(36)
}
```

### 2. Category uniqueness with owner scope

`ownerKey` is a regular persisted column set by the application to `userId ?? 'SYSTEM'`. The compound unique key is `(ownerKey, type, name)`, and migration SQL adds a CHECK requiring `owner_key = COALESCE(user_id, 'SYSTEM')`. This keeps system-category uniqueness enforceable despite MySQL's nullable unique-key behavior, without a generated column.

```prisma
model Category {
  id       Int     @id @default(autoincrement())
  userId   String? @db.Char(36)
  ownerKey String  @db.VarChar(36) // userId ?? 'SYSTEM'
  name     String  @db.VarChar(50)
  type     CategoryType

  @@unique([ownerKey, type, name])
}
```

### 3. CHECK constraints in migration SQL

Business CHECK constraints are added to generated migration SQL because they are not represented as Prisma schema declarations in this project. Migrations enforce the applicable non-negative/positive amount rules, ranges, confidence bounds, date ordering, and first-of-month invariants. Keep these SQL constraints when editing or regenerating migrations, and validate the migrated schema against Prisma.

### 4. Decimal normalization at the API boundary

DTO mappers and service response builders explicitly serialize monetary values as decimal strings. Money arithmetic uses the shared Decimal helper; there is no general response-time Prisma.Decimal leak-warning guard. Review new response paths to ensure they use DTOs/formatters rather than returning raw Prisma rows.

### 5. Request idempotency

Endpoint idempotency is implemented in Redis, not a MySQL `idempotency_keys` table. The Redis key is scoped by caller, client key, HTTP method, path, and request-body hash. A short-lived `SET NX` lock rejects concurrent duplicates; successful/non-5xx responses are replayed from a 24-hour cache. If Redis is unavailable, the request proceeds without the idempotency layer, matching the project's graceful-degradation policy. Redis TTL handles expiry; no `node-cron` cleanup is used for these keys.

### 6. Soft-delete filtering

Soft-delete visibility is enforced with explicit repository/service filters, not a global Prisma extension. User-data queries must scope by the verified `userId`; transaction-facing default paths additionally filter `deletedAt: null`. Tests cover the relevant active/list/report paths. Lifecycle and cleanup jobs intentionally query deleted rows when processing retention.

### 7. Timezone and calendar boundaries

The shared backend date module represents business dates as `YYYY-MM-DD` strings and month buckets as the first day of the month. It uses `date-fns` and `date-fns-tz` for IANA-timezone conversion, with explicit UTC-midnight conversion for MySQL `DATE` columns. Do not replace user-timezone conversion with host-local date arithmetic. The project does not rely on the draft's `Intl.DateTimeFormat`-only helper names.

### 8. Prisma relations and `onDelete`

Use native MySQL foreign keys. Financial records use restrictive relations where deletion would invalidate ownership/history; dependent records use `Cascade` or `SetNull` where defined by the schema. Audit actor IDs intentionally have no user foreign key so audit history can survive account deletion. Confirm each relation's intended lifecycle in `backend/prisma/schema.prisma` and its migration.

## Implementation Status

The current Prisma schema, migrations, repositories, idempotency middleware, date helpers, and account-cleanup flow implement the decisions above. Account purge is an ordered lifecycle operation that respects restrictive foreign keys; it is not a direct user-row delete. There is no UUID helper/Prisma extension or MySQL idempotency table.

## Team Edits vs AI Draft

- The implemented design keeps `ownerKey` application-managed while also enforcing its relationship to `userId` with a database CHECK and compound unique key.
- **Concrete example:** A system category stores `userId = null` and `ownerKey = 'SYSTEM'`; a personal category stores its owner ID in both fields.
