import { z } from 'zod';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import { fxCasaStringSchema, type FxCasaString } from '../../domain/entities/fx-casa-string.schema';
import type { DolarApiPort } from '../../domain/ports/dolar-api.port';

/**
 * DolarAPI wire schema. The upstream returns Spanish-cased
 * strings and a `fechaActualizacion` ISO timestamp; the
 * mapping below normalises both to the internal `FxQuote`
 * shape (lowercase casa, buy/sell instead of compra/venta).
 *
 * The casa field is constrained by `fxCasaStringSchema` so a
 * wire-shape drift at the upstream (e.g. a typo'd casa) is
 * rejected at the parse boundary, not silently passed through.
 */
const dolarApiWireSchema = z.object({
  moneda: z.string(),
  casa: fxCasaStringSchema,
  nombre: z.string(),
  compra: z.number().positive(),
  venta: z.number().positive(),
  fechaActualizacion: z.string().datetime(),
});

/**
 * HTTP timeout for every DolarAPI request. 3 s matches the
 * design §6.3 budget (the upstream is a free public API; a
 * slow response is a degraded cache-miss path, not a
 * caller-blocking outage).
 */
const DOLAR_API_TIMEOUT_MS = 3_000;

/**
 * Default DolarAPI base URL. Overridable via
 * `process.env.DOLAR_API_BASE_URL` for tests and for pointing
 * at a local stub or a private mirror.
 */
const DEFAULT_BASE_URL = 'https://dolarapi.com/v1';

export interface DolarApiClientDeps {
  /**
   * Injected `fetch` for tests. Production code uses the
   * global `fetch` (Node 20 native).
   */
  fetch?: typeof fetch;
  /**
   * Injected env for tests. Production code reads from
   * `process.env`.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * DolarAPI HTTP client. Implements `DolarApiPort`.
 *
 * Every failure mode (non-2xx, timeout, malformed payload,
 * Zod parse failure) is collapsed to `AppError(FX_UNAVAILABLE)`
 * with a 503 status. The application layer translates that to
 * the HTTP response; the client never crafts a response.
 */
export class DolarApiClient implements DolarApiPort {
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;

  constructor(deps: DolarApiClientDeps = {}) {
    this.fetchImpl = deps.fetch ?? fetch;
    this.env = deps.env ?? process.env;
  }

  async getDolares(casa: FxCasaString): Promise<{
    casa: FxCasaString;
    buy: number;
    sell: number;
    fxAsOf: string;
  }> {
    const baseUrl = this.env.DOLAR_API_BASE_URL ?? DEFAULT_BASE_URL;
    // Defense-in-depth: the port type already enforces the
    // lowercase form via `fxCasaStringSchema`, but the URL
    // builder goes through toLowerCase() to survive any path
    // that bypasses the type (e.g. a future JSON-driven flow
    // that does not route through the schema).
    const segment = casa.toLowerCase();
    const url = `${baseUrl}/dolares/${segment}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOLAR_API_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'gastos-personales/0.1.0 (https://github.com/Sebailla/gastos-personales)',
        },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      // AbortError (timeout) and any network error collapse to
      // the same FX_UNAVAILABLE — the caller does not need to
      // distinguish a timeout from a DNS failure from a
      // connection-refused. The status code is the same.
      throw new AppError({
        code: ErrorCode.FX_UNAVAILABLE,
        message: 'DolarAPI request failed',
        cause: error,
      });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new AppError({
        code: ErrorCode.FX_UNAVAILABLE,
        message: `DolarAPI responded with HTTP ${response.status}`,
        details: { status: response.status },
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new AppError({
        code: ErrorCode.FX_UNAVAILABLE,
        message: 'DolarAPI response body was not valid JSON',
        cause: error,
      });
    }

    const parsed = dolarApiWireSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError({
        code: ErrorCode.FX_UNAVAILABLE,
        message: 'DolarAPI response did not match the expected wire shape',
        details: parsed.error.issues,
      });
    }

    return {
      casa: parsed.data.casa,
      buy: parsed.data.compra,
      sell: parsed.data.venta,
      fxAsOf: parsed.data.fechaActualizacion,
    };
  }
}
