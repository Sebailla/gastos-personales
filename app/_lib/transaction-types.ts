// smoke-minimal, not production
/**
 * Wire types for the transactions UI smoke slice.
 *
 * Mirrors the response shapes from the Hono API
 * (the DTOs in `src/modules/transactions/application/dto/`).
 * Hand-maintained in lock-step with the slice-3 DTO mapper
 * (`toTransactionDto`); drift surfaces as a typecheck failure
 * on the consumer (the Server Component + the Zod schemas in
 * `src/modules/transactions/application/validation/`).
 *
 * Why local types vs. importing from the barrel: the
 * transactions module does NOT re-export its DTOs from
 * `src/modules/transactions/` (no barrel exists yet — slice 3
 * ships the application surface but the barrel addition was
 * de-scoped). The UI imports ONLY from the application barrel
 * pattern (`@/modules/transactions/application/...`) for
 * symbols not exposed in the wire types — but the DTOs are
 * internal types the UI re-declares here to keep the import
 * graph one-way (architecture-standards rule).
 */

export interface TransactionWire {
  id: string;
  userId: string;
  accountId: string;
  direction: string;
  amountMinor: number;
  currency: string;
  memo: string | null;
  category: string | null;
  transactionDate: string;
  convertedAmountMinor: number;
  convertedCurrency: string;
  fxAsOfSnapshot: string | null;
  casaSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
  // Slice 3 BR-UI-2: present ONLY when the API was called
  // with `?include=accountName`. The field is OPTIONAL on the
  // wire (the flag is additive; without it, this field is
  // undefined). The `TransactionsListTable` consumer passes
  // `accountNameIncluded={true}` to opt the column in.
  accountName?: string;
}

export interface TransactionsListResponse {
  data: TransactionWire[];
  nextCursor: string | null;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
