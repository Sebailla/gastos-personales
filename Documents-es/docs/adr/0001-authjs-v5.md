# ADR-0001 — Auth.js v5 (next-auth@5.0.0-beta.31) como capa de identidad

**Estado**: Aceptado · **Fecha**: 2026-06-13 · **Decisores**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`design.md` §2, §3 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Contexto y problema a resolver

El cambio `auth-foundation` aterriza la capa completa de identidad para `gastos-personales`. Necesitamos una librería de autenticación que: (1) nos dé manejo de sesiones para el App Router de Next.js 16, (2) soporte tanto Credentials (email + password con Argon2id) como Google OAuth 2.0, (3) se integre con Prisma 6 mediante el adapter canónico, (4) sea lo suficientemente madura para una app de finanzas multi-usuario donde una filtración de sesión es un incidente de seguridad. La capa de identidad es el piso: cada cambio posterior (`accounts-ledger`, `transactions`, `reports-mvp`, `pwa-shell`) depende de ella.

## Drivers

- **Defaults de seguridad**: CSRF, cookies seguras, OAuth `state`, PKCE tienen que ser correctos por default.
- **Integración con Prisma**: tiene que usar el schema canónico de `@auth/prisma-adapter`, no uno custom.
- **Mantenimiento**: librería vigente en 2026, con releases activos y un camino sin deprecación.
- **Costo**: sin vendor lock-in, sin factura por MAU.
- **Runtime**: tiene que correr en Node.js 20 (Fly.io).

## Opciones consideradas

1. **Auth.js v5** + adapter de Prisma + sesiones de base de datos.
2. **Lucia** — TypeScript primero, agnóstica de framework.
3. **Clerk** — auth-as-a-service administrada.
4. **Supabase Auth** — empaquetada con Supabase Postgres.
5. **Hecha a mano** — store de sesión, callback de OAuth, CSRF, hashing de password in-house.

## Resultado de la decisión

**Opción elegida**: "1. Auth.js v5", porque `@auth/prisma-adapter` trae el schema canónico de 4 tablas (`User`, `Account`, `Session`, `VerificationToken`) que adoptamos de forma literal (BR-AUTH-9), el endurecimiento de OAuth `state` + PKCE + cookies es correcto por default (BR-AUTH-10), y los callbacks `signIn` / `session` nos dan los puntos de costura que necesitamos para estampar `lastLoginAt` y exponer `defaultProvider` / `lastLoginAt` a la UI (BR-AUTH-13).

### Consecuencias

- **Buenas**: defaults de seguridad estándar de la industria; sesiones en base de datos (sin JWT en la cookie del cliente); callbacks `signIn` / `session` para `lastLoginAt` y `defaultProvider`; el adapter de Prima es dueño de las rutas de lectura/escritura para `Account` / `Session` / `VerificationToken`.
- **Malas**: v5 todavía es beta; la superficie de la API puede cambiar entre betas. Pineamos la versión exacta en `package.json` y usamos `pnpm install --frozen-lockfile` en CI. El bug de resolución de módulos entre next-auth y Next.js (issue #18) es la verruga conocida; el fix de C-1 parchea `vitest.config.ts` con un stub de `resolve.alias`.

### Confirmación

Validado por T-018 (`authjs.test.ts`, 6 casos) y la suite de seguridad de C-2 (T-027.2 OAuth state-CSRF, T-027.6 atributos de cookie). CI corre ambas en cada push. Un `sdd-verify` posterior corre la suite contra el runtime real de `next-auth` en Neon.
