/**
 * Typed Hono client (`hc<typeof honoApp>`).
 *
 * This is the type-safe RPC client the front-end and tests
 * use to talk to the application API. The client mirrors
 * the `honoApp` shape exactly; adding a route to `app.ts`
 * surfaces the new method here at compile time.
 *
 * Per decision gap #5 (HANDOFF.md §8): the typed client
 * is built from the `OpenAPIHono` instance and exported
 * as a factory. Callers pass the base URL once at module
 * init (env-driven) and reuse the client across requests.
 */

import { hc } from 'hono/client';
import type { AppType } from './app';

export const apiClient = (baseUrl: string) => hc<AppType>(baseUrl);
