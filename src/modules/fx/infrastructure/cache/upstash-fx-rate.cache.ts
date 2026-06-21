import { Redis } from '@upstash/redis';
import { logger } from '@/shared/logger/logger';
import type { FxCasaString } from '../../domain/entities/fx-casa-string.schema';
import type { FxQuote } from '../../domain/entities/fx-quote';
import type { FxRateCachePort, FxRateCacheEntry } from '../../domain/ports/fx-rate-cache.port';

/**
 * Cache key prefix for the FX rate cache. Append the casa
 * (lowercase DolarAPI form) to build a full key, e.g.
 * `gastos-personales:fx:v1:oficial`. The `v1` segment is a
 * cache-busting affordance for a future shape change — see
 * design §4 for the rejected alternatives and the rationale.
 */
const KEY_PREFIX = 'gastos-personales:fx:v1';

/**
 * TTL for cached FX entries. Matches the design §7.2 budget:
 * 1 hour. The Upstash `EX 3600` is the authoritative TTL
 * (Redis evicts the key after 1 h); the `cachedAt` field is
 * for the in-process "is this still fresh before the Redis
 * eviction" semantic.
 */
const TTL_SECONDS = 3600;

export interface UpstashFxRateCacheDeps {
  /**
   * Override the env-var lookup. Tests inject a custom env.
   * Production code omits this and reads from `process.env`.
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Injected Redis client. Tests inject a fake; production
   * code omits this and the constructor builds `new Redis(...)`
   * when env vars are present.
   *
   * When omitted AND env vars are absent, the adapter is a
   * no-op (`get` returns `null`, `set` silently drops). This
   * matches the pattern in `src/shared/rate-limit/rate-limit.ts`.
   */
  redis?: Redis;
}

/**
 * Upstash REST Redis cache adapter for FX rates.
 *
 * Env-var-gated: when `UPSTASH_REDIS_REST_URL` or
 * `UPSTASH_REDIS_REST_TOKEN` is missing, the adapter is a
 * no-op (`get` returns `null`, `set` silently drops). This
 * matches the pattern in `src/shared/rate-limit/rate-limit.ts`
 * and lets the app boot in local dev and CI without a real
 * Upstash project.
 *
 * Implements `FxRateCachePort`. The adapter owns the
 * `cachedAt` timestamp: callers pass the `FxQuote`, and the
 * adapter stamps `new Date().toISOString()` on every write.
 * The provider reads `cachedAt` to compute the `stale` flag
 * (entry is stale when `Date.now() - cachedAt > 1 h`).
 */
export class UpstashFxRateCache implements FxRateCachePort {
  private readonly redis: Redis | null;

  constructor(deps: UpstashFxRateCacheDeps = {}) {
    const env = deps.env ?? process.env;
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    const envEnabled = Boolean(url && token);

    if (envEnabled) {
      // Env vars win. If the test injects `redis`, use that;
      // otherwise build a real `Redis` from the env.
      this.redis = deps.redis ?? new Redis({ url: url as string, token: token as string });
      return;
    }

    // Env-gated no-op path. Even if a test injects `redis`,
    // we honour the missing-env contract: the local-dev and CI
    // story must work without a real Upstash project.
    this.redis = null;
    if (deps.redis === undefined) {
      // Only log on a real boot, not on a test that injects a
      // fake Redis and forgets to stub env. Production callers
      // never inject `redis`.
      logger.info('fx.cache.noop', { reason: 'missing_env' });
    }
  }

  async get(casa: FxCasaString): Promise<FxRateCacheEntry | null> {
    if (!this.redis) return null;
    const raw = await this.redis.get<FxRateCacheEntry>(`${KEY_PREFIX}:${casa}`);
    return raw ?? null;
  }

  async set(casa: FxCasaString, quote: FxQuote): Promise<void> {
    if (!this.redis) return;
    const entry: FxRateCacheEntry = {
      quote,
      cachedAt: new Date().toISOString(),
    };
    await this.redis.set(`${KEY_PREFIX}:${casa}`, entry, { ex: TTL_SECONDS });
  }
}
