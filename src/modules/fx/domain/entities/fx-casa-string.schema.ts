import { z } from 'zod';

/**
 * Lowercase DolarAPI casa names. The DolarAPI wire format uses
 * lowercase (`/dolares/oficial`), the Prisma `AccountFxCasa`
 * enum uses uppercase per Prisma convention, and the env var
 * `FX_DEFAULT_CASA` accepts either form but is normalised to
 * lowercase before being persisted or used as a URL segment.
 *
 * This Zod schema is the SINGLE SOURCE OF TRUTH for the
 * lowercase form. It is consumed by:
 *   - `fxQuoteSchema` (casa field constraint)
 *   - the env schema (`FX_DEFAULT_CASA` validation)
 *   - the DolarAPI client (URL segment + Zod parse of the
 *     wire response's `casa` field)
 *   - the cache key encoding (`gastos-personales:fx:v1:<casa>`)
 *
 * Adding a new casa is a multi-file change: add it to this
 * tuple, to `prisma/schema.prisma`'s `AccountFxCasa` enum, and
 * to the create-account form's `<select>`. The Zod enum will
 * reject every other lowercase value.
 */
export const FX_CASAS = ['oficial', 'blue', 'mep', 'ccl', 'cripto', 'tarjeta'] as const;

export const fxCasaStringSchema = z.enum(FX_CASAS);

export type FxCasaString = (typeof FX_CASAS)[number];
