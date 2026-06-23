# Progreso de Apply — `transactions` (slice 1: entidad + port + factory)

**Autor**: Sebastián Illa
**Cambio**: `transactions`
**Slice**: 1 de N — slice atómico de entidad (agregado `Transaction`, `TransactionRepositoryPort`, factory `createTransaction`, const `TransactionDirection`, errores de dominio)
**Rama**: `feat/transactions-entity`
**Base**: `develop`
**Estado**: en-progreso · **Creado**: 2026-06-23 · **Última sync**: 2026-06-23 (slice 1)
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**TDD estricto**: habilitado según `openspec/config.yaml`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Slice atómico de validación. Aterriza la superficie mínima posible que
> demuestra que la capa de dominio es construible y testeable de punta a punta.
> SIN modelo Prisma, SIN acciones, SIN helper de FX, SIN eventos, SIN códigos
> de error, SIN rutas, SIN UI smoke. Solo el agregado, la factory, el port, el
> enum de dirección, los errores de dominio y el barrel.

## Baseline de pre-vuelo (2026-06-23)

| Verificación                              | Resultado                                                        |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `pnpm install --ignore-workspace`         | OK (905 paquetes, 4.5s)                                          |
| `pnpm prisma generate`                    | OK (v7.8.0)                                                      |
| `pnpm test` (baseline)                    | **527 pasaron**, 4 skipped (testcontainers Postgres), 0 fallaron |
| `pnpm run typecheck` (baseline)           | **0 errores**                                                    |
| `gga run` (baseline, sin archivos staged) | OK (informativo — "No matching files staged for commit")         |

**Nota sobre `pnpm install`**: un `pnpm-workspace.yaml` en `$HOME` (un artefacto
del sistema, sin relación con este repo) se detectaba como raíz del workspace.
El flag `--ignore-workspace` es necesario para instalar en el `node_modules/`
local del proyecto. Esto es una particularidad de la configuración local, no un
defecto del proyecto. El `pnpm-lock.yaml` no cambia en el slice 1 (sin
dependencias nuevas).

## Alcance del slice 1 (vinculante)

| #   | Archivo                                                 | Tipo | REQ del spec                           |
| --- | ------------------------------------------------------- | ---- | -------------------------------------- |
| 1   | `domain/entities/transaction-direction.ts`              | impl | REQ-TX-3, BR-TX-2                      |
| 2   | `domain/entities/transaction-direction.test.ts`         | test | REQ-TX-3                               |
| 3   | `domain/entities/transaction.errors.ts`                 | impl | REQ-TX-2, REQ-TX-3, REQ-TX-4           |
| 4   | `domain/entities/transaction.ts`                        | impl | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 5   | `domain/entities/transaction.test.ts`                   | test | REQ-TX-2, REQ-TX-4, REQ-TX-5           |
| 6   | `domain/factories/create-transaction.ts`                | impl | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 7   | `domain/factories/create-transaction.test.ts`           | test | REQ-TX-1, REQ-TX-2, REQ-TX-3, REQ-TX-4 |
| 8   | `domain/interfaces/transaction.repository.port.ts`      | impl | REQ-TX-1, BR-TX-4                      |
| 9   | `domain/interfaces/transaction.repository.port.test.ts` | test | BR-TX-4 (contrato de compilación)      |
| 10  | `domain/index.ts`                                       | impl | barrel                                 |

## Ledger de commits (a completar por commit)

| SHA | Tipo  | Asunto                                                              | Tests | RED → GREEN   | typecheck | Notas |
| --- | ----- | ------------------------------------------------------------------- | ----- | ------------- | --------- | ----- |
|     | chore | scaffold transactions/domain tree (slice 1 anchor)                  | 0     | n/a           | n/a       |       |
|     | docs  | scaffold apply-progress (EN + ES)                                   | 0     | n/a           | n/a       |       |
|     | test  | red — TransactionDirection enum contract (5 casos)                  | 5 RED | commit red    | n/a       |       |
|     | feat  | TransactionDirection const + type (TRANSFER reservado)              | 5 GR  | greena T1.1   | 0 errores |       |
|     | feat  | TransactionDomainError + InvalidAmountError + InvalidDirectionError | 5 GR  | sigue pasando | 0 errores |       |
|     | test  | red — Transaction agregado invariantes (8 casos)                    | 8 RED | commit red    | n/a       |       |
|     | feat  | Transaction agregado (14 campos, 3 invariantes)                     | 13 GR | greena T1.2   | 0 errores |       |
|     | test  | red — createTransaction factory contract (6 casos)                  | 6 RED | commit red    | n/a       |       |
|     | feat  | createTransaction factory (UUID, timestamps, validación)            | 19 GR | greena T1.3   | 0 errores |       |
|     | test  | red — TransactionRepositoryPort compile-time contract (4 casos)     | 4 RED | commit red    | n/a       |       |
|     | feat  | TransactionRepositoryPort (5 métodos, userId primero)               | 23 GR | greena T1.4   | 0 errores |       |
|     | feat  | barrel exportando la superficie del dominio                         | 23 GR | sigue pasando | 0 errores |       |
|     | docs  | cerrar apply-progress para slice 1 (entidad + port)                 | 23 GR | sigue pasando | 0 errores |       |

## Evidencia del ciclo TDD

| Archivo                               | RED SHA | GREEN SHA | Prueba RED (salida del runner) | Prueba GREEN (salida del runner) |
| ------------------------------------- | ------- | --------- | ------------------------------ | -------------------------------- |
| `transaction-direction.test.ts`       |         |           |                                |                                  |
| `transaction.test.ts`                 |         |           |                                |                                  |
| `create-transaction.test.ts`          |         |           |                                |                                  |
| `transaction.repository.port.test.ts` |         |           |                                |                                  |

## Desviaciones

> Ninguna aún. El slice 1 se ata a los REQ-TX-1 a REQ-TX-5 del spec; no se
> permiten desviaciones (el slice es intencionalmente ajustado).

## Compuertas de aceptación

- [ ] `pnpm test` sale 0 con 23 tests nuevos pasando bajo `src/modules/transactions/**`
- [ ] `pnpm run typecheck` sale 0 (0 errores)
- [ ] `pnpm test --coverage` muestra ≥ 80% líneas en `src/modules/transactions/domain/**` (objetivo 100% — lógica de dominio pura)
- [ ] `git log develop..feat/transactions-entity --oneline` muestra la secuencia atómica completa
- [ ] `git log develop..feat/transactions-entity | grep -i "no-verify"` está vacío
- [ ] `git log develop..feat/transactions-entity | grep -iE "co-authored.*(ai|claude|gpt|gemini)|with ai help|generated by ai"` está vacío
- [ ] `git diff --stat develop..feat/transactions-entity | tail -1` muestra < 600 líneas (objetivo 250–400)
- [ ] `Documents-es/openspec/changes/transactions/apply-progress.md` existe, refleja el archivo EN, 0 caracteres CJK
- [ ] Cabecera de `openspec/changes/transactions/apply-progress.md` es exactamente `Author: Sebastián Illa` (sin variantes de IA)
- [ ] Cabecera de `Documents-es/openspec/changes/transactions/apply-progress.md` es exactamente `Autor: Sebastián Illa`
- [ ] Todos los commits pasan `pnpm test` y `pnpm run typecheck` (compuerta por commit)
- [ ] Todos los commits pasan `pnpm exec lint-staged && gga run` (compuerta de pre-commit)
