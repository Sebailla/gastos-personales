// Prisma config (v6+). The schema lives at prisma/schema.prisma
// and migrations land in prisma/migrations/. This file is the
// stable configuration entry point used by `pnpm prisma ...`.

import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'echo "No seed script."',
  },
});
