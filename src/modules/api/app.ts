/**
 * api module — Hono app entry point.
 *
 * This file is intentionally thin. The composition
 * concern (building a Hono app instance from per-module
 * `mountXxxRoutes` functions) lives at
 * `@/composition/create-hono-app` — the composition root
 * is the ONE place where cross-module wiring is allowed
 * (root AGENTS.md §10.5 "Modules isolated").
 *
 * What stays here:
 *   - The production default `honoApp` instance built
 *     from `createHonoApp(buildAppDeps())`.
 *   - The `AppType` type for downstream RPC client
 *     inference (`hc<AppType>` in the smoke client).
 *   - Thin re-exports so existing consumers
 *     (`app/api/[...path]/route.ts`,
 *     `src/modules/api/*.test.ts`) can keep importing
 *     `createHonoApp` / `HonoAppDeps` /
 *     `HonoContextVariables` from `@/modules/api/app`.
 *     The composition file is the source of truth; this
 *     is just a stable surface for downstream callers.
 *
 * Consumers that compose their own app with custom deps
 * SHOULD import `createHonoApp` directly from
 * `@/composition/create-hono-app` — that import signals
 * "I am composing an app instance", which is the
 * composition concern.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { buildAppDeps } from '@/composition/build-app-deps';
import { createHonoApp, type HonoContextVariables } from '@/composition/create-hono-app';

export type { HonoContextVariables } from '@/composition/create-hono-app';
export { createHonoApp } from '@/composition/create-hono-app';
export type { HonoAppDeps } from '@/composition/build-app-deps';

/**
 * Production default app instance. Built once at module
 * load time from the default deps bag. The Next.js
 * catch-all route handler (`app/api/[...path]/route.ts`)
 * mounts this under `/api/*`.
 */
export const honoApp: OpenAPIHono<{ Variables: HonoContextVariables }> =
  createHonoApp(buildAppDeps());

export type AppType = typeof honoApp;