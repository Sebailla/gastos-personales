/**
 * Auth.js signIn page (server component).
 *
 * Renders a credentials form (email + password) and a
 * "Sign in with Google" button. Both forms use Auth.js v5
 * server actions (`signIn` from `@/modules/auth`) instead
 * of POSTing to `/api/auth/signin/<provider>` directly,
 * because the plain `<form action="...">` POST path requires
 * a CSRF token in the body, which the page would have to
 * fetch from `/api/auth/csrf` first. The server-action form
 * lets Auth.js manage the CSRF token internally.
 *
 * The `?error=` searchParam is read here and mapped to a
 * Spanish message via `mapAuthErrorToMessage`.
 *
 * This page is a server component. No client-side JavaScript
 * is required for the MVP; the action attribute invokes the
 * server action via React's form-action binding.
 */

import { signIn } from '@/modules/auth';
import { mapAuthErrorToMessage } from '@/modules/auth/application/auth-error-map';

interface SignInPageProps {
  searchParams:
    | Promise<{ error?: string; callbackUrl?: string }>
    | { error?: string; callbackUrl?: string };
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

  async function signInWithCredentials(formData: FormData) {
    'use server';
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: callbackUrl,
    });
  }

  async function signInWithGoogle() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Iniciar sesión</h1>
      <p>Iniciá sesión con tu email y contraseña, o con Google.</p>

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
        action={signInWithCredentials}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '1rem 0' }}
      >
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

      <form action={signInWithGoogle} style={{ margin: '1rem 0' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Continuar con Google
        </button>
      </form>
    </main>
  );
}
