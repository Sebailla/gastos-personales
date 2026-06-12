// Prisma config (v6+). The schema lives at prisma/schema.prisma
// and migrations land in prisma/migrations/. This file is the
// stable configuration entry point used by `pnpm prisma ...`.
//
// In v5 and earlier, prisma config was the schema block. In
// v6+, it is a separate TypeScript file. The `defineConfig`
// helper is exported from `prisma/config`.

import path from 'node:path';
// @ts-expect-error -- `prisma/config` is a runtime-resolved
// module that does not ship type declarations; the runtime
// shape is the v6 `defineConfig`.
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'echo "No seed script."',
  },
});
