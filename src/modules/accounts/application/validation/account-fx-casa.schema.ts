/**
 * Zod schema for the per-account `casa` field on the
 * Prisma-boundary of the accounts module.
 *
 * Scope: validates the wire shape on `POST /api/accounts` and
 * `PATCH /api/accounts/:id`. Accepts the **UPPERCASE** Prisma
 * form (matching `AccountFxCasa` in `prisma/schema.prisma` and
 * the `AccountFxCasa` mirror in
 * `src/modules/accounts/domain/entities/financial-account.ts`).
 *
 * Why UPPERCASE here:
 * - The accounts module's contract with Prisma is the
 *   `AccountFxCasa` enum (UPPERCASE). Validating at this
 *   boundary keeps the Prisma write honest: a typo in the API
 *   body fails the Zod parse, not the SQL `INSERT`.
 * - The DolarAPI wire format is lowercase (`/dolares/oficial`).
 *   That lives at
 *   `src/modules/fx/domain/entities/fx-casa-string.schema.ts`
 *   and is consumed by the FX provider. This schema does NOT
 *   accept the lowercase form; the application layer is free
 *   to normalise lowercase → UPPERCASE if it ever receives a
 *   lowercase wire value (PR-3 wires the action-layer
 *   resolution; today the smoke UI sends UPPERCASE).
 *
 * Adding a new casa is a multi-file change: append it to this
 * tuple, to the `AccountFxCasa` Prisma enum, and to the
 * create-account form's `<select>`. The Zod enum will reject
 * every other value.
 */
import { z } from 'zod';
import { AccountFxCasa } from '../../domain/entities/financial-account';

export const accountFxCasaSchema = z.enum([
  AccountFxCasa.OFICIAL,
  AccountFxCasa.BLUE,
  AccountFxCasa.MEP,
  AccountFxCasa.CCL,
  AccountFxCasa.CRIPTO,
  AccountFxCasa.TARJETA,
]);
