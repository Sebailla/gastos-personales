/**
 * Auth.js route handler. Mounted at
 * `/api/auth/[...nextauth]/route.ts`. Auth.js handles
 *   - `/api/auth/signin`
 *   - `/api/auth/signout`
 *   - `/api/auth/callback/:provider`
 *   - `/api/auth/session`
 *   - `/api/auth/csrf`
 *   - `/api/auth/providers`
 *   - `/api/auth/verify-request`
 *
 * The handlers are imported from the auth module's public
 * surface (`@/modules/auth`), which re-exports the
 * `NextAuth(authConfig)` destructuring from `authjs.ts`.
 *
 * The import is done at module init so the Auth.js
 * module-level `DUMMY_HASH` is generated once per process.
 */

import { handlers } from '@/modules/auth';

export const { GET, POST } = handlers;
