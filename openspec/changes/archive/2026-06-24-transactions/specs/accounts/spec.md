# Spec — `accounts` capability (delta for `transactions`)

**Author**: Sebastián Illa
**Capability**: `accounts`
**Source change**: `transactions`
**Status**: delta · **Created**: 2026-06-22 · **Last sync**: 2026-06-22 (transactions)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (inherited from `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Delta spec for the `accounts` capability. The `transactions`
> change introduces a new `Transaction` aggregate that
> references `FinancialAccount.id` via an `accountId` FK with
> `onDelete: Cascade`. **This delta is a cross-link pointer
> only — no behavior of the `accounts` capability changes.**
> All existing BR-ACC-1 to BR-ACC-19 remain authoritative and
> are unmodified. The canonical `accounts` spec at
> `openspec/specs/accounts/spec.md` is the source of truth; this
> delta only adds one informational requirement pointer so a
> cross-module reader of the `accounts` spec is aware of the
> new child table.

## Purpose of this delta

The `transactions` change adds a new Prisma model
`Transaction` with a FK `accountId: string` to
`FinancialAccount.id`. The FK follows the same `onDelete:
Cascade` convention as `FinancialAccount.userId → User.id`. No
column on `FinancialAccount` changes; no behavior of the
`accounts` capability changes.

This delta exists so a future reader of the canonical
`accounts` spec who is auditing schema relations does not miss
the new child table. It carries one cross-link requirement that
asserts the existence of the FK; it does NOT carry behavior
specifications (those live in the `transactions` canonical spec
and delta).

## ADDED Requirements

### Schema relations

#### Requirement: FinancialAccount has a child Transaction table (REQ-ACC-X1)

The `FinancialAccount` table MUST have a child `Transaction`
table referenced via `accountId: string` (FK to
`FinancialAccount.id`, `onDelete: Cascade`). The child table is
owned by the `transactions` module; the parent table's column
list, indexes, and invariants are unchanged. The cross-module
invariant for `userId` scoping (per `auth/spec.md`) applies to
the child table: every `Transaction.accountId` lookup MUST
also include `userId` in the WHERE clause. (Traces: BR-TX-4,
DG-TX-1.)

#### Scenario: deleting a FinancialAccount cascades to its Transactions

- GIVEN: a `FinancialAccount` row owned by user A
- AND: the row has 3 child `Transaction` rows
- WHEN: the row is deleted (e.g. user-deletion change in the
  future)
- THEN: the 3 child `Transaction` rows are removed by
  `onDelete: Cascade`
- AND: no orphaned `Transaction.accountId` value remains

#### Scenario: a Transaction cannot reference another user's FinancialAccount

- GIVEN: a `Transaction` row owned by user A referencing
  `FinancialAccount.id = X` owned by user B
- WHEN: user A queries the transaction list
- THEN: the row is returned (the FK is satisfied at the DB
  level; the cross-module `userId` scope is enforced at the
  application layer per BR-TX-4)

## What this delta does NOT change

- No new column on `FinancialAccount`. The `accounts` schema
  is unchanged.
- No new endpoint on `/api/accounts/*`.
- No change to BR-ACC-1 through BR-ACC-19.
- No change to the FX port (`FxRateProvider`), the `casa`
  column, or the casa resolution rule. Those still live in the
  canonical `accounts` spec and the `fx` spec.
- The `archivedAt` soft-archive behavior on `FinancialAccount`
  is unchanged. The `Transaction` create path enforces BR-TX-5
  by reading `account.archivedAt` at the action boundary; this
  is the `transactions` capability's responsibility, not the
  `accounts` capability's.

## Cross-references

- **Transactions spec (NEW)**: `openspec/specs/transactions/spec.md`
  — the canonical `transactions` capability spec; BR-TX-4,
  BR-TX-5 are codified there.
- **Transactions delta (mirror)**: `openspec/changes/transactions/specs/transactions/spec.md`
  — the delta mirror of the canonical.
- **Accounts canonical**: `openspec/specs/accounts/spec.md` —
  the source of truth for the `accounts` capability. This
  delta only adds a cross-link pointer; the canonical's
  substantive content is unchanged.
- **FX spec**: `openspec/specs/fx/spec.md` — the casa
  resolution rule (REQ-FX-3) is unchanged.

## History

- **2026-06-22 (v1)** — first write. Added by the
  `transactions` change as a cross-link delta only. No
  behavior changes to `accounts`; the FK
  `Transaction.accountId → FinancialAccount.id` is the only
  new cross-module surface.
