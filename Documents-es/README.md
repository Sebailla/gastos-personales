# gastos-personales — auth foundation

App de finanzas personales multi-usuario. Este cambio aterriza
la **capa de identidad** (Next.js 16 + Auth.js v5 + Prisma 6 +
Postgres en Neon). La superficie de aplicación (cuentas,
transacciones, snapshots, etc.) aterriza en cambios
posteriores.

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16 (App Router, React 19)
- **Auth**: Auth.js v5 + `@auth/prisma-adapter` + sesiones en base de datos
- **ORM**: Prisma 6
- **DB**: PostgreSQL (Neon en dev/prod, testcontainers en CI)
- **Validación**: Zod (en cada frontera)
- **API**: Hono (catch-all para endpoints no-auth) — Slice B
- **Package manager**: pnpm
- **Test runner**: Vitest (`pnpm test`)
- **Deploy**: Fly.io — pertenece al cambio `fly-deploy`

## Local dev

```bash
# 1. Instalar dependencias (corepack elige la versión de pnpm)
corepack enable
pnpm install --frozen-lockfile

# 2. Copiar el template de env y completar los valores
cp .env.example .env

# 3. Levantar un Postgres local (Docker) O apuntar a una branch
#    free-tier de Neon
docker compose up -d postgres       # Postgres local en localhost:5432
# O setear DATABASE_URL=postgres://...neon.tech/... en .env

# 4. Aplicar las migraciones a la base de datos de dev
pnpm prisma migrate deploy

# 5. Correr la suite de tests (Vitest)
pnpm test

# 6. Correr solo la suite de tests de seguridad (timing, OAuth
#    state, secrets in logs, origin-check, Argon2id parameters,
#    cookies)
pnpm test -- src/modules/auth/__tests__/security/

# 7. Saltear el test de timing en máquinas locales ruidosas
#    (CI sigue corriendo la suite completa)
SKIP_TIMING=true pnpm test

# 8. Lint + typecheck + build
pnpm run lint
pnpm run typecheck
pnpm run build

# 9. Levantar el dev server
pnpm run dev
```

## Documentación

- Spec: `openspec/specs/auth/spec.md`
- Plan de cambios: `openspec/changes/auth-foundation/{proposal,design,tasks}.md`
- Espejos en español: `Documents-es/openspec/...`

## Convenciones

- TypeScript `strict: true`; sin `any`; sin retornos implícitos.
- El domain no importa desde application, infrastructure ni UI.
- La comunicación cross-module sucede a través de `src/shared/events/`.
- Todo input se valida con Zod en la frontera del sistema.
- Argon2id para el hashing de password. Parámetros afinados
  para 50–100 ms en la VM objetivo (Fly.io 1-CPU). Re-correr
  `scripts/bench-argon2.ts` para verificar en una máquina
  nueva.
- Los secrets nunca aparecen en logs. El logger estructurado
  (`src/shared/logger/`) mantiene una denylist de
  `{ password, passwordHash, sessionToken, access_token,
refresh_token, id_token, csrfToken, 'set-cookie' }`.
- Autor de cada documento: `Sebastián Illa`. Sin atribución
  de IA.

## Pre-commit

```bash
gga run   # corre la puerta de calidad de código (lint, format, typecheck)
```

`husky` cablea `gga run` + `lint-staged` al hook de
`pre-commit`, `commitlint` al de `commit-msg`, y el validador
de nombre de branch al de `pre-push`.
