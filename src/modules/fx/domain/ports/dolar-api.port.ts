import type { FxCasaString } from '../entities/fx-casa-string.schema';
import type { FxQuote } from '../entities/fx-quote';

/**
 * Port: DolarAPI upstream.
 *
 * The `DolarApiClient` infrastructure adapter implements this
 * port. It speaks to `GET ${baseUrl}/dolares/<casa>` and
 * returns a normalised `FxQuote` (casa, buy, sell, fxAsOf).
 *
 * Throws `AppError(FX_UNAVAILABLE)` for every failure mode
 * (non-2xx, malformed payload, timeout, Zod parse failure).
 * The application layer translates that to a 503.
 */
export interface DolarApiPort {
  getDolares(casa: FxCasaString): Promise<FxQuote>;
}
