/**
 * FxRateProviderUnconfigured — in-change FX stub.
 *
 * Always throws `AppError(FX_UNAVAILABLE)`. This is the
 * default in `buildDefaultDeps()` until the `fx-cache`
 * change provides a real implementation. The smoke UI
 * surfaces the resulting 503 with the inline error
 * "FX rate provider unavailable. Try again in a few
 * minutes." (BR-ACC-18).
 *
 * Per the design: the implementation file lives in
 * `infrastructure/external/` (not `domain/`) because it
 * depends on the shared `AppError` infrastructure. The
 * interface it implements lives in `domain/interfaces/`.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
} from '../../domain/interfaces/fx-rate-provider.port';

export class FxRateProviderUnconfigured implements FxRateProvider {
  async getDisplayAmount(_request: FxConversionRequest): Promise<FxConversionResult> {
    throw new AppError({
      code: ErrorCode.FX_UNAVAILABLE,
      message:
        'FX rate provider is not configured. The fx-cache capability has not landed yet.',
    });
  }
}
