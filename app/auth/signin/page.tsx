/**
 * Auth.js signIn page (server component).
 *
 * Renders a credentials form (email + password) and a
 * "Sign in with Google" button. The credentials form posts
 * to `/api/auth/callback/credentials` (Auth.js's built-in
 * callback URL); the Google button posts to
 * `/api/auth/signin/google`. The `?error=` searchParam is
 * read here and mapped to a Spanish message via
 * `mapAuthErrorToMessage` (per decision gap #6).
 *
 * This page is a server component. The form is a plain
 * HTML `<form>` with `method="POST"`; no client-side
 * JavaScript is required for the MVP. The
 * `authjs.session-token` cookie is `HttpOnly`, so the
 * form-based sign-in works without React.
 */

import { mapAuthErrorToMessage } from '@/modules/auth/application/auth-error-map';

interface SignInPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }> | { error?: string; callbackUrl?: string };
}

export const metadata = {
  title: 'Iniciar sesión — gastos-personales',
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  // In Next.js 15, `searchParams` is a Promise. The compat
  // shim accepts both shapes.
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const errorMessage = mapAuthErrorToMessage(params.error);
  const callbackUrl = params.callbackUrl ?? '/';

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Iniciar sesión</h1>
      <p>
        Iniciá sesión con tu email y contraseña, o con Google.
      </p>

      {errorMessage ? (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            margin: '1rem 0',
            border: '1px solid #c00',
            borderRadius: 6,
            color: '#900',
            background: '#fee',
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <form
        method="post"
        action="/api/auth/callback/credentials"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '1rem 0' }}
      >
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            style={{ display: 'block', width: '100%', padding: '0.5rem' }}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            name="password"
            required
            minLength={10}
            autoComplete="current-password"
            style={{ display: 'block', width: '100%', padding: '0.5rem' }}
          />
        </label>
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Iniciar sesión
        </button>
      </form>

      <form
        method="post"
        action="/api/auth/signin/google"
        style={{ margin: '1rem 0' }}
      >
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Continuar con Google
        </button>
      </form>
    </main>
  );
}
