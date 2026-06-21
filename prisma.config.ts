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

import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7's CLI does NOT auto-load `.env` (it did in v6).
// Load it explicitly when the file exists, so dev machines work
// out of the box. CI environments pass env vars via the workflow
// `env:` block — there's no `.env` file there, and `loadEnvFile`
// throws ENOENT if the file is missing, so we guard with
// `existsSync('.env')`. The `typeof` guard covers Node 20
// (loadEnvFile is stable since Node 21.7; project requires >= 20).
if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'echo "No seed script."',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
