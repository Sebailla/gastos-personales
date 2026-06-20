/**
 * FxRateProviderStub — configurable test fake for the
 * `FxRateProvider` port.
 *
 * Used by application action tests (T-B6) to inject a
 * predictable FX result (success / FX_UNAVAILABLE /
 * FX_NOT_SUPPORTED) without depending on the
 * unconfigured stub or a real provider.
 *
 * Default mode is "success" with a stable conversion
 * (USD 100000 -> EUR 92000 at rate 0.92). Callers can
 * switch the mode at any time before invoking
 * `getDisplayAmount`.
 *
 * Per the design: this file lives in `infrastructure/external/`
 * (not `__fakes__/`) so the import path matches the port
 * adapter pattern. The port lives in `domain/interfaces/`.
 */

import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
} from '../../domain/interfaces/fx-rate-provider.port';

export type FxStubMode = 'success' | 'unavailable' | 'not-supported';

export class FxRateProviderStub implements FxRateProvider {
  private mode: FxStubMode = 'success';
  private successResult: FxConversionResult | null = null;

  setMode(mode: FxStubMode): void {
    this.mode = mode;
  }

  setSuccessResult(result: FxConversionResult): void {
    this.successResult = result;
  }

  async getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult> {
    if (this.mode === 'unavailable') {
      throw new AppError({
        code: ErrorCode.FX_UNAVAILABLE,
        message: 'Stub: FX provider unavailable.',
      });
    }
    if (this.mode === 'not-supported') {
      throw new AppError({
        code: ErrorCode.FX_NOT_SUPPORTED,
        message: 'Stub: FX pair not supported.',
      });
    }
    if (this.successResult) return this.successResult;
    // Default success: native unchanged, display = 0.92 * native, fxAsOf = now.
    return {
      native: request.native,
      display: {
        amount: Math.round(request.native.amount * 0.92),
        currency: request.displayCurrency,
        fxRate: 0.92,
        fxAsOf: new Date(),
      },
    };
  }
}
