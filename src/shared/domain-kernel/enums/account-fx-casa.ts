/**
 * Domain enum: `AccountFxCasa`.
 *
 * Structural source of truth for the FX casa codes used
 * across modules. Lifted from the slice-1 transactions
 * domain where it was a local mirror. The Prisma
 * `AccountFxCasa` enum (added by fx-cache PR-A) carries the
 * same UPPERCASE values per Prisma convention. The DolarAPI
 * wire format is lowercase — the slice-2 `convertAndSnapshot`
 * helper maps between the two via the `FxCasaString` type.
 *
 * Adding a casa requires updating the Prisma enum, the FX
 * module's DolarAPI client, and the `FxCasaString` mapping in
 * `src/shared/domain-kernel/ports/fx-rate-provider.port.ts`.
 */

export const AccountFxCasa = {
  OFICIAL: 'OFICIAL',
  BLUE: 'BLUE',
  MEP: 'MEP',
  CCL: 'CCL',
  CRIPTO: 'CRIPTO',
  TARJETA: 'TARJETA',
} as const;

export type AccountFxCasa = (typeof AccountFxCasa)[keyof typeof AccountFxCasa];
