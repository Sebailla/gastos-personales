// app/api/[...path]/route.ts
// Hono catch-all: delegates non-auth requests to honoApp.fetch. Auth.js
// (app/api/auth/[...nextauth]/route.ts) takes routing precedence by Next.js's
// file-based routing (the more specific path wins). Hono's app.fetch will
// NEVER see requests to /api/auth/* because those are intercepted by
// the Auth.js handler.

import { honoApp } from '@/modules/api';
import type { NextRequest } from 'next/server';

async function handler(request: NextRequest): Promise<Response> {
  return honoApp.fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;

// Run the route handler in the Node.js runtime, NOT the Edge
// runtime. The default Edge runtime cannot load NAPI binaries
// (e.g. @node-rs/argon2 which the Hono app's auth middleware
// transitively imports). Forcing the Node runtime avoids a
// build-time module-not-found error on @node-rs/argon2/browser.js.
export const runtime = 'nodejs';
