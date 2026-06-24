/**
 * Light-weight test for the signIn page. We do NOT render
 * React here (no `react-testing-library` in this slice; the
 * renderer setup lives in a future UI-shell change). The
 * test asserts:
 *
 *   1. The page module exports a default async function.
 *   2. The `mapAuthErrorToMessage` is wired in (the error
 *      message for `?error=OAuthAccountNotLinked` matches
 *      decision gap #6 wording).
 *   3. The server actions wire the form submit to `signIn`
 *      with the correct provider, form fields, and
 *      redirectTo. We import the exported action factories
 *      directly (no JSX walking) and exercise them with a
 *      mocked `signIn` and `redirect`.
 *
 * The visual rendering is validated by `pnpm run build`
 * (Next.js production build) and by manual smoke in dev.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The page imports `signIn` from `@/modules/auth/nextauth` to
// wire the Google / Credentials server actions. `signIn`
// transitively pulls in `next-auth`, which requires
// `next/server` (a Next.js runtime module unavailable in
// plain Vitest). We mock just the surface the page uses so
// the test loads without booting the auth module.
vi.mock('@/modules/auth/nextauth', () => ({
  signIn: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__redirect:${url}`);
  }),
}));

// re-apply redirect's implementation after every reset (mockReset
// strips it). Otherwise the mocked `redirect` returns undefined
// instead of throwing.
function resetMocks(): void {
  mockSignIn.mockReset();
  mockRedirect.mockReset();
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`__redirect:${url}`);
  });
}

import SignInPage, { credentialsSignInAction, googleSignInAction, safeCallbackUrl } from './page';

const { signIn: mockSignIn } = (await import('@/modules/auth/nextauth')) as unknown as {
  signIn: ReturnType<typeof vi.fn>;
};
const { redirect: mockRedirect } = (await import('next/navigation')) as unknown as {
  redirect: ReturnType<typeof vi.fn>;
};

describe('safeCallbackUrl', () => {
  it('accepts same-origin paths', () => {
    expect(safeCallbackUrl('/dashboard')).toBe('/dashboard');
    expect(safeCallbackUrl('/dashboard/sub?x=1')).toBe('/dashboard/sub?x=1');
  });
  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(safeCallbackUrl('//evil.com')).toBe('/');
  });
  it('rejects absolute external URLs', () => {
    expect(safeCallbackUrl('https://evil.com')).toBe('/');
    expect(safeCallbackUrl('http://evil.com/path')).toBe('/');
  });
  it('falls back to / for empty / undefined', () => {
    expect(safeCallbackUrl(undefined)).toBe('/');
    expect(safeCallbackUrl('')).toBe('/');
  });
});

describe('SignInPage', () => {
  it('exports a default async function (server component)', () => {
    expect(typeof SignInPage).toBe('function');
  });

  it('maps the OAuthAccountNotLinked error to a clear Spanish message', async () => {
    // The page's error UI delegates to mapAuthErrorToMessage. We
    // assert that function's output directly rather than walking
    // the RSC payload, because server-component return values are
    // opaque serialisable objects (not strings).
    const { mapAuthErrorToMessage } = await import('@/modules/auth/application/auth-error-map');
    const params = { error: 'OAuthAccountNotLinked', callbackUrl: '/' };
    const jsx = await SignInPage({ searchParams: params });
    expect(jsx).toBeDefined();
    expect(mapAuthErrorToMessage(params.error)).toMatch(/otro email/);
  });

  it('falls back to a generic message when no error param is present', async () => {
    const { mapAuthErrorToMessage } = await import('@/modules/auth/application/auth-error-map');
    const jsx = await SignInPage({ searchParams: {} });
    expect(jsx).toBeDefined();
    expect(mapAuthErrorToMessage(undefined)).toBeTruthy();
  });
});

describe('credentialsSignInAction', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('calls signIn("credentials", { email, password, redirectTo }) on valid input', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    const action = credentialsSignInAction('/dashboard');
    const fd = new FormData();
    fd.set('email', 'a@b.com');
    fd.set('password', 'correct-horse-battery');
    await action(fd);
    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'a@b.com',
      password: 'correct-horse-battery',
      redirectTo: '/dashboard',
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects to ?error=CredentialsSignin when formData fails Zod validation', async () => {
    const action = credentialsSignInAction('/dashboard');
    const fd = new FormData();
    fd.set('email', 'not-an-email');
    fd.set('password', 'x');
    await expect(action(fd)).rejects.toThrow('__redirect:');
    expect(mockRedirect).toHaveBeenCalledWith(
      '/auth/signin?error=CredentialsSignin&callbackUrl=%2Fdashboard',
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('redirects to ?error=CredentialsSignin when Auth.js throws CredentialsSignin', async () => {
    mockSignIn.mockImplementationOnce(() => {
      const err = new Error('Bad credentials') as Error & { type: string };
      err.type = 'CredentialsSignin';
      throw err;
    });
    const action = credentialsSignInAction('/dashboard');
    const fd = new FormData();
    fd.set('email', 'a@b.com');
    fd.set('password', 'wrong');
    await expect(action(fd)).rejects.toThrow('__redirect:');
    expect(mockRedirect).toHaveBeenCalledWith(
      '/auth/signin?error=CredentialsSignin&callbackUrl=%2Fdashboard',
    );
  });

  it('re-throws non-Auth.js errors (does not swallow them)', async () => {
    mockSignIn.mockImplementationOnce(() => {
      throw new Error('db is on fire');
    });
    const action = credentialsSignInAction('/dashboard');
    const fd = new FormData();
    fd.set('email', 'a@b.com');
    fd.set('password', 'long-enough-password');
    await expect(action(fd)).rejects.toThrow('db is on fire');
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('googleSignInAction', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('calls signIn("google", { redirectTo })', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    const action = googleSignInAction('/dashboard');
    await action();
    expect(mockSignIn).toHaveBeenCalledWith('google', { redirectTo: '/dashboard' });
  });

  it('redirects to ?error=AccessDenied when Auth.js throws AccessDenied', async () => {
    mockSignIn.mockImplementationOnce(() => {
      const err = new Error('Access denied by handler') as Error & { type: string };
      err.type = 'AccessDenied';
      throw err;
    });
    const action = googleSignInAction('/dashboard');
    await expect(action()).rejects.toThrow('__redirect:');
    expect(mockRedirect).toHaveBeenCalledWith(
      '/auth/signin?error=AccessDenied&callbackUrl=%2Fdashboard',
    );
  });
});
