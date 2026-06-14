# ADR-0002 — Prisma 6 como capa de acceso a datos

**Estado**: Aceptado · **Fecha**: 2026-06-13 · **Decisores**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`design.md` §5 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Contexto y problema a resolver

El módulo de auth es dueño de 4 tablas (`User`, `Account`, `Session`, `VerificationToken`) que `@auth/prisma-adapter` espera que coincidan con su schema canónico de forma exacta. Los cambios `accounts-ledger` y `transactions` (downstream de `auth-foundation`) van a sumar más tablas. Necesitamos un ORM que: (1) genere un cliente tipado con type-safety end-to-end a partir de una única fuente de verdad (`prisma/schema.prisma`), (2) emita SQL parametrizado (nunca concatenación de strings), (3) soporte migraciones versionadas que se desplieguen de forma idempotente en CI, y (4) se integre con el adapter canónico de Auth.js sin drift de schema.

## Drivers

- **Type safety**: desde `schema.prisma` hasta el cliente y los puertos de los repositorios, sin `any`, sin `Record<string, unknown>` sin tipo.
- **Historia de migraciones**: `pnpm prisma migrate dev` localmente, `pnpm prisma migrate deploy` en CI / al arrancar el container.
- **Soporte de features de Postgres**: `@db.Text` para las columnas largas `access_token` / `refresh_token` / `id_token`; `@@unique([provider, providerAccountId])` compuesto para BR-AUTH-10; `@@index` explícito para `Session.expires` (el futuro job de GC) y `User.createdAt` (el futuro cambio de `user-deletion`).
- **Ecosistema de adapters**: `@auth/prisma-adapter` es el adapter canónico de Auth.js; es el que la documentación de Auth.js referencia.
- **Madurez operativa**: connection pooling, prepared statements, los códigos de error de violación de unicidad `P2002` contra los que podemos assertar en los tests.

## Opciones consideradas

1. **Prisma 6** — schema primero, cliente tipado generado, `@auth/prisma-adapter` es el adapter canónico de Auth.js.
2. **Kysely** — query builder SQL type-safe, el schema es TypeScript escrito a mano; sin `@db.Text`, sin declaraciones de `@@unique` / `@@index` a nivel de schema.
3. **SQL crudo** + `pg` — control total, sin type safety sin un paso de codegen que tenemos que escribir y mantener.
4. **Drizzle** — ORM TypeScript primero, menos maduro del lado de `@auth/prisma-adapter` (sin adapter canónico de Auth.js; el adapter de Drizzle existe pero lo mantiene la comunidad).

## Resultado de la decisión

**Opción elegida**: "1. Prisma 6", porque `@auth/prisma-adapter` requiere el schema canónico de 4 tablas de forma exacta, el `@@unique([provider, providerAccountId])` de Prisma es la línea de defensa de BR-AUTH-10 contra el ataque de "la misma cuenta de Google linkeada a dos usuarios", y la historia de migraciones versionadas (`pnpm prisma migrate dev` → `pnpm prisma migrate deploy`) es la misma que van a correr los release commands de Fly.io.

### Consecuencias

- **Buenas**: type safety end-to-end desde el schema hasta el cliente; SQL parametrizado por construcción; adapter canónico de Auth.js; `P2002` es el target de aserción para el test de violación de unicidad de BR-AUTH-10; `@@index([expires])` listo para el futuro job de GC.
- **Malas**: schema primero implica un paso de `prisma generate` en CI; Drizzle es más liviano en runtime, pero el ecosistema de adapters no está a la par. Aceptable para un MVP.

### Confirmación

Validado por T-015 (schema de Prisma + migración), T-016 + T-017 (repositorios con fakes + la futura re-corrida con testcontainers en `sdd-verify`), y el adapter canónico se verifica por el propio typecheck de Auth.js contra `@auth/prisma-adapter@2.11.2`.
