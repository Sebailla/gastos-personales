// Prisma config (v6+). The schema lives at prisma/schema.prisma
// and migrations land in prisma/migrations/. This file is the
// stable configuration entry point used by `pnpm prisma ...`.
//
// In v5 and earlier, prisma config was the schema block. In
// v6+, it is a separate TypeScript file. The `defineConfig`
// helper is exported from `prisma/config`.
//
// Prisma 7 moved the `datasource.url` from `schema.prisma` to
// here (and the `PrismaClient` constructor needs an `adapter`
// at runtime). Keeping the URL out of the schema lets multiple
// environments (local Docker, Neon dev, CI testcontainers)
// share one schema while each has its own config.
//
// Prisma 7's CLI does NOT auto-load `.env` (it did in v6). We
// call `process.loadEnvFile()` explicitly so the URL and any
// other env-derived config resolve correctly. Stable since
// Node 21.7; the project requires Node >= 20, so we guard the
// call so Node 20 users don't crash on startup (they can
// \`source .env\` manually, or upgrade to Node 22 LTS).

import path from 'node:path';
if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'echo "No seed script."',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
