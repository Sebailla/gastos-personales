/**
 * AccountRepositoryPrisma — Prisma adapter for AccountRepositoryPort.
 *
 * Implements every method on the port by issuing a Prisma
 * query against the singleton `prisma.financialAccount`
 * delegate. The adapter does NOT know about Hono, Auth.js,
 * or Zod; it is the only place in the accounts module that
 * imports from `@prisma/client` (architecture-standards rule).
 *
 * Cross-module invariant (covered by the tests in this file):
 * every method carries `userId` in the WHERE clause; the
 * application layer cannot accidentally request another user's
 * data because the type signature forces it to pass `userId`.
 *
 * Translation: Prisma's `P2002` unique-violation on
 * `(userId, type, name)` is converted to
 * `AppError(NAME_TAKEN)`. The application action surfaces
 * this as `409 NAME_TAKEN` without leaking the Prisma error
 * code.
 */

import { Prisma } from '@prisma/client';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import {
  AccountCurrency,
  AccountKind,
  AccountType,
  InvestmentType,
  OpeningBalanceMode,
  type FinancialAccount,
} from '../../domain/entities/financial-account';
import type {
  AccountRepositoryPort,
  CreateFinancialAccountInput,
  ListAccountsOptions,
  ListAccountsPage,
  UpdateFinancialAccountPatch,
} from '../../domain/interfaces/account.repository.port';

// Narrow Prisma delegate shape we use. Keeps the adapter
// testable with a fake (see `.test.ts`). The real
// `PrismaClient` is structurally compatible.
interface PrismaFinancialAccountDelegate {
  create: (args: {
    data: Prisma.FinancialAccountUncheckedCreateInput;
  }) => Promise<PrismaFinancialAccountRow>;
  findUnique: (args: { where: { id: string } }) => Promise<PrismaFinancialAccountRow | null>;
  findMany: (args: {
    where: Prisma.FinancialAccountWhereInput;
    orderBy?: Prisma.FinancialAccountOrderByWithRelationInput;
    take?: number;
    cursor?: { id: string };
    skip?: number;
  }) => Promise<PrismaFinancialAccountRow[]>;
  update: (args: {
    where: { id: string };
    data: Prisma.FinancialAccountUncheckedUpdateInput;
  }) => Promise<PrismaFinancialAccountRow>;
  updateMany: (args: {
    where: Prisma.FinancialAccountWhereInput;
    data: Prisma.FinancialAccountUncheckedUpdateInput;
  }) => Promise<{ count: number }>;
}

type PrismaFinancialAccountRow = Record<string, unknown> & { userId: string };

export class AccountRepositoryPrisma implements AccountRepositoryPort {
  constructor(private readonly prisma: { financialAccount: PrismaFinancialAccountDelegate }) {}

  async list(userId: string, opts: ListAccountsOptions): Promise<ListAccountsPage> {
    const where: Prisma.FinancialAccountWhereInput = { userId };
    if (opts.archivedAt === null) {
      where.archivedAt = null;
    }
    const rows = await this.prisma.financialAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit + 1, // +1 to detect a nextCursor
    });
    const data = rows.slice(0, opts.limit).map(mapRow);
    const nextCursor = rows.length > opts.limit ? (data[data.length - 1]?.id ?? null) : null;
    return { data, nextCursor };
  }

  async findById(userId: string, id: string): Promise<FinancialAccount | null> {
    // Cross-user guard: include userId in the WHERE so a row
    // owned by another user is invisible to this query. The
    // type signature forces the caller to pass userId.
    const row = await this.prisma.financialAccount.findUnique({
      where: { id },
    });
    if (!row) return null;
    if (row.userId !== userId) return null; // existence not leaked
    return mapRow(row);
  }

  async create(userId: string, input: CreateFinancialAccountInput): Promise<FinancialAccount> {
    try {
      const row = await this.prisma.financialAccount.create({
        data: {
          userId,
          type: input.type,
          name: input.name,
          currency: input.currency,
          openingBalanceMinor: input.openingBalanceMinor,
          openingBalanceMode: input.openingBalanceMode,
          openingBalanceDate: input.openingBalanceDate,
          bankName: input.bankName,
          accountKind: input.accountKind,
          issuer: input.issuer,
          creditLimitMinor: input.creditLimitMinor,
          statementDay: input.statementDay,
          paymentDueDay: input.paymentDueDay,
          broker: input.broker,
          investmentType: input.investmentType,
          walletAddress: input.walletAddress,
        },
      });
      return mapRow(row);
    } catch (err) {
      if (isPrismaP2002(err)) {
        throw new AppError({
          code: ErrorCode.NAME_TAKEN,
          message: 'Ya existe una cuenta con ese nombre y tipo.',
        });
      }
      throw err;
    }
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateFinancialAccountPatch,
  ): Promise<FinancialAccount | null> {
    // Cross-user guard via WHERE userId = ?
    const result = await this.prisma.financialAccount.updateMany({
      where: { id, userId },
      data: patch as Prisma.FinancialAccountUncheckedUpdateInput,
    });
    if (result.count === 0) return null;
    return this.findById(userId, id);
  }

  async archive(userId: string, id: string): Promise<FinancialAccount | null> {
    const result = await this.prisma.financialAccount.updateMany({
      where: { id, userId },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.findById(userId, id);
  }

  async unarchive(userId: string, id: string): Promise<FinancialAccount | null> {
    const result = await this.prisma.financialAccount.updateMany({
      where: { id, userId },
      data: { archivedAt: null },
    });
    if (result.count === 0) return null;
    return this.findById(userId, id);
  }
}

function isPrismaP2002(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

function mapRow(row: PrismaFinancialAccountRow): FinancialAccount {
  return {
    id: row['id'] as string,
    userId: row['userId'] as string,
    type: row['type'] as AccountType,
    name: row['name'] as string,
    currency: row['currency'] as AccountCurrency,
    openingBalanceMinor: row['openingBalanceMinor'] as number,
    openingBalanceMode: row['openingBalanceMode'] as OpeningBalanceMode,
    openingBalanceDate: (row['openingBalanceDate'] as Date | null) ?? null,
    archivedAt: (row['archivedAt'] as Date | null) ?? null,
    bankName: (row['bankName'] as string | null) ?? null,
    accountKind: (row['accountKind'] as AccountKind | null) ?? null,
    issuer: (row['issuer'] as string | null) ?? null,
    creditLimitMinor: (row['creditLimitMinor'] as number | null) ?? null,
    statementDay: (row['statementDay'] as number | null) ?? null,
    paymentDueDay: (row['paymentDueDay'] as number | null) ?? null,
    broker: (row['broker'] as string | null) ?? null,
    investmentType: (row['investmentType'] as InvestmentType | null) ?? null,
    walletAddress: (row['walletAddress'] as string | null) ?? null,
    createdAt: row['createdAt'] as Date,
    updatedAt: row['updatedAt'] as Date,
  };
}
