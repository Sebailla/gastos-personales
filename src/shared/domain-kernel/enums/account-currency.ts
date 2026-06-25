/**
 * Domain enum: `AccountCurrency`.
 *
 * Structural source of truth for the currency codes used
 * across modules. Lifted from the slice-1 transactions
 * domain where it was a local mirror. The `accounts` module
 * continues to expose its own `AccountCurrency` re-export
 * from its barrel for backward compatibility; consumers that
 * do not depend on `accounts` (e.g. `transactions` domain)
 * import from `@/shared/domain-kernel` directly.
 *
 * BR-FX-2 / BR-FX-6: the FX-snapshot path uses this enum to
 * decide native=casa skip. Adding a currency requires updating
 * the Prisma `AccountCurrency` enum, the slice-1 `transactions`
 * aggregate, and the FX module's DolarAPI client — see
 * `openspec/specs/fx/spec.md` for the FX-snapshot invariant.
 */

export const AccountCurrency = {
  ARS: 'ARS',
  USD: 'USD',
  EUR: 'EUR',
} as const;

export type AccountCurrency = (typeof AccountCurrency)[keyof typeof AccountCurrency];
