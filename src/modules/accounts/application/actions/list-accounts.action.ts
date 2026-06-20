/**
 * listAccountsAction — `GET /api/accounts`.
 *
 * Reads the validated query, calls `AccountService.list`,
 * and returns the paginated shape `{ data, nextCursor, total }`.
 * The Hono route reads the user from context (set by
 * `requireSession`); the action does NOT trust a userId
 * from the query.
 *
 * `total` is the full row count under the same filter,
 * not the page length. The UI uses it to render
 * "Showing first N of M" (see `accounts/spec.md` scenario
 * "populated list shows up to 50 accounts"). The repository
 * issues a separate `count` query for this so the page
 * query stays small and the count is always accurate.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { FinancialAccount } from '../../domain/entities/financial-account';
import { listAccountsSchema } from '../validation/list-accounts.schema';
import { zodErrorToActionError } from './_shared';
import { logger } from '@/shared/logger/logger';

export type ListAccountsData = {
  data: FinancialAccount[];
  nextCursor: string | null;
  total?: number; // F-13: omitted when the count query fails transiently
};

export async function listAccountsAction(
  deps: AccountActionDeps,
  userId: string,
  rawQuery: unknown,
): Promise<ActionResult<ListAccountsData>> {
  const parsed = listAccountsSchema.safeParse(rawQuery ?? {});
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  // F-12: build the filter once and pass the SAME options
  // to both `list` and `count`. The previous code re-derived
  // the `archivedAt` filter on each call site, which made
  // it easy to drift between them (e.g. dropping a future
  // filter on one side). `count` ignores `limit` and
  // `cursor`; only `archivedAt` is meaningful for it.
  const filter: { archivedAt?: null; cursor?: string; limit: number } = {
    limit: parsed.data.limit,
    ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
    ...(parsed.data.archivedAt !== undefined ? { archivedAt: null } : {}),
  };
  // F-13: the list is the critical data; `total` is a UX
  // enhancement. A transient count failure (e.g. DB
  // overload) must NOT take down the list view. We
  // sequence the calls so a list failure surfaces an
  // error envelope, but a count failure is logged and
  // `total` is omitted from the response (the UI degrades
  // to "Showing first N" without the "of M" footer).
  const page = await deps.accountService.list(userId, filter);
  let total: number | undefined;
  try {
    total = await deps.accountService.count(userId, filter);
  } catch (err) {
    logger.warn('list_accounts_count_failed', {
      userId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    total = undefined;
  }
  return {
    ok: true,
    data: {
      data: page.data,
      nextCursor: page.nextCursor,
      total,
    },
  };
}
