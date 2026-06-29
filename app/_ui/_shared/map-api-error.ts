/**
 * mapApiErrorToFieldError — pure function mapping a server-side
 * ErrorEnvelope to a per-field error map consumed by FormField's
 * `error` prop.
 *
 * Per design §6.5 / BR-UI-5: the first error message from the
 * API is rendered next to the offending field with
 * aria-describedby. The mapping is a pure function so it's
 * trivially testable and never reaches into React state.
 *
 * Wire codes consumed:
 * - INVALID_AMOUNT          -> amountMinor
 * - FUTURE_DATE_NOT_ALLOWED -> transactionDate
 * - ACCOUNT_ARCHIVED        -> accountId
 * - VALIDATION_ERROR        -> error.details[0].path
 * - (other)                 -> first field in fieldNames
 */

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ReadonlyArray<{ path?: string; message?: string }>;
  };
}

export type FieldErrorMap = Record<string, string>;

export function mapApiErrorToFieldError(
  envelope: ApiErrorEnvelope,
  fieldNames: ReadonlyArray<string>,
): FieldErrorMap {
  const { code, message, details } = envelope.error;
  const firstField = fieldNames[0];
  if (!firstField) return {};

  const fieldByCode: Record<string, string | undefined> = {
    INVALID_AMOUNT: 'amountMinor',
    FUTURE_DATE_NOT_ALLOWED: 'transactionDate',
    ACCOUNT_ARCHIVED: 'accountId',
  };

  if (code === 'VALIDATION_ERROR' && details && details[0]?.path) {
    return { [details[0].path]: details[0].message ?? message };
  }

  const target = fieldByCode[code] ?? firstField;
  return { [target]: message };
}
