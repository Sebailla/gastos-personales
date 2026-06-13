/**
 * mapAuthErrorToMessage — maps an Auth.js error code from
 * the `?error=` searchParam on the signIn page to a
 * user-facing Spanish message.
 *
 * Per decision gap #6 (HANDOFF.md §8), the
 * `OAuthAccountNotLinked` UX shows a clear message
 * explaining that the Google account is already linked to
 * a different email and the user should sign out and try
 * again or contact support.
 *
 * The function deliberately does NOT echo the raw code
 * back to the user (info-leak defense) and does NOT
 * differentiate "unknown code" from "no code" (same
 * generic Spanish message for both).
 */

const KNOWN_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    'Esta cuenta de Google ya está vinculada a otro email. Cerrá sesión e intentá de nuevo, o contactá a soporte.',
  OAuthSignInError:
    'No pudimos completar el inicio de sesión con Google. Intentá de nuevo en unos minutos.',
  OAuthCallbackError:
    'La respuesta de Google no fue válida. Intentá de nuevo o usá otro método de inicio de sesión.',
  AccessDenied:
    'Acceso denegado. Si creés que es un error, contactá a soporte.',
  Verification:
    'El enlace de verificación expiró o ya se usó. Solicitá uno nuevo.',
  Configuration:
    'Hay un problema con la configuración del servidor. Intentá más tarde.',
};

const GENERIC_MESSAGE = 'No pudimos iniciar sesión. Intentá de nuevo.';

export function mapAuthErrorToMessage(code: string | null | undefined): string {
  if (!code) return GENERIC_MESSAGE;
  return KNOWN_MESSAGES[code] ?? GENERIC_MESSAGE;
}
