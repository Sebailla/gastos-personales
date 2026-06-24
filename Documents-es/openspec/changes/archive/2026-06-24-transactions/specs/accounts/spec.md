# Spec — capability `accounts` (delta para `transactions`)

**Autor**: Sebastián Illa
**Capability**: `accounts`
**Cambio fuente**: `transactions`
**Estado**: delta · **Creado**: 2026-06-22 · **Última sync**: 2026-06-22 (transactions)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Delta spec para la capability `accounts`. El cambio
> `transactions` introduce un nuevo agregado `Transaction` que
> referencia `FinancialAccount.id` vía una FK `accountId` con
> `onDelete: Cascade`. **Esta delta es solo un puntero
> cross-link — ningún comportamiento de la capability
> `accounts` cambia.** Todos los BR-ACC-1 a BR-ACC-19
> existentes siguen autoritativos y sin modificaciones. La
> spec canónica de `accounts` en
> `openspec/specs/accounts/spec.md` es la source of truth;
> esta delta solo agrega un requirement puntero informativo
> para que un lector cross-module de la spec de `accounts`
> esté al tanto de la nueva tabla hija.

## Propósito de esta delta

El cambio `transactions` agrega un nuevo modelo Prisma
`Transaction` con una FK `accountId: string` a
`FinancialAccount.id`. La FK sigue la misma convención
`onDelete: Cascade` que `FinancialAccount.userId → User.id`.
Ninguna columna de `FinancialAccount` cambia; ningún
comportamiento de la capability `accounts` cambia.

Esta delta existe para que un lector futuro de la spec
canónica de `accounts` que esté auditando relaciones de schema
no se pierda la nueva tabla hija. Carga un requirement
cross-link que asserta la existencia de la FK; NO carga
especificaciones de comportamiento (esas viven en la spec
canónica de `transactions` y en su delta).

## ADDED Requirements

### Schema relations

#### Requirement: FinancialAccount tiene una tabla hija Transaction (REQ-ACC-X1)

La tabla `FinancialAccount` DEBE tener una tabla hija
`Transaction` referenciada vía `accountId: string` (FK a
`FinancialAccount.id`, `onDelete: Cascade`). La tabla hija es
debida al módulo `transactions`; la lista de columnas,
indexes e invariantes de la tabla padre no cambian. El
invariante cross-module para el scoping por `userId` (según
`auth/spec.md`) aplica a la tabla hija: cada lookup de
`Transaction.accountId` DEBE incluir también `userId` en la
cláusula WHERE. (Traces: BR-TX-4, DG-TX-1.)

#### Scenario: Borrar un FinancialAccount cascadea a sus Transactions

- GIVEN: una fila de `FinancialAccount` owned por el usuario A
- AND: la fila tiene 3 filas hijas de `Transaction`
- WHEN: la fila se borra (ej. un cambio futuro de
  user-deletion)
- THEN: las 3 filas hijas de `Transaction` se remueven por
  `onDelete: Cascade`
- AND: no queda ningún valor huérfano de `Transaction.accountId`

#### Scenario: Una Transaction no puede referenciar un FinancialAccount de otro usuario

- GIVEN: una fila de `Transaction` owned por el usuario A que
  referencia `FinancialAccount.id = X` owned por el usuario B
- WHEN: el usuario A consulta el listado de transacciones
- THEN: la fila se devuelve (la FK está satisfecha a nivel
  de DB; el scope cross-module de `userId` se enforceza en
  la capa de aplicación según BR-TX-4)

## Lo que esta delta NO cambia

- Ninguna columna nueva en `FinancialAccount`. El schema de
  `accounts` no se modifica.
- Ningún endpoint nuevo en `/api/accounts/*`.
- Ningún cambio a BR-ACC-1 a BR-ACC-19.
- Ningún cambio al port de FX (`FxRateProvider`), la columna
  `casa`, ni la regla de resolución de casa. Esos siguen
  viviendo en la spec canónica de `accounts` y en la spec de
  `fx`.
- El comportamiento de soft-archive por `archivedAt` en
  `FinancialAccount` no se modifica. La ruta de create de
  `Transaction` enforceza BR-TX-5 leyendo
  `account.archivedAt` en la frontera de la acción; esa es
  responsabilidad de la capability `transactions`, no de la
  capability `accounts`.

## Cross-references

- **Spec de transactions (NUEVO)**: `openspec/specs/transactions/spec.md`
  — la spec canónica de la capability `transactions`;
  BR-TX-4, BR-TX-5 están codificados ahí.
- **Delta de transactions (espejo)**: `openspec/changes/transactions/specs/transactions/spec.md`
  — el espejo delta de la canónica.
- **Canónica de accounts**: `openspec/specs/accounts/spec.md` —
  la source of truth para la capability `accounts`. Esta
  delta solo agrega un puntero cross-link; el contenido
  sustantivo de la canónica no se modifica.
- **Spec de FX**: `openspec/specs/fx/spec.md` — la regla de
  resolución de casa (REQ-FX-3) no se modifica.

## History

- **2026-06-22 (v1)** — primera escritura. Agregada por el
  cambio `transactions` como delta cross-link únicamente. Sin
  cambios de comportamiento en `accounts`; la FK
  `Transaction.accountId → FinancialAccount.id` es la única
  superficie cross-module nueva.
