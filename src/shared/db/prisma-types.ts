/**
 * Narrow Prisma delegate interfaces shared by the
 * repository adapters.
 *
 * Slice 4 update (2026-06-24): the F-14-era `any`
 * convention was REMOVED to comply with the §10.5
 * absolute rule ("No `any` — Use `unknown` or specific
 * interfaces"). Every method signature now uses:
 * - `args: object` for inputs (Prisma inputs are always
 *   objects; `object` is wider than `Record<string,
 *   unknown>` and accepts Prisma's strict input types
 *   like `UserCreateArgs` which carry required fields
 *   without a string index signature),
 * - `Promise<unknown>` for returns that are domain
 *   objects; specific shapes (`Promise<{ count: number }>`,
 *   `Promise<number>`, `Promise<unknown[]>`) where the
 *   Prisma API guarantees the shape.
 *
 * The runtime contract is structural — the real client
 * has these delegates and accepts the calls the adapters
 * make. The narrow signatures are wide enough for the
 * real Prisma input types (which are themselves typed
 * records) and narrow enough that downstream adapters
 * must narrow the `unknown` return back to the domain
 * type via a row mapper (see
 * `account.repository.prisma.ts:mapRow` for the pattern).
 *
 * Matching these signatures structurally against
 * Prisma's strict input types (`UserCreateInput`, etc.)
 * is not possible without importing the full
 * `@prisma/client` surface (which defeats the purpose of
 * the narrow view). `object` for inputs is the widest
 * type that still satisfies the "no `any`" rule.
 */

/** Minimal `prisma.user` surface used by `UserRepository`. */
export interface PrismaUserDelegate {
  create: (args: object) => Promise<unknown>;
  findUnique: (args: object) => Promise<unknown>;
  update: (args: object) => Promise<unknown>;
}

/** Minimal `prisma.financialAccount` surface used by `AccountRepositoryPrisma`. */
export interface PrismaFinancialAccountDelegate {
  create: (args: object) => Promise<unknown>;
  findUnique: (args: object) => Promise<unknown>;
  findFirst: (args: object) => Promise<unknown>;
  findMany: (args: object) => Promise<unknown[]>;
  updateMany: (args: object) => Promise<{ count: number }>;
  count: (args: object) => Promise<number>;
}

/**
 * Minimal `prisma.transaction` surface used by
 * `TransactionRepositoryPrisma` (slice 4). The slice-4
 * spec scopes the delegate to exactly the 5 methods the
 * adapter uses — `create`, `findFirst`, `findMany`,
 * `updateMany`, `deleteMany` — and the design §15.3
 * definition is the same.
 *
 * Note: the adapter does NOT use `findUnique` (it uses
 * `findFirst` with a `(id, userId)` where-clause for
 * cross-user safety). It does NOT use `count` (the list
 * endpoint reads `findMany` and the caller detects the
 * next-cursor via \`rows.length > opts.limit\`).
 */
export interface PrismaTransactionDelegate {
  create: (args: object) => Promise<unknown>;
  findFirst: (args: object) => Promise<unknown>;
  findMany: (args: object) => Promise<unknown[]>;
  updateMany: (args: object) => Promise<{ count: number }>;
  deleteMany: (args: object) => Promise<{ count: number }>;
}

/** Narrow view of the `PrismaClient` we expose to the composition root. */
export interface PrismaDelegateView {
  user: PrismaUserDelegate;
  financialAccount: PrismaFinancialAccountDelegate;
  transaction: PrismaTransactionDelegate;
}

/**
 * Pick the narrow delegate view out of a `PrismaClient`
 * (or any structural superset). The structural cast
 * goes through `unknown` because `PrismaClient` is wider
 * than the narrow view in unrelated fields (e.g.
 * `$transaction`, `$connect`) and because Prisma's
 * strict input types are not structurally assignable to
 * the narrow signatures (the narrow interfaces use
 * `object` for inputs and `Promise<unknown>` for returns).
 */
export function asPrismaDelegateView(client: {
  user: PrismaUserDelegate;
  financialAccount: PrismaFinancialAccountDelegate;
  transaction: PrismaTransactionDelegate;
}): PrismaDelegateView {
  return client as unknown as PrismaDelegateView;
}
