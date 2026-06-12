/**
 * Benchmark script. Run with:
 *
 *   pnpm tsx scripts/bench-argon2.ts
 *
 * Hashes a 16-byte password 5 times and prints the p50 hash
 * time, plus a `BAND_OK` (50–100 ms), `BAND_SLOW` (>100 ms),
 * or `BAND_FAST` (<50 ms) verdict. If the target VM is
 * significantly off the band, re-tune `timeCost` in
 * `argon2.hasher.ts` and re-run.
 */

import { hashArgon2id, ARGON2ID_PARAMS } from '@/modules/auth/infrastructure/external/argon2.hasher';

const SAMPLES = 5;
const PASSWORD = 'benchmark-password-1234';

const main = async (): Promise<void> => {
  // Warm-up: first call may pay JIT + V8 cache cost.
  await hashArgon2id(PASSWORD);

  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    await hashArgon2id(PASSWORD);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)] ?? 0;

  let verdict: 'BAND_OK' | 'BAND_SLOW' | 'BAND_FAST' = 'BAND_OK';
  if (p50 > 100) verdict = 'BAND_SLOW';
  else if (p50 < 50) verdict = 'BAND_FAST';

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(
    {
      params: ARGON2ID_PARAMS,
      samples: samples.map((s) => Math.round(s * 100) / 100),
      p50Ms: Math.round(p50 * 100) / 100,
      verdict,
    },
    null,
    2,
  ));
};

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('benchmark failed:', err);
  process.exit(1);
});
