/**
 * Domain enum: `TransactionDirection`.
 *
 * The UPPERCASE form mirrors the future Prisma `TransactionDirection`
 * enum (`prisma/schema.prisma` lands in slice 2; this slice ships
 * the domain const only, no Prisma model). The wire form on the
 * Hono API is the same UPPERCASE string.
 *
 * BR-TX-2 (REQ-TX-3): in v1 the `direction` accepted at the API
 * boundary is `INCOME | EXPENSE`. `TRANSFER` is reserved for v1.1
 * and is rejected at the factory (`createTransaction`). The const
 * still ships the `TRANSFER` value because (a) it is the
 * exhaustive enum the future Prisma model will mirror, and (b) the
 * factory and the read-side adapters may need to import it for
 * forward compatibility.
 *
 * The `as const` + `typeof` + `keyof` triple is the project's
 * 5-enum convention (see `src/modules/accounts/domain/entities/financial-account.ts`
 * for the same pattern).
 */

export const TransactionDirection = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  TRANSFER: 'TRANSFER', // reserved for v1.1 — rejected at the API in v1
} as const;

export type TransactionDirection = (typeof TransactionDirection)[keyof typeof TransactionDirection];
