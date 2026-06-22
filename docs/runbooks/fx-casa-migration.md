# Runbook — `add_account_fx_casa` migration (fx-cache PR-2)

**Owner**: Sebastián Illa
**Change**: `fx-cache`
**PR**: PR-2 of 3 chained PRs (`feat/fx-cache-2` → `develop`)
**Migration**: `prisma/migrations/<timestamp>_add_account_fx_casa/migration.sql`
**Spec hand-off**: REQ-FX-9 (casa column is non-destructive)

This runbook covers the operator-side checks for the `add_account_fx_casa`
Prisma migration. The migration adds a nullable `casa` column to
`FinancialAccount` (a `AccountFxCasa` enum with values `OFICIAL | BLUE |
MEP | CCL | CRIPTO | TARJETA`). It is **non-destructive**: existing rows
land with `casa = NULL` and render the inherited global default
(`env.FX_DEFAULT_CASA`, default `'oficial'`) until the user picks an
explicit casa on the create form.

---

## 1. Pre-migration snapshot

Before applying the migration, capture the count of `FinancialAccount`
rows. The migration is non-destructive — the count MUST be unchanged
after.

```bash
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "FinancialAccount";'
```

Expected output: a single integer (the row count). Save the value in
your ticket / change log. The post-migration check uses the same query
and MUST report the same number.

## 2. Apply the migration

The migration is committed to `prisma/migrations/` and runs as part of
the normal `prisma migrate deploy` flow. There is no manual SQL step.

```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
# Expected: "Database schema is up to date!"
```

The generated `migration.sql` looks like:

```sql
-- CreateEnum
CREATE TYPE "AccountFxCasa" AS ENUM ('OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA');

-- AlterTable
ALTER TABLE "FinancialAccount" ADD COLUMN     "casa" "AccountFxCasa";
```

There is **no `NOT NULL`**, **no `DEFAULT`**, and **no `UPDATE`** on
existing rows. Postgres accepts the column addition and the existing
rows land with `casa = NULL` by default.

## 3. Post-migration verification

### 3.1 — Every existing row has `casa IS NULL`

```bash
psql "$DATABASE_URL" -c \
  'SELECT count(*) FROM "FinancialAccount" WHERE "casa" IS NULL;'
```

Expected: the same integer as the pre-migration snapshot. **If any
row reports `casa IS NOT NULL` here, the migration did NOT run as
designed** — escalate immediately (the migration must not backfill).

### 3.2 — No row was altered beyond the column addition

```bash
psql "$DATABASE_URL" -c \
  'SELECT count(*) FROM "FinancialAccount" WHERE "updatedAt" > now() - interval ''1 minute'';'
```

Expected: `0` (the migration does not touch existing rows; only the
column addition fires).

### 3.3 — The new column accepts the `AccountFxCasa` enum

```bash
psql "$DATABASE_URL" -c \
  "INSERT INTO \"FinancialAccount\" \
   (\"id\", \"userId\", \"type\", \"name\", \"currency\", \
    \"openingBalanceMinor\", \"openingBalanceMode\", \"casa\", \
    \"createdAt\", \"updatedAt\") \
   VALUES \
   ('test-casa-blue', (SELECT \"id\" FROM \"User\" LIMIT 1), 'BANK', \
    'Test casa blue', 'USD', 0, 'FRESH', 'BLUE', now(), now());"

psql "$DATABASE_URL" -c \
  "SELECT \"name\", \"casa\" FROM \"FinancialAccount\" WHERE \"id\" = 'test-casa-blue';"

psql "$DATABASE_URL" -c \
  "DELETE FROM \"FinancialAccount\" WHERE \"id\" = 'test-casa-blue';"
```

Expected: the row inserts with `casa = 'BLUE'`; the SELECT returns
`'BLUE'`; the DELETE removes the probe row.

### 3.4 — Invalid casa values are rejected at the DB layer

```bash
psql "$DATABASE_URL" -c \
  "INSERT INTO \"FinancialAccount\" \
   (\"id\", \"userId\", \"type\", \"name\", \"currency\", \
    \"openingBalanceMinor\", \"openingBalanceMode\", \"casa\", \
    \"createdAt\", \"updatedAt\") \
   VALUES \
   ('test-casa-bad', (SELECT \"id\" FROM \"User\" LIMIT 1), 'BANK', \
    'Test casa bad', 'USD', 0, 'FRESH', 'INVALID', now(), now());"
```

Expected: an error (`invalid input value for enum AccountFxCasa:
"INVALID"`). The Zod parse at the API boundary catches this in
practice; the DB-level rejection is defense-in-depth.

## 4. Smoke UI check (operator terminal)

After the migration is applied and the application redeployed:

1. Sign in via `/auth/signin`.
2. Visit `/accounts/new` — confirm the new **"FX casa (optional)"**
   select renders with 7 options (6 casas + "Default (oficial)").
3. Create a new account with `casa = BLUE` → `POST /api/accounts`
   returns `201`.
4. `GET /api/accounts/<new-id>` → the response body's `casa` field
   is the **lowercase** DolarAPI form (`"blue"`).
5. Verify the existing balance widget still 503s — DI is wired to
   the stub; the FX endpoint is not yet wired to the real provider
   (that lands in PR-3).

**Screenshot slot**: attach a screenshot of the `/accounts/new` form
showing the new "FX casa (optional)" select, with one explicit casa
selected, to the PR / change log.

## 5. Rollback

The migration is forward-only and cannot be cleanly rolled back
without a manual downgrade. If a problem surfaces after the migration:

1. Stop the application process (so no new writes land).
2. Inspect the running app version. The migration's only schema
   change is the `casa` column and the `AccountFxCasa` enum. An
   app version pre-PR-2 does not read or write the column.
3. If you must revert the schema:
   ```sql
   ALTER TABLE "FinancialAccount" DROP COLUMN "casa";
   DROP TYPE "AccountFxCasa";
   ```
   This is destructive: any row that had `casa` set loses that
   value. **Do not run this if any user has set a casa since the
   migration applied.** Coordinate with the user before rolling back.

## 6. Related artifacts

- `prisma/migrations/<ts>_add_account_fx_casa/migration.sql` — the
  generated migration.
- `openspec/changes/fx-cache/specs/fx/spec.md` REQ-FX-9 — the
  non-destructive migration requirement.
- `openspec/changes/fx-cache/design.md` §3.3 — the migration design.
- `docs/adr/0010-dolar-api-provider.md` — the per-account casa
  decision (DG-FX-2).
- `Documents-es/docs/runbooks/fx-casa-migration.md` — Spanish
  mirror.
