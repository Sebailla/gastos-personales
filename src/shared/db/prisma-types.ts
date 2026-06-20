/**
 * Narrow Prisma delegate interfaces shared by the
 * repository adapters.
 *
 * F-14: the repository classes (auth's `UserRepository`,
 * accounts' `AccountRepositoryPrisma`) declared their
 * narrow Prisma delegate interfaces inline; the
 * composition root (`src/modules/api/app.ts` and
 * `src/lib/server-hono.ts`) cast the full `PrismaClient`
 * to `any` to access the `user` / `financialAccount`
 * delegates. This module centralises the narrow views so
 * the composition root can cast through them instead of
 * `any`. The signatures here are intentionally
 * `any`-typed: matching the inline repository types
 * structurally against Prisma's strict input types
 * (`UserCreateInput`, etc.) is not possible without
 * importing the full `@prisma/client` surface (which
 * defeats the purpose of the narrow view). The runtime
 * contract is structural — the real client has these
 * delegates and accepts the calls the adapters make.
 */

/** Minimal `prisma.user` surface used by `UserRepository`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PrismaUserDelegate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findUnique: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (args: any) => Promise<any>;
}

/** Minimal `prisma.financialAccount` surface used by `AccountRepositoryPrisma`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PrismaFinancialAccountDelegate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findUnique: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findFirst: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany: (args: any) => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMany: (args: any) => Promise<{ count: number }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  count: (args: any) => Promise<number>;
}

/** Narrow view of the `PrismaClient` we expose to the composition root. */
export interface PrismaDelegateView {
  user: PrismaUserDelegate;
  financialAccount: PrismaFinancialAccountDelegate;
}

/**
 * Pick the narrow delegate view out of a `PrismaClient`
 * (or any structural superset). The structural cast
 * goes through `unknown` because `PrismaClient` is wider
 * than the narrow view in unrelated fields (e.g.
 * `$transaction`, `$connect`) and because Prisma's
 * strict input types are not structurally assignable to
 * the narrow signatures (the inline interfaces use
 * `Record<string, unknown>` for inputs and outputs).
 */
export function asPrismaDelegateView(client: {
  user: PrismaUserDelegate;
  financialAccount: PrismaFinancialAccountDelegate;
}): PrismaDelegateView {
  return client as unknown as PrismaDelegateView;
}
