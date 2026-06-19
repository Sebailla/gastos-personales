/**
 * listAccountsAction — `GET /api/accounts`.
 *
 * Reads the validated query, calls `AccountService.list`,
 * and returns the paginated shape `{ data, nextCursor, total }`.
 * The Hono route reads the user from context (set by
 * `requireSession`); the action does NOT trust a userId
 * from the query.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { FinancialAccount } from '../../domain/entities/financial-account';
import { listAccountsSchema } from '../validation/list-accounts.schema';
import { zodErrorToActionError } from './_shared';

export type ListAccountsData = {
  data: FinancialAccount[];
  nextCursor: string | null;
  total: number;
};

export async function listAccountsAction(
  deps: AccountActionDeps,
  userId: string,
  rawQuery: unknown,
): Promise<ActionResult<ListAccountsData>> {
  const parsed = listAccountsSchema.safeParse(rawQuery ?? {});
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  const page = await deps.accountService.list(userId, {
    limit: parsed.data.limit,
    ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
    ...(parsed.data.archivedAt !== undefined ? { archivedAt: null } : {}),
  });
  return {
    ok: true,
    data: {
      data: page.data,
      nextCursor: page.nextCursor,
      total: page.data.length,
    },
  };
}
