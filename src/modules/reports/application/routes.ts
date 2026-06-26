/**
 * `mountReportsRoutes` — Hono route factory for the
 * `/api/reports/*` endpoints.
 *
 * Slice 2 deliverable — the factory is EXPORTED but NOT YET
 * MOUNTED. Slice 3 (`reports-routes`) calls
 * `mountReportsRoutes(protectedApp, { reportsDeps })` from
 * `createHonoApp` after the transactions mount.
 *
 * The factory shape mirrors `mountTransactionsRoutes`:
 *
 *   - Takes `protectedApp` (the sub-app with `requireSession`
 *     middleware from `createHonoApp`).
 *   - Takes `deps: MountReportsRoutesDeps` — the deps bag is
 *     OPTIONAL so legacy accounts-only setups keep compiling
 *     (the factory returns `void` when `reportsDeps` is
 *     absent; mirrors the transactions pattern).
 *   - Returns `void`.
 *
 * The three routes are:
 *   - `GET /api/reports/monthly`
 *   - `GET /api/reports/breakdown`
 *   - `GET /api/reports/accounts/:accountId/flow`
 *
 * Each handler:
 *   1. Resolves the session user via `c.get('user')` (the
 *      `requireSession` middleware guarantees presence).
 *   2. Builds the action input from URL params + query string.
 *   3. Calls the corresponding action.
 *   4. On success, returns `c.json({ data: res.value }, 200)`.
 *   5. On failure, returns `c.json({ error: res.error },
 *      ErrorStatus[res.error.code])`.
 *
 * The error mapping is mechanical; the action layer maps
 * domain errors to wire codes per design §5.7
 * (domainErrorToActionError). The route layer is the
 * `ErrorStatus[code] → HTTP number` adapter.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import type { StatusCode } from 'hono/utils/http-status';
import { ErrorStatus } from '@/shared/errors/error-codes';
import type { AuthUser } from '@/modules/api/middlewares/variables';
import { getMonthlySummaryAction } from './actions/get-monthly-summary.action';
import { getCategoryBreakdownAction } from './actions/get-category-breakdown.action';
import { getAccountFlowAction } from './actions/get-account-flow.action';
import type { ReportsActionDeps } from './actions/_shared';

/**
 * The route layer's typed variables. `protectedApp` already
 * applies `requireSession`; the user is guaranteed present
 * inside the handlers.
 */
type ReportsProtectedVariables = { user: AuthUser; requestId: string };

/**
 * The factory's deps shape. `reportsDeps` is optional —
 * legacy accounts-only setups (slice 3 pre-merge) keep
 * compiling. When undefined, the factory returns `void` and
 * the routes are NOT mounted.
 */
export interface MountReportsRoutesDeps {
  reportsDeps?: ReportsActionDeps;
}

/**
 * Project a `URLSearchParams`-style record to a plain object
 * suitable for Zod parse. The `Object.fromEntries(new URL(req.url).searchParams)`
 * pattern returns `Record<string, string>`; the schemas
 * accept `unknown` and parse it.
 */
function paramsToObject(query: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === 'string') {
      out[k] = v;
    } else if (Array.isArray(v) && v[0] !== undefined) {
      out[k] = v[0];
    }
  }
  return out;
}

/**
 * Build the `ErrorStatus[code]` mapper. The Hono context
 * expects a `StatusCode` (the discriminated union of valid
 * HTTP status numbers); the AppError's `statusCode` field is
 * the shared-code lookup; we route through `ErrorStatus`
 * because the action returns an `AppError` (or a domain
 * error that maps via `domainErrorToActionError`).
 */
function statusFor(code: string): StatusCode {
  return (
    ErrorStatus[code as keyof typeof ErrorStatus] ?? ErrorStatus.INTERNAL_ERROR
  ) as StatusCode;
}

/**
 * Factory exported in slice 2; mounted in slice 3 by
 * `createHonoApp`. The factory is a no-op when `reportsDeps`
 * is undefined.
 */
export function mountReportsRoutes(
  protectedApp: OpenAPIHono<{ Variables: ReportsProtectedVariables }>,
  deps: MountReportsRoutesDeps,
): void {
  if (!deps.reportsDeps) return;
  const rDeps = deps.reportsDeps;

  protectedApp.get('/api/reports/monthly', async (c) => {
    const user = c.get('user');
    const query = paramsToObject(c.req.query());
    const res = await getMonthlySummaryAction(rDeps, {
      userId: user.id,
      rawQuery: query,
    });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  protectedApp.get('/api/reports/breakdown', async (c) => {
    const user = c.get('user');
    const query = paramsToObject(c.req.query());
    const res = await getCategoryBreakdownAction(rDeps, {
      userId: user.id,
      rawQuery: query,
    });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });

  protectedApp.get('/api/reports/accounts/:accountId/flow', async (c) => {
    const user = c.get('user');
    const accountId = c.req.param('accountId');
    const query = paramsToObject(c.req.query());
    const res = await getAccountFlowAction(rDeps, {
      userId: user.id,
      accountId,
      rawQuery: query,
    });
    if (res.ok) return c.json({ data: res.value }, 200);
    return c.json({ error: res.error }, statusFor(res.error.code));
  });
}
