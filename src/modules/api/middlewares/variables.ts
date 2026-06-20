/**
 * AuthUser — the authenticated-user shape stored on the
 * Hono context by `authMiddleware` (in `src/modules/api/app.ts`).
 *
 * Lives in its own file so `requireSession` (the protected
 * sub-app's middleware) and the public app's `authMiddleware`
 * can both reference the type without a circular import.
 *
 * The shape is intentionally minimal: only the fields
 * downstream code actually needs (`id`, `email`). Any
 * extra claims (roles, scopes, etc.) belong in a separate
 * session projection, not here.
 */

export interface AuthUser {
  readonly id: string;
  readonly email: string;
}
