/**
 * listTransactionsAction — `GET /api/transactions`.
 *
 * Slice 3 binding. Reads the validated query, calls the
 * repository through the deps bag, converts the page's
 * `Transaction[]` to `TransactionDTO[]`, and returns
 * `{ ok: true, value: { items, nextCursor } }`.
 *
 * The action does NOT call the FX provider or the event
 * dispatcher — both belong to the write paths. The list
 * path is read-only; the FX-snapshot values on each row
 * are already persisted.
 *
 * Cross-user isolation (BR-TX-4): every repository method
 * takes `userId` first. The action forwards `userId` from
 * the route-layer `requireSession` middleware; it never
 * trusts a body field.
 *
 * Validation: `TransactionListQuerySchema` clamps `limit`
 * to `1..100` (BR-TX-10). On Zod parse failure, the action
 * returns `VALIDATION_ERROR`.
 */

import type { TransactionActionDeps, ActionResult } from './_shared';
import { zodErrorToActionError } from './_shared';
import { TransactionListQuerySchema } from '../validation/transaction-list.schema';
import { toTransactionDto, type TransactionDTO } from '../dto/transaction.dto';

export interface ListTransactionsData {
  readonly items: TransactionDTO[];
  readonly nextCursor: string | null;
}

export async function listTransactionsAction(
  deps: TransactionActionDeps,
  userId: string,
  rawQuery: unknown,
): Promise<ActionResult<ListTransactionsData>> {
  const parsed = TransactionListQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success) return zodErrorToActionError(parsed.error);

  const page = await deps.repo.list(userId, {
    limit: parsed.data.limit,
    ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
    ...(parsed.data.accountId !== undefined ? { accountId: parsed.data.accountId } : {}),
  });

  return {
    ok: true,
    value: {
      items: page.data.map(toTransactionDto),
      nextCursor: page.nextCursor,
    },
  };
}
