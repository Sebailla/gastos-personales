/**
 * registerAction — application-layer entry point for
 * `POST /api/auth/register`.
 *
 * The action is a thin Zod-validating wrapper around
 * `AuthService.register`. The Hono route in
 * `src/modules/api/app.ts` calls this action; the action
 * returns a typed envelope that maps directly to the HTTP
 * response shape from the `api-design` skill.
 *
 * Response shape:
 *   - 201 `{ data: PublicUser }` on success.
 *   - 400 `{ error: { code: VALIDATION_ERROR, message, details } }`
 *     on Zod failure.
 *   - 400 `{ error: { code: WEAK_PASSWORD, message } }` on
 *     password too short.
 *   - 409 `{ error: { code: EMAIL_TAKEN, message } }` on
 *     duplicate email (BR-AUTH-4 timing-equalized in
 *     AuthService).
 *
 * The action NEVER throws; every failure is mapped to the
 * error envelope. The `api-design` contract is honored.
 */

import type { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { PublicUserShape } from '@/modules/auth/domain/value-objects/public-user';
import { registerInputSchema } from '../dto/register.dto';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode, type ErrorCode as ErrorCodeType } from '@/shared/errors/error-codes';
import { logger } from '@/shared/logger/logger';

export type RegisterActionResult =
  | { status: 201; data: PublicUserShape }
  | { status: 400; error: { code: ErrorCodeType; message: string; details: unknown } }
  | { status: 400; error: { code: ErrorCodeType; message: string } }
  | { status: 409; error: { code: ErrorCodeType; message: string } }
  | { status: 500; error: { code: ErrorCodeType; message: string } };

export async function registerAction(
  authService: AuthService,
  rawInput: unknown,
): Promise<RegisterActionResult> {
  const parsed = registerInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    // Map BR-AUTH-2 (password < 10) to WEAK_PASSWORD so the
    // client gets the domain-specific code instead of a
    // generic VALIDATION_ERROR. Other Zod failures
    // (malformed email, missing fields) stay as
    // VALIDATION_ERROR with the issue list in `details`.
    const passwordIssue = parsed.error.issues.find((i) => i.path[0] === 'password');
    if (passwordIssue) {
      return {
        status: 400,
        error: {
          code: ErrorCode.WEAK_PASSWORD,
          message: 'La contraseña debe tener al menos 10 caracteres.',
        },
      };
    }
    return {
      status: 400,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Datos de registro inválidos.',
        details: parsed.error.issues,
      },
    };
  }

  try {
    const user = await authService.register(parsed.data);
    return { status: 201, data: user };
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === ErrorCode.WEAK_PASSWORD) {
        return { status: 400, error: { code: err.code, message: err.message } };
      }
      if (err.code === ErrorCode.EMAIL_TAKEN) {
        return { status: 409, error: { code: err.code, message: err.message } };
      }
      // Any other AppError from the domain layer is an
      // unexpected condition from the register path; log and
      // surface as INTERNAL_ERROR (per `error-handling` skill).
      // Accounts actions use the shared `appErrorToActionError`
      // helper instead; the register action keeps the collapse
      // because the auth surface deliberately does not echo
      // arbitrary AppError messages back to the client.
      logger.error('register_action_app_error', { code: err.code, message: err.message });
      return {
        status: 500,
        error: { code: ErrorCode.INTERNAL_ERROR, message: 'Ocurrió un error inesperado.' },
      };
    }
    logger.error('register_action_unexpected', {
      errorMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      status: 500,
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Ocurrió un error inesperado.' },
    };
  }
}
