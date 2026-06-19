/**
 * Typed Hono client for browser-side use.
 *
 * The PR-C smoke UI primarily uses `serverHonoRequest` from
 * `./server-hono.ts` for Server Components (in-process calls
 * with the real `auth()` injection) and plain `fetch()` with
 * relative paths for Client Components (so the same-origin
 * path is the only piece the browser sees).
 *
 * This module exists for the cases where a typed client is
 * preferred in a Client Component (e.g. when the API base URL
 * needs to be inferred from `process.env.NEXT_PUBLIC_API_URL`
 * rather than the same-origin assumption). The factory from
 * `@/modules/api/client.ts` is the same one the test suite
 * exercises (see `src/modules/api/client.test.ts`).
 *
 * `process.env.NEXT_PUBLIC_API_URL` is a build-time-replaced
 * variable: at build time Next.js inlines its value into the
 * client bundle. When the env is unset (e.g. dev without a
 * `.env` file), the default empty string produces a relative
 * client that resolves to the same origin.
 *
 * Hand-verified: if this file compiles, the `apiClient` shape
 * mirrors `AppType` exactly. Adding a route to
 * `src/modules/api/app.ts` automatically widens this client's
 * type surface (no manual sync required). See T-C6 in
 * `openspec/changes/accounts-ledger/tasks.md`.
 */

import { hc } from 'hono/client';
import type { AppType } from '@/modules/api';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

export const apiClient = hc<AppType>(baseUrl);
