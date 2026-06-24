/**
 * mountTransactionsRoutes - mount the 6 transactions
 * routes on the supplied protected sub-app.
 *
 * Slice 5 binding. The 6 routes wrap the 5 slice-3
 * actions. Every route filters by `user.id` from
 * `c.get('user')` (BR-TX-4). The `transactionDeps` bag
 * is supplied via the function's deps argument (the
 * production composition root builds it; tests inject
 * a fake one with an in-memory repository to keep the
 * route integration tests hermetic - no Prisma
 * round-trip).
 *
 * The function is a no-op when `transactionDeps` is
 * NOT supplied (the legacy accounts-only test setups
 * keep compiling unchanged). The new routes 404 when
 * not registered, but the existing accounts routes
 * keep working.
 *
 * The `as never` cast on the HTTP status was kept
 * from the original `app.ts` implementation: Hono's
 * `c.json(body, status)` is generic over Hono's literal
 * `StatusCode` type, and `ErrorStatus[code]` is a plain
 * `number`. The cast bridges the literal-type gap. The
 * runtime value is correct; the cast is purely a
 * type-system convenience.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { ErrorStatus } from '@/shared/errors/error-codes';
import { listTransactionsAction } from './actions/list-transactions.action';
import { getTransactionAction } from './actions/get-transaction.action';
import { createTransactionAction } from './actions/create-transaction.action';
import { updateTransactionAction } from './actions/update-transaction.action';
import { deleteTransactionAction } from './actions/delete-transaction.action';
import type { TransactionActionDeps } from './actions/_shared';
import type { AuthUser } from '@/modules/api/middlewares/variables';

/**
 * Variables shape used by the protected sub-app. The
 * `requireSession` middleware (registered by the
 * composition root) narrows `user` to `AuthUser`
 * (non-null).
 */
type TransactionsProtectedVariables = { user: AuthUser; requestId: string };

/**
 * The deps the transactions routes need from the
 * composition root. `transactionDeps` is the
 * TransactionActionDeps bag built in
 * `src/composition/build-app-deps.ts` (composition
 * root). The bag is OPTIONAL so legacy accounts-only
 * test setups keep compiling unchanged - the new
 * routes 404 when not registered.
 */
export interface MountTransactionsRoutesDeps {
  transactionDeps?: TransactionActionDeps;
}

/**
 * Mount the 6 transaction-domain routes on the
 * supplied protected sub-app:
 *   1. `GET /api/transactions` - list with cursor
 *      pagination (REQ-TX-1).
 *   2. `GET /api/transactions/account/:accountId` -
 *      per-account list (the 6th route - REQ-TX-8 with
 *      accountId pre-filled).
 *   3. `POST /api/transactions` - create (REQ-TX-2,
 *      BR-TX-5 archived pre-check).
 *   4. `GET /api/transactions/:id` - get one.
 *   5. `PATCH /api/transactions/:id` - partial update.
 *   6. `DELETE /api/transactions/:id` - hard delete.
 *
 * No-op when `deps.transactionDeps` is undefined
 * (legacy test setups).
 */
export function mountTransactionsRoutes(
  protectedApp: OpenAPIHono<{ Variables: TransactionsProtectedVariables }>,
  deps: MountTransactionsRoutesDeps,
): void {
  if (!deps.transactionDeps) {
    return;
  }
  const txDeps = deps.transactionDeps;
  // `c.json(body, status)` is generic over `StatusCode`
  // (Hono's literal type). `ErrorStatus[code]` is a
  // plain `number`, so cast through `as never` to
  // bridge the literal-type gap. The runtime value is
  // correct; the cast is purely a type-system
  // convenience.
  const statusFor = (code: string): never => ErrorStatus[code as keyof typeof ErrorStatus] as never;

  // 1. List transactions (cursor pagination; optional accountId).
  protectedApp.get('/api/transactions', async (c) => {
    const user = c.get('user');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await listTransactionsAction(txDeps, user.id, query);
    if (res.ok) {
      return c.json({ data: res.value.items, nextCursor: res.value.nextCursor }, 200);
    }
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  // 2. Per-account list (the 6th route - REQ-TX-8 with accountId pre-filled).
  protectedApp.get('/api/transactions/account/:accountId', async (c) => {
    const user = c.get('user');
    const accountId = c.req.param('accountId');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await listTransactionsAction(txDeps, user.id, { ...query, accountId });
    if (res.ok) {
      return c.json({ data: res.value.items, nextCursor: res.value.nextCursor }, 200);
    }
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  // 3. Create transaction.
  protectedApp.post('/api/transactions', async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);
    const res = await createTransactionAction(txDeps, user.id, body);
    if (res.ok) {
      return c.json({ data: res.value }, 201);
    }
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  // 4. Get one transaction.
  protectedApp.get('/api/transactions/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const res = await getTransactionAction(txDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: res.value }, 200);
    }
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  // 5. Partial update.
  protectedApp.patch('/api/transactions/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    const res = await updateTransactionAction(txDeps, user.id, { ...body, id });
    if (res.ok) {
      return c.json({ data: res.value }, 200);
    }
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  // 6. Hard delete.
  protectedApp.delete('/api/transactions/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const res = await deleteTransactionAction(txDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: res.value }, 200);
    }
    return c.json({ error: res.error }, statusFor(res.error.code));
  });
}
