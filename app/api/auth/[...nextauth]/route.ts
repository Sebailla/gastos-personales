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

// Run the route handler in the Node.js runtime, NOT the Edge
// runtime. The default Edge runtime cannot load NAPI binaries
// (e.g. @node-rs/argon2 which authjs.ts transitively imports).
// Forcing the Node runtime avoids a build-time module-not-found
// error on @node-rs/argon2/browser.js.
export const runtime = 'nodejs';
