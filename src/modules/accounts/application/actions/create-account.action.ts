/**
 * createAccountAction — `POST /api/accounts`.
 *
 * Validates the body against the discriminated union. On
 * success, calls `AccountService.create`, which delegates
 * to the Prisma repository. The Prisma adapter translates
 * the `P2002` unique-violation on `(userId, type, name)`
 * to `AppError(NAME_TAKEN)`, surfaced as 409.
 *
 * Per BR-ACC-16 / Decision 7: `openingBalanceMinor >= 0`
 * is enforced by the Zod schema; the action does not
 * re-validate.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { CreateFinancialAccountInput } from '../../domain/interfaces/account.repository.port';
import type { FinancialAccount } from '../../domain/entities/financial-account';
import { accountCreateSchema } from '../validation/account-create.schema';
import { zodErrorToActionError, appErrorToActionError } from './_shared';
import { AppError } from '@/shared/errors/app-error';

export async function createAccountAction(
  deps: AccountActionDeps,
  userId: string,
  rawBody: unknown,
): Promise<ActionResult<FinancialAccount>> {
  const parsed = accountCreateSchema.safeParse(rawBody);
  if (!parsed.success) return zodErrorToActionError(parsed.error);

  const input = toCreateInput(parsed.data);
  try {
    const row = await deps.accountService.create(userId, input);
    return { ok: true, data: row };
  } catch (err) {
    if (err instanceof AppError) return appErrorToActionError(err);
    throw err;
  }
}

function toCreateInput(
  body: import('../validation/account-create.schema').AccountCreateInput,
): CreateFinancialAccountInput {
  return {
    type: body.type,
    name: body.name,
    currency: body.currency,
    openingBalanceMinor: body.openingBalance.amountMinor ?? 0,
    openingBalanceMode: body.openingBalance.mode,
    openingBalanceDate: body.openingBalance.date ?? null,
    bankName: body.type === 'BANK' ? body.bankName : null,
    accountKind: body.type === 'BANK' ? body.accountKind : null,
    issuer: body.type === 'CREDIT' ? body.issuer : null,
    creditLimitMinor: body.type === 'CREDIT' ? body.creditLimitMinor ?? null : null,
    statementDay: body.type === 'CREDIT' ? body.statementDay : null,
    paymentDueDay: body.type === 'CREDIT' ? body.paymentDueDay : null,
    broker: body.type === 'INVESTMENT' ? body.broker : null,
    investmentType: body.type === 'INVESTMENT' ? body.investmentType : null,
    walletAddress: body.type === 'CRYPTO' ? body.walletAddress ?? null : null,
    // fx-cache PR-2 T2.4 — REQ-FX-9. Forward the casa
    // (optional nullable). `undefined` from the Zod parse maps
    // to "do not write the column" in the repository (T2.7
    // conditional spread); `null` maps to `casa = NULL`.
    casa: body.casa,
  };
}
