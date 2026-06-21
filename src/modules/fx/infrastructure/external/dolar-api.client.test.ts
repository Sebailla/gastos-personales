import { describe, it, expect, vi, afterEach } from 'vitest';
import { DolarApiClient } from './dolar-api.client';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

describe('DolarApiClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('maps a 200 DolarAPI response to an FxQuote (sell = venta)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        casa: 'oficial',
        nombre: 'Oficial',
        compra: 1180,
        venta: 1220,
        fechaActualizacion: '2026-06-21T18:00:00.000Z',
      }),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    const quote = await client.getDolares('oficial');
    expect(quote).toEqual({
      casa: 'oficial',
      buy: 1180,
      sell: 1220,
      fxAsOf: '2026-06-21T18:00:00.000Z',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws AppError(FX_UNAVAILABLE) on a 500 response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(client.getDolares('oficial')).rejects.toBeInstanceOf(AppError);
    await expect(client.getDolares('oficial')).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
    });
  });

  it('throws AppError(FX_UNAVAILABLE) on a 200 with malformed payload (missing venta)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        casa: 'oficial',
        nombre: 'Oficial',
        compra: 1180,
        fechaActualizacion: '2026-06-21T18:00:00.000Z',
      }),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(client.getDolares('oficial')).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
    });
  });

  it('targets the URL from process.env.DOLAR_API_BASE_URL when set', async () => {
    vi.stubEnv('DOLAR_API_BASE_URL', 'http://localhost:9999');
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        casa: 'oficial',
        nombre: 'Oficial',
        compra: 1180,
        venta: 1220,
        fechaActualizacion: '2026-06-21T18:00:00.000Z',
      }),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await client.getDolares('oficial');
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toBe('http://localhost:9999/dolares/oficial');
  });

  it('defaults to https://dolarapi.com/v1 when no env var is set', async () => {
    vi.stubEnv('DOLAR_API_BASE_URL', undefined as unknown as string);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        casa: 'oficial',
        nombre: 'Oficial',
        compra: 1180,
        venta: 1220,
        fechaActualizacion: '2026-06-21T18:00:00.000Z',
      }),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await client.getDolares('oficial');
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toBe('https://dolarapi.com/v1/dolares/oficial');
  });

  it('throws AppError(FX_UNAVAILABLE) when the request exceeds 3 s', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            // Defer to a microtask so the synchronous abort
            // dispatch does not turn into a sync throw inside
            // the listener callback.
            queueMicrotask(() =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          });
        }),
    );
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    const promise = client.getDolares('oficial');
    // Attach the assertion BEFORE advancing time so the
    // rejection is observed by an attached handler and does
    // not surface as an "unhandled rejection" race.
    const assertion = expect(promise).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
    });
    await vi.advanceTimersByTimeAsync(3_001);
    await assertion;
  });

  it('rejects wire-shape with mixed-case casa (schema-enforced lowercase)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        casa: 'OfiCial', // mixed-case: the wire schema rejects it
        nombre: 'Oficial',
        compra: 1180,
        venta: 1220,
        fechaActualizacion: '2026-06-21T18:00:00.000Z',
      }),
    });
    const client = new DolarApiClient({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(client.getDolares('oficial')).rejects.toMatchObject({
      code: ErrorCode.FX_UNAVAILABLE,
    });
  });
});
