/**
 * updateAccountAction — `PATCH /api/accounts/:id`.
 *
 * Validates the partial body, calls
 * `AccountService.update`. Cross-user or non-existent
 * rows return 404 via the service.
 */

import type { AccountActionDeps, ActionResult } from './_shared';
import type { FinancialAccount } from '../../domain/entities/financial-account';
import type { UpdateFinancialAccountPatch } from '../../domain/interfaces/account.repository.port';
import { accountUpdateSchema } from '../validation/account-update.schema';
import { zodErrorToActionError } from './_shared';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

export async function updateAccountAction(
  deps: AccountActionDeps,
  userId: string,
  id: string,
  rawBody: unknown,
): Promise<ActionResult<FinancialAccount>> {
  const parsed = accountUpdateSchema.safeParse(rawBody);
  if (!parsed.success) return zodErrorToActionError(parsed.error);
  const patch = toPatch(parsed.data);
  try {
    const row = await deps.accountService.update(userId, id, patch);
    return { ok: true, data: row };
  } catch (err) {
    if (err instanceof AppError && err.code === ErrorCode.NOT_FOUND) {
      return {
        ok: false,
        status: 404,
        error: { code: ErrorCode.NOT_FOUND, message: err.message },
      };
    }
    throw err;
  }
}

function toPatch(
  body: import('../validation/account-update.schema').AccountUpdateInput,
): UpdateFinancialAccountPatch {
  const patch: UpdateFinancialAccountPatch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.openingBalance !== undefined) {
    if (body.openingBalance.amountMinor !== undefined) {
      patch.openingBalanceMinor = body.openingBalance.amountMinor;
    }
    if (body.openingBalance.mode !== undefined) {
      patch.openingBalanceMode = body.openingBalance.mode;
    }
    if (body.openingBalance.date !== undefined) {
      patch.openingBalanceDate = body.openingBalance.date ?? null;
    }
  }
  if (body.type === 'BANK') {
    if (body.bankName !== undefined) patch.bankName = body.bankName;
    if (body.accountKind !== undefined) patch.accountKind = body.accountKind;
  } else if (body.type === 'CREDIT') {
    if (body.issuer !== undefined) patch.issuer = body.issuer;
    if (body.creditLimitMinor !== undefined) patch.creditLimitMinor = body.creditLimitMinor;
    if (body.statementDay !== undefined) patch.statementDay = body.statementDay;
    if (body.paymentDueDay !== undefined) patch.paymentDueDay = body.paymentDueDay;
  } else if (body.type === 'INVESTMENT') {
    if (body.broker !== undefined) patch.broker = body.broker;
    if (body.investmentType !== undefined) patch.investmentType = body.investmentType;
  } else if (body.type === 'CRYPTO') {
    if (body.walletAddress !== undefined) patch.walletAddress = body.walletAddress;
  }
  return patch;
}
