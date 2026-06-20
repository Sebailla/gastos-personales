/**
 * Domain service: AccountService.
 *
 * Pure business logic for the `accounts` capability. Depends
 * on the two ports (`AccountRepositoryPort` and
 * `FxRateProvider`) — does NOT know about Prisma, Hono, Zod,
 * or the Auth.js session.
 *
 * The service is the boundary between business rules and
 * infrastructure. The application layer (`actions/`) is a
 * thin wrapper that reads the session, calls the service,
 * and maps the result to an HTTP response.
 *
 * Per `accounts-ledger` design §2, this PR-A delivers the
 * skeleton: every public method exists and delegates to the
 * port, but the business rules (uniqueness enforcement,
 * cross-user guard, archive lifecycle) are in their minimal
 * form. PR-B adds the Prisma adapter (which implements the
 * P2002 → NAME_TAKEN translation) and the Hono routes (which
 * add the `requireSession` middleware).
 *
 * All methods are `async` to match the port contract; they
 * do not perform any I/O themselves. Pure orchestration.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type { Clock } from '@/shared/clock/clock.port';
import type {
  AccountRepositoryPort,
  CreateFinancialAccountInput,
  ListAccountsOptions,
  ListAccountsPage,
  UpdateFinancialAccountPatch,
} from '../interfaces/account.repository.port';
import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
} from '../interfaces/fx-rate-provider.port';
import type { AccountCurrency, FinancialAccount } from '../entities/financial-account';

export class AccountService {
  constructor(
    private readonly repo: AccountRepositoryPort,
    private readonly fx: FxRateProvider,
    private readonly clock: Clock,
  ) {}

  async list(userId: string, opts: ListAccountsOptions): Promise<ListAccountsPage> {
    return this.repo.list(userId, opts);
  }

  // F-12: accept the same `ListAccountsOptions` shape as
  // `list` so callers can build the filter once and pass
  // it to both. `limit` and `cursor` are ignored by the
  // repository's count query (count has no pagination);
  // `archivedAt` is the only meaningful filter for count.
  async count(userId: string, opts: ListAccountsOptions = { limit: 0 }): Promise<number> {
    const { archivedAt } = opts;
    return this.repo.count(userId, archivedAt !== undefined ? { archivedAt } : {});
  }

  async getById(userId: string, id: string): Promise<FinancialAccount> {
    const row = await this.repo.findById(userId, id);
    if (row === null) {
      // Cross-user access is indistinguishable from a miss (BR-AUTH-1).
      throw new AppError({
        code: ErrorCode.NOT_FOUND,
        message: 'Account not found or no access.',
      });
    }
    return row;
  }

  async create(userId: string, input: CreateFinancialAccountInput): Promise<FinancialAccount> {
    // The Prisma adapter (PR-B) translates the P2002 unique-violation
    // on (userId, type, name) into AppError(NAME_TAKEN). The domain
    // service has no opinion on uniqueness beyond calling the port.
    return this.repo.create(userId, input);
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateFinancialAccountPatch,
  ): Promise<FinancialAccount> {
    const row = await this.repo.update(userId, id, patch);
    if (row === null) {
      throw new AppError({
        code: ErrorCode.NOT_FOUND,
        message: 'Account not found or no access.',
      });
    }
    return row;
  }

  async archive(userId: string, id: string): Promise<FinancialAccount> {
    const row = await this.repo.archive(userId, id, this.clock);
    if (row === null) {
      throw new AppError({
        code: ErrorCode.NOT_FOUND,
        message: 'Account not found or no access.',
      });
    }
    return row;
  }

  async unarchive(userId: string, id: string): Promise<FinancialAccount> {
    const row = await this.repo.unarchive(userId, id);
    if (row === null) {
      throw new AppError({
        code: ErrorCode.NOT_FOUND,
        message: 'Account not found or no access.',
      });
    }
    return row;
  }

  /**
   * Display-only FX conversion. The native balance is read from
   * the repository and passed to the FX provider; the native value
   * is never mutated (BR-ACC-12). The provider is responsible for
   * short-circuiting when `native.currency === displayCurrency`.
   */
  async getBalance(
    userId: string,
    id: string,
    displayCurrency: AccountCurrency,
  ): Promise<FxConversionResult> {
    const account = await this.getById(userId, id);
    const req: FxConversionRequest = {
      native: {
        amount: account.openingBalanceMinor,
        currency: account.currency,
      },
      displayCurrency,
      asOf: this.clock.now(),
    };
    return this.fx.getDisplayAmount(req);
  }
}
