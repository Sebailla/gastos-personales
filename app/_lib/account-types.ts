// smoke-minimal, not production
/**
 * Wire types for the accounts UI smoke slice.
 *
 * These types mirror the response shapes from the Hono API
 * (the DTOs in `src/modules/accounts/application/dto/`) and
 * exist so the UI does not reach into the module's internal
 * DTO paths (architecture-standards rule: the UI imports ONLY
 * from the module barrel `src/modules/accounts/index.ts`,
 * which does not currently re-export the DTOs).
 *
 * If the DTOs are ever re-exported from the barrel, these
 * local types can be replaced by the barrel exports.
 *
 * Field shapes are kept in sync with the DTOs
 * (`financial-account.dto.ts` and
 * `financial-account-balance.dto.ts`) by hand. Drift would
 * surface as a `pnpm run typecheck` failure on the consumer
 * (the typed Hono client + the Zod schemas in
 * `src/modules/accounts/application/validation/`).
 */

export interface FinancialAccountWire {
  id: string;
  userId: string;
  type: string;
  name: string;
  currency: string;
  openingBalanceMinor: number;
  openingBalanceMode: string;
  openingBalanceDate: string | null;
  archivedAt: string | null;
  bankName: string | null;
  accountKind: string | null;
  issuer: string | null;
  creditLimitMinor: number | null;
  statementDay: number | null;
  paymentDueDay: number | null;
  broker: string | null;
  investmentType: string | null;
  walletAddress: string | null;
  createdAt: string;
  updatedAt: string;
  // Slice 2 BR-UI-1: present ONLY when the API was called
  // with `?include=lastActivity`. The field is OPTIONAL on the
  // wire (the flag is additive; without it, this field is
  // undefined). The `AccountsListTable` consumer passes
  // `lastActivityIncluded={true}` to opt the column in.
  lastActivityAt?: string | null;
}

export interface FinancialAccountBalanceWire {
  native: { amount: number; currency: string };
  display: { amount: number; currency: string; fxRate: number; fxAsOf: string };
  // PR-3 T3.8: `stale: true` drives the amber chip in
  // `app/accounts/[id]/balance-widget.tsx`. The widget
  // also reads `display.fxAsOf` to compute the minutes
  // elapsed since the rate was published.
  stale: boolean;
  warnings?: string[];
}

export interface AccountsListResponse {
  data: FinancialAccountWire[];
  nextCursor: string | null;
  total: number;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
