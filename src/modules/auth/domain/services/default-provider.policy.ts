/**
 * DefaultProviderPolicy — domain service.
 *
 * Implements BR-AUTH-13: `defaultProvider` is set on the
 * first registration and never changed afterwards.
 *
 * `stampDefaultProvider` is a pure function that returns
 * the value the AuthService should write:
 * - existing user with a provider → keep it.
 * - new user (or existing user with `defaultProvider` null) → set to `newProvider`.
 *
 * `inferProviderFromOAuthProfile` is a defense-in-depth
 * check for the OAuth callback. The Auth.js Google
 * provider already enforces `email_verified: true`
 * (BR-AUTH-6); this function is the application layer's
 * guardrail.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { DefaultProvider } from '../entities/user';

export function stampDefaultProvider(
  current: DefaultProvider | null,
  newProvider: DefaultProvider,
): DefaultProvider {
  return current ?? newProvider;
}

export interface OAuthProfileShape {
  provider: string;
  email_verified: boolean;
}

export function inferProviderFromOAuthProfile(profile: OAuthProfileShape): 'google' {
  if (profile.provider !== 'google') {
    throw new AppError({
      code: ErrorCode.OAUTH_PROVIDER_UNAVAILABLE,
      message: `OAuth provider '${profile.provider}' is not supported in MVP.`,
    });
  }
  if (!profile.email_verified) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Google email_verified claim is false; Auth.js should have rejected the flow earlier.',
    });
  }
  return 'google';
}
