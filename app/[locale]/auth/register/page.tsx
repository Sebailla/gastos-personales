/**
 * Auth.js sign-up page (server component).
 *
 * Renders a credentials form (email + password) that posts to a
 * server action which calls the application-layer
 * `registerAction`. On success we redirect to `/auth/signin`
 * with a `registered=1` flag so the sign-in page can show a
 * confirmation message. On failure we render the error inline
 * (mapped from the action's error envelope via the
 * `mapRegisterErrorToMessage` helper).
 *
 * The authService is instantiated once at module load (Next.js
 * imports server components once per worker) so we do not pay
 * the Argon2id construction cost on every form submit.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { registerAction } from '@/modules/auth/application/actions/register.action';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import { UserRepository } from '@/modules/auth/infrastructure/repositories/user.repository';
import { Argon2idHasher } from '@/modules/auth/infrastructure/external/argon2.hasher';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { systemClock } from '@/shared/clock/system-clock';
import { prisma } from '@/shared/db/prisma';
import { ErrorCode } from '@/shared/errors/error-codes';

// Single authService instance per worker (one module load per
// worker). Prisma client is created lazily by prisma() on first
// query, so this module import is cheap.
const authService = new AuthService(
  // The UserRepository constructor takes a narrow
  // `PrismaUserDelegate` view; the real `PrismaClient` is
  // structurally compatible (same `.user.{create,findUnique,
  // update}` shape) so the cast is safe. The narrow view keeps
  // the repository testable with a fake.
  new UserRepository(prisma() as unknown as ConstructorParameters<typeof UserRepository>[0]),
  new Argon2idHasher(),
  new EventDispatcher(),
  systemClock,
);

/**
 * Map a `registerAction` error envelope to a Spanish message
 * for the form UI. Centralised here so the page stays thin.
 */
function mapRegisterErrorToMessage(code: string): string {
  switch (code) {
    case ErrorCode.WEAK_PASSWORD:
      return 'La contraseña debe tener al menos 10 caracteres.';
    case ErrorCode.EMAIL_TAKEN:
      return 'Ese email ya está registrado. Iniciá sesión en su lugar.';
    case ErrorCode.VALIDATION_ERROR:
      return 'Revisá el email y la contraseña.';
    case ErrorCode.INTERNAL_ERROR:
      return 'Ocurrió un error inesperado. Intentá de nuevo en unos minutos.';
    default:
      return 'Ocurrió un error inesperado. Intentá de nuevo en unos minutos.';
  }
}

interface RegisterPageProps {
  searchParams: Promise<{ email?: string }> | { email?: string };
}

export const metadata = {
  title: 'Crear cuenta — gastos-personales',
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const defaultEmail = params.email ?? '';

  async function registerActionForForm(formData: FormData) {
    'use server';
    const email = formData.get('email');
    const password = formData.get('password');
    const result = await registerAction(authService, { email, password });
    if (result.status === 201) {
      redirect('/auth/signin?registered=1');
    }
    // On failure, re-render the page with the error in the
    // URL so the searchParam-driven message is shown.
    const msg = mapRegisterErrorToMessage(result.error.code);
    redirect(
      `/auth/register?email=${encodeURIComponent(typeof email === 'string' ? email : '')}&error=${encodeURIComponent(msg)}`,
    );
  }

  const errorParam = 'error' in params && typeof params.error === 'string' ? params.error : null;

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Crear cuenta</h1>
      <p>
        Empezá a registrar tus gastos. Solo necesitamos un email y una contraseña de al menos 10
        caracteres.
      </p>

      {errorParam ? (
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
          {errorParam}
        </div>
      ) : null}

      <form
        action={registerActionForForm}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '1rem 0' }}
      >
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            defaultValue={defaultEmail}
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
            autoComplete="new-password"
            style={{ display: 'block', width: '100%', padding: '0.5rem' }}
          />
        </label>
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Crear cuenta
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>
        ¿Ya tenés cuenta? <Link href="/auth/signin">Iniciá sesión</Link>.
      </p>
    </main>
  );
}
