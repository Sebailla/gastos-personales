import { z } from 'zod';
import { fxCasaStringSchema, type FxCasaString } from './fx-casa-string.schema';

/**
 * `FxQuote` — a single point-in-time foreign-exchange quote
 * for one casa (e.g. `oficial`, `blue`). Pure value object.
 *
 * Invariants (enforced by `fxQuoteSchema`):
 * - `casa` is one of the six DolarAPI casas (lowercase).
 * - `buy` and `sell` are strictly positive (a zero or negative
 *   quote would be malformed; DolarAPI never returns one).
 * - `fxAsOf` is an ISO-8601 timestamp in the past (a future
 *   quote cannot exist; rejecting it surfaces a clock skew or
 *   upstream bug at the boundary).
 *
 * The schema is the single source of truth: the DolarAPI client
 * parses the wire shape with `fxQuoteSchema`, the cache layer
 * serialises entries with `JSON.stringify(fxQuoteSchema.parse(...))`,
 * and the provider constructs `FxQuote` instances from cached or
 * fresh fetches by passing through the schema.
 */
export const fxQuoteSchema = z
  .object({
    casa: fxCasaStringSchema,
    buy: z.number().positive(),
    sell: z.number().positive(),
    fxAsOf: z
      .string()
      .datetime({ message: 'fxAsOf must be an ISO-8601 timestamp' })
      .refine((iso) => new Date(iso).getTime() <= Date.now(), {
        message: 'fxAsOf cannot be in the future',
      }),
  })
  .strict();

export type FxQuote = z.infer<typeof fxQuoteSchema>;

export type { FxCasaString };

/**
 * Runtime type-guard. Cheap re-parse; use only at the
 * application boundary (e.g. reading a JSON payload from an
 * untrusted source). Inside the module, the schema's return
 * type is the guarantee.
 */
export function isFxQuote(value: unknown): value is FxQuote {
  return fxQuoteSchema.safeParse(value).success;
}
