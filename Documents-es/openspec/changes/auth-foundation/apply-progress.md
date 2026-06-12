# Progreso de Aplicación — `auth-foundation` Slice A

**Autor**: Sebastián Illa
**Cambio**: `auth-foundation`
**Slice**: A — T-001..T-018
**Fecha**: 2026-06-12
**Rama**: `feat/auth-foundation-apply-slice-a` (desde `develop`)

## Estado

| Fase | Tareas | Estado |
|---|---|---|
| Fase 0 — Scaffolding | T-001..T-004 | ✅ completa |
| Fase 1 — Infra compartida | T-005..T-009 | ✅ completa |
| Fase 2 — Dominio auth | T-010..T-014 | ✅ completa |
| Fase 3 — Infraestructura auth | T-015..T-018 | ✅ completa (con notas) |

## Evidencia del Ciclo TDD

| Tarea | Archivo de test | Capa | RED | GREEN | TRIANGULATE | REFACTOR |
|------|----------------|------|-----|-------|-------------|----------|
| T-005 | `src/shared/env/env.schema.test.ts` | Unit | ✅ 7 casos | ✅ Pasó | ✅ 7 casos | ✅ Limpio |
| T-006 | `src/shared/errors/app-error.test.ts` | Unit | ✅ 4 casos | ✅ Pasó | ✅ 4 códigos | ✅ Limpio |
| T-007 | `src/shared/logger/logger.test.ts` + `src/shared/http/{request-id,error-handler}.test.ts` | Unit | ✅ 10+ casos | ✅ Pasó | ✅ 11 claves denegadas | ✅ Limpio |
| T-008 | `src/shared/crypto/web-crypto.test.ts` | Unit | ✅ 6 casos | ✅ Pasó | ✅ casos de tamper | ✅ Limpio |
| T-009 | `src/shared/events/event-dispatcher.test.ts` | Unit | ✅ 4 casos | ✅ Pasó | ✅ caso de throw | ✅ Limpio |
| T-010 | `src/modules/auth/domain/entities/*.test.ts` + `value-objects/public-user.test.ts` | Unit | ✅ 8 casos | ✅ Pasó | ✅ normalización | ✅ Limpio |
| T-011 | `src/shared/db/prisma.test.ts` | Unit | ✅ 3 casos | ✅ Pasó | ✅ N/A (forma única) | ✅ Limpio |
| T-012 | `src/modules/auth/infrastructure/external/argon2.hasher.test.ts` | Unit | ✅ 5 casos | ✅ Pasó | ✅ unicidad de salt | ✅ Limpio |
| T-013 | `src/modules/auth/domain/services/default-provider.policy.test.ts` | Unit | ✅ 5 casos | ✅ Pasó | ✅ 3 ramas | ✅ Limpio |
| T-014 | `src/modules/auth/domain/services/auth.service.test.ts` | Unit | ✅ 8 casos | ✅ Pasó | ✅ 3 paths (success, EMAIL_TAKEN, OAuth) | ✅ Limpio |
| T-016 | `src/modules/auth/infrastructure/repositories/user.repository.test.ts` | Unit (fake) | ✅ 4 casos | ✅ Pasó | ✅ case-insensitive | ✅ Limpio |
| T-017 | `src/modules/auth/infrastructure/repositories/{account,session}.repository.test.ts` | Unit (fake) | ✅ 6 casos | ✅ Pasó | ✅ unique-lookup, miss, delete | ✅ Limpio |
| T-018 | `src/modules/auth/infrastructure/external/authjs.test.ts` | Unit | ✅ 6 casos | ✅ Pasó | ✅ idempotencia | ✅ Limpio |

## Desviaciones de `design.md`

1. **La migración de Prisma NO se genera** (T-015): el paso
   `prisma migrate dev` requiere una base de datos Postgres
   en vivo. Este entorno no tiene Postgres disponible, por
   lo que la migración se entrega sólo como el archivo
   `schema.prisma`. El `apply-progress.md` y la
   configuración de `fly-deploy` / dev local ejecutarán
   `pnpm prisma migrate dev --name auth_foundation` cuando
   haya una base de datos; el archivo SQL es responsabilidad
   del siguiente worker con base de datos.
2. **Repositorios probados con fakes, no con testcontainers de Postgres**
   (T-016, T-017): las tareas piden testcontainers de
   Postgres por test. Sin una imagen de Postgres en este
   entorno, la suite cae a dobles-Prisma que registran las
   llamadas. La fase `sdd-verify` debe re-correr la suite
   contra testcontainers; el código actual pasa las mismas
   aserciones de lógica de negocio (lookup case-insensitive,
   unique-lookup compuesto, etc.) que la suite real verifica.
3. **El benchmark de Argon2id es un script, no una aserción
   dentro de un test** (T-012, T-027): el script
   `scripts/bench-argon2.ts` mide el p50 del tiempo de hash
   e imprime el veredicto. El test de seguridad
   `argon2.parameters.test.ts` (en Slice C) re-corre el
   benchmark en CI con una aserción de banda 50–100 ms.

## Archivos tocados

Ver `git log --stat feat/auth-foundation-apply-slice-a`
cuando se haga push del slice. El resumen `git diff --stat
develop..HEAD` irá en el cuerpo del PR.

## Riesgos para el revisor

- **API surface de `next-auth@5.0.0-beta.25`** — los betas
  cambian de forma. Pinneamos la versión exacta; si un beta
  futuro cambia la forma de exportación, la suite de tests
  fallará rápido y el upgrade es una decisión separada.
- **Ajuste de parámetros de Argon2id** —
  `memoryCost=19456, timeCost=2, parallelism=1` es el
  default elegido en el design. El benchmark en la VM
  destino es la fuente de verdad; este PR no corre el
  benchmark en Fly.io.
- **Zod parse de `process.env` en module init** — cada
  import de `env` corre el schema una vez. El
  `test/setup.ts` de Vitest setea las env vars antes de
  que cualquier test file importe `env.schema`, así que la
  validación pasa en los unit tests. En producción la
  misma ruta de import corre al boot; un valor mal
  formado falla rápido con un error de Zod.
