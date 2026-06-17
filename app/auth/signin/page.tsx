/**
 * Auth.js signIn page (server component).
 *
 * Renders a credentials form (email + password) and a
 * "Sign in with Google" button. Both forms use Auth.js v5
 * server actions (`signIn` from `@/modules/auth`) instead of
 * POSTing to `/api/auth/signin/<provider>` directly, because
 * the plain `<form action="...">` POST path requires a CSRF
 * token in the body. The server-action form lets Auth.js
 * manage the CSRF token internally.
 *
 * The `?error=` searchParam is read here and mapped to a
 * Spanish message via `mapAuthErrorToMessage`.
 *
 * On Credentials failure we redirect back to the same page
 * with `?error=...&callbackUrl=...` so the existing Spanish
 * error UI surfaces the failure (instead of a generic 500).
 * Google failures already redirect back via Auth.js's
 * callback flow.
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';

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

const credentialsFormSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(128),
});

/**
 * Only allow same-origin paths as `redirectTo`. Defends against
 * the classic open-redirect phishing primitive
 * (`?callbackUrl=https://evil.com` after a successful login).
 */
export function safeCallbackUrl(input: string | undefined): string {
  if (!input) return '/';
  if (!input.startsWith('/') || input.startsWith('//')) return '/';
  return input;
}

/**
 * Build the Credentials server action bound to a specific safe
 * `callbackUrl`. Exported as a factory so the page can render
 * `<form action={credentialsSignInAction('/dashboard')}>` and so
 * unit tests can exercise the action with a deterministic
 * callbackUrl.
 */
export function credentialsSignInAction(callbackUrl: string) {
  return async function action(formData: FormData) {
    'use server';
    const parsed = credentialsFormSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      redirect(
        `/auth/signin?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`,
      );
    }
    try {
      await signIn('credentials', {
        email: parsed.data.email,
        password: parsed.data.password,
        redirectTo: callbackUrl,
      });
    } catch (err) {
      // Auth.js v5 throws a redirect error on success; re-throw
      // so the framework can complete the navigation. Real auth
      // failures throw other errors which we surface via
      // `?error=...` so the existing Spanish UI can render them.
      // Unknown errors (no `.type`) are re-thrown so they don't
      // get silently swallowed as `?error=CredentialsSignin`.
      const type =
        err instanceof Error && 'type' in err ? String((err as { type: unknown }).type) : null;
      if (
        type === 'CredentialsSignin' ||
        type === 'CallbackRouteError' ||
        type === 'AccessDenied'
      ) {
        redirect(
          `/auth/signin?error=${encodeURIComponent(type)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
      }
      throw err;
    }
  };
}

export function googleSignInAction(callbackUrl: string) {
  return async function action() {
    'use server';
    try {
      await signIn('google', { redirectTo: callbackUrl });
    } catch (err) {
      const type =
        err instanceof Error && 'type' in err ? String((err as { type: unknown }).type) : null;
      if (
        type === 'OAuthAccountNotLinked' ||
        type === 'AccessDenied' ||
        type === 'CallbackRouteError'
      ) {
        redirect(
          `/auth/signin?error=${encodeURIComponent(type)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
      }
      throw err;
    }
  };
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  // In Next.js 15, `searchParams` is a Promise. The compat
  // shim accepts both shapes.
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const errorMessage = mapAuthErrorToMessage(params.error);
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  const credentialsAction = credentialsSignInAction(callbackUrl);
  const googleAction = googleSignInAction(callbackUrl);

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
        action={credentialsAction}
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

      <form action={googleAction} style={{ margin: '1rem 0' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Continuar con Google
        </button>
      </form>
    </main>
  );
}
