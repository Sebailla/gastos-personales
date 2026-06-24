# gastos-personales — auth foundation

Multi-user personal finance app. This change lands the **identity
layer** (Next.js 16 + Auth.js v5 + Prisma 6 + Postgres on Neon).
The application surface (accounts, transactions, snapshots, etc.)
lands in later changes.

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16 (App Router, React 19)
- **Auth**: Auth.js v5 + `@auth/prisma-adapter` + database sessions
- **ORM**: Prisma 6
- **DB**: PostgreSQL (Neon in dev/prod, testcontainers in CI)
- **Validation**: Zod (at every boundary)
- **API**: Hono (catch-all for non-auth endpoints) — Slice B
- **Package manager**: pnpm
- **Test runner**: Vitest (`pnpm test`)
- **Deploy**: Fly.io — owned by the `fly-deploy` change

## Local development

```bash
# 1. Install dependencies (corepack picks the pnpm version)
corepack enable
pnpm install --frozen-lockfile

# 2. Copy the env template and fill in the values
cp .env.example .env

# 3. Start a local Postgres (Docker) OR point to a Neon free-tier branch
pnpm db:up                          # local Postgres on localhost:5433
# OR set DATABASE_URL=postgres://...neon.tech/... in .env

# 4. Apply migrations to the dev database
pnpm prisma migrate deploy

# 5. Run the test suite (Vitest)
pnpm test

# 6. Run the security test suite only (timing, OAuth state,
#    secrets in logs, origin-check, Argon2id parameters, cookies)
pnpm test -- src/modules/auth/__tests__/security/

# 7. Skip the timing test on noisy local dev machines
#    (CI still runs the full suite)
SKIP_TIMING=true pnpm test

# 8. Lint + typecheck + build
pnpm run lint
pnpm run typecheck
pnpm run build

# 9. Start the dev server
pnpm run dev
```

## Documentation

- Spec: `openspec/specs/auth/spec.md`
- Change plan: `openspec/changes/auth-foundation/{proposal,design,tasks}.md`
- Spanish mirrors: `Documents-es/openspec/...`

## Conventions

- TypeScript `strict: true`; no `any`; no implicit returns.
- Domain does not import from application, infrastructure, or UI.
- Cross-module communication happens through `src/shared/events/`.
- All input is validated with Zod at the system boundary.
- Argon2id for password hashing. Parameters tuned for 50–100 ms
  on the target VM (Fly.io 1-CPU). Re-run `scripts/bench-argon2.ts`
  to verify on a new machine.
- Secrets never appear in logs. The structured logger
  (`src/shared/logger/`) maintains a denylist of
  `{ password, passwordHash, sessionToken, access_token,
refresh_token, id_token, csrfToken, 'set-cookie' }`.
- Author of every document: `Sebastián Illa`. No AI attribution.

## Pre-commit

```bash
gga run   # runs the code-quality gate (lint, format, typecheck)
```

`husky` wires `gga run` + `lint-staged` to the `pre-commit` hook,
`commitlint` to `commit-msg`, and the branch-name validator to
`pre-push`.
