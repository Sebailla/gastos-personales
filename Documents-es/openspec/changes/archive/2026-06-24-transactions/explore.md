# Exploración — `transactions`

**Estado**: investigación (archivado) · **Autor**: Sebastián Illa
**Creado**: 2026-06-22 · **Archivado**: 2026-06-24 (investigación consolidada en el grill de pre-propose; propuesta/diseño/tareas implementaron slices 1-5 vía #59-#63)
**Slice objetivo**: MVP-2 (libro mayor de transacciones)
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas)

> **Documento de investigación.** Este es el output de
> `sdd-explore` para el cambio `transactions`. Inventaría el
> codebase, nombra costuras reutilizables, lista vacíos y
> desconocidos, y plantea las decisiones que el orquestador
> cerrará con el usuario antes de `sdd-propose`. **Acá no vive
> ninguna propuesta de diseño.** En esta fase no se crean
> `proposal.md`, `spec.md`, `design.md`, ni `tasks.md`. El
> plan de slices es orientativo; `sdd-tasks` define el
> ordenamiento final.

---

## 1. Resumen

El cambio `transactions` agrega la capability **libro mayor
de transacciones** a `gastos-personales`: registro manual de
gastos (CRUD) más multi-moneda (usando el `FxRateProvider`
del módulo `fx` para convertir a la `casa` de la cuenta),
adjuntos y recurrencia. El **scope bloqueado para el Slice
1** es **el agregado `Transaction` + CRUD + multi-moneda
vía el módulo `fx`**; los adjuntos y la recurrencia quedan
explícitamente diferidos al Slice 2+ del mismo cambio. La
regla autoritativa es **"Slice 1 = entidad + CRUD +
multi-moneda PRIMERO; adjuntos y recurrencia vienen
DESPUÉS de que el Slice 1 aterrice."** Una transacción puede
estar en cualquier moneda soportada por el módulo `fx`; al
mostrarse, el balance y los totales convierten a la `casa`
de la cuenta (casa por cuenta desde `fx-cache`) usando el
port `FxRateProvider` ya existente en `src/modules/fx/`.

## 2. Lo que ya existe en el codebase

Esta sección enumera cada módulo, archivo, port, tabla y
variable de env que el nuevo cambio va a tocar o en los que
se va a apoyar. Cada entrada se verifica leyendo el archivo
citado.

### 2.1. Módulo `accounts` — dependencia dura

El nuevo agregado `Transaction` referencia
`FinancialAccount.id` vía `accountId: string` (FK con
`onDelete: Cascade`, espejando el invariante
`FinancialAccount.userId → User.id` en
`prisma/schema.prisma:214`).

| Archivo                                                                       | Qué provee hoy                                                                                                                                                                                          | Dep. dura / blanda                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma:177-219`                                                | Modelo `FinancialAccount`, `@@unique([userId, type, name])`, `@@index([userId, archivedAt])`, `@@index([userId, createdAt])`, `casa AccountFxCasa?` nullable (línea 209).                               | **Dura** — FK `Transaction.accountId` + lookup de `casa` al mostrar.                                                                                                              |
| `src/modules/accounts/domain/entities/financial-account.ts:78-86`             | Enum `AccountFxCasa` como constante TS plana (forma UPPERCASE de Prisma).                                                                                                                               | **Dura** — `transactions` necesita resolver `account.casa` al mostrar.                                                                                                            |
| `src/modules/accounts/domain/services/account.service.ts:132-149`             | `AccountService.getBalance(userId, id, displayCurrency, casa)` — lee el balance nativo, llama a `FxRateProvider.getDisplayAmount`. Devuelve `FxConversionResult { native, display, stale, warnings? }`. | **Blanda** — el nuevo cambio consume la misma forma; no extiende el servicio.                                                                                                     |
| `src/modules/accounts/index.ts:27-64`                                         | Barrel público exporta: `AccountService`, los 5 enums base + `AccountFxCasa`, los 2 ports (`AccountRepositoryPort`, `FxRateProvider`), el value object `OpeningBalance`, la forma `FinancialAccount`.   | **Dura** — frontera de cualquier import cross-module. El barrel NO exporta la implementación del provider FX ni el repositorio Prisma (regla architecture-standards: solo ports). |
| `src/modules/accounts/application/dto/financial-account-balance.dto.ts:22-46` | Forma wire `FinancialAccountBalanceDto` con `{ native, display, stale, warnings? }`; mapper `toBalanceDto()`.                                                                                           | **Blanda** — usada por `transactions` si hace falta una superficie "balance en moneda de la cuenta", pero no es dependencia directa.                                              |
| `openspec/specs/accounts/spec.md` (archivo completo)                          | Spec canónica con las 10 decisiones cerradas (líneas 18-35), las reglas BR-ACC-12..19, y la tabla de entidad con unión discriminada.                                                                    | **Referencia dura** — `transactions` referencia BR-ACC-12 (FX solo para display).                                                                                                 |

### 2.2. Módulo `fx` — dependencia dura (conversión solo para display)

| Archivo                                                                      | Qué provee hoy                                                                                                                                                                                                                             | Dep. dura / blanda                                                                                                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/fx/index.ts:28-39`                                              | El barrel público exporta `FxRateProviderDolarApi`, `DolarApiClient`, `UpstashFxRateCache`, `withLock`, `fxCasaStringSchema`, `FX_CASAS`, `FxCasaString`, `FxQuote`. **No exporta ninguna interfaz de port** (el port vive en `accounts`). | **Dura** — `transactions` importa `fxCasaStringSchema`/`FxCasaString` para normalizar.                                                                                            |
| `src/modules/fx/infrastructure/external/fx-rate-provider.dolar-api.ts:46-83` | `FxRateProviderDolarApi.getDisplayAmount()` lee `request.casa`, pega en cache o llama a DolarAPI, devuelve `FxConversionResult`. **Dentro del provider no hay lookup de cuenta** (REQ-FX-3 enforced a nivel de tipos).                     | **Dura** — la ruta de conversión se consume sin cambios.                                                                                                                          |
| `src/modules/fx/infrastructure/external/dolar-api.client.ts:39`              | URL base por defecto de DolarAPI `https://dolarapi.com/v1`; timeout 3 s (línea 32).                                                                                                                                                        | **Blanda** — solo relevante si un endpoint futuro de resumen de transacciones necesita conversión en batch.                                                                       |
| `src/modules/fx/infrastructure/cache/upstash-fx-rate.cache.ts:14, 23`        | Prefijo de clave `gastos-personales:fx:v1`; TTL `EX 3600`.                                                                                                                                                                                 | **Blanda** — se reutiliza si más adelante se agrega un roll-up de balances multi-cuenta.                                                                                          |
| `openspec/specs/fx/spec.md` (líneas 132-191)                                 | Contratos de value object `FxQuote`, `FxRateCacheEntry`, `FxRequest`. El `FxRateProvider` es de display-only; **no** posee almacenamiento de FX en transacciones (línea 96-98: "v1 the FX surface stays read-only and display-only").      | **Referencia dura** — la spec contempla explícitamente que un cambio futuro de `transactions` PUEDE guardar la tasa FX usada al momento de escritura en cada fila de transacción. |

### 2.3. Módulo `auth` — dependencia dura (ancla de identidad)

| Archivo                               | Qué provee hoy                                                                                                                                                                                   | Dep. dura / blanda                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma:22-42`          | Modelo `User` con `id: String @id @default(cuid())`, `email @unique`, `emailVerified`, `passwordHash`, `defaultProvider`, `lastLoginAt`. Relación `FinancialAccount[]` (línea 36).               | **Dura** — FK `Transaction.userId` referencia `User.id`.                                                                                                                                 |
| `prisma/schema.prisma:71-79`          | Tabla `Session` (`sessionToken @unique`, `expires`, FK a `User` con `onDelete: Cascade`).                                                                                                        | **Dura** — cada endpoint Hono lee `c.get('user')` desde el middleware de auth.                                                                                                           |
| `src/modules/auth/index.ts:18-20`     | El barrel público exporta exactamente 7 símbolos: `auth`, `signIn`, `signOut`, `handlers`, `honoApp`, `UserRegistered`, `UserSignedIn` (el doc-comment dice 7; la línea de export los confirma). | **Dura** — `transactions` importa `auth` para server components / actions y `honoApp` solo si hace falta una sub-app (no hace falta; las rutas viven en la sub-app protegida existente). |
| `src/modules/api/app.ts:131-184`      | El `authMiddleware` corre después de las rutas públicas; la sub-app protegida se monta en `/`. El middleware `requireSession` estrecha `c.get('user')` a `AuthUser` (no nullable).               | **Dura** — cada ruta Hono de `transactions` se monta dentro de la sub-app `protectedApp` en `app.ts:192`.                                                                                |
| `openspec/specs/auth/spec.md:619-647` | El invariante del helper server-side `auth()`; cada módulo DEBE escopar las lecturas a `userId`. No hay row-level security en MVP.                                                               | **Referencia dura** — `transactions` sigue el mismo patrón.                                                                                                                              |

### 2.4. App Router / superficie Hono — dependencia dura

| Archivo                                                                            | Qué provee hoy                                                                                                                                                                                                | Dep. dura / blanda                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `app/api/[...path]/route.ts:7-25`                                                  | El catch-all de Hono se monta en `app/api/[...path]/route.ts`. Forwardea GET/POST/PATCH/DELETE a `honoApp.fetch(request)`. Forzado a `runtime = 'nodejs'` porque `@node-rs/argon2` no carga en Edge.          | **Dura** — `transactions` NO agrega su propio archivo de ruta. Se monta dentro de la sub-app protegida existente. |
| `src/modules/api/app.ts:222-306`                                                   | Las 7 rutas de accounts se montan acá como `protectedApp.get/post/patch(...)`. El patrón es idéntico para cualquier capability futura.                                                                        | **Referencia dura** — `transactions` sigue la misma forma (acción → mapper → `c.json`).                           |
| `src/modules/api/app.ts:317-352`                                                   | `buildDefaultDeps()` construye el grafo DI al startup: `authService`, `authjsAuth`, `fxRateProvider`. La sub-app protegida NO recibe `user`; lee `c.get('user')`.                                             | **Dura** — `transactions` agrega un nuevo servicio + repositorio al grafo DI.                                     |
| `proxy.ts:24-72`                                                                   | El proxy de Next.js hace 307-redirect de páginas App Router no autenticadas a `/auth/signin?callbackUrl=...`. `PUBLIC_PATHS` es la única fuente de verdad; el matcher excluye `_next`, `api` y `favicon.ico`. | **Dura** — cualquier nueva página `/transactions/*` NO debe agregarse a `PUBLIC_PATHS` (requiere auth).           |
| `app/accounts/page.tsx`, `app/accounts/new/page.tsx`, `app/accounts/[id]/page.tsx` | Las 3 páginas de smoke UI. Cada header lleva el comentario `// smoke-minimal, not production` según BR-ACC §"Smoke UI is NOT production UI".                                                                  | **Referencia blanda** — la smoke UI de `transactions` refleja el patrón.                                          |

### 2.5. Esquema Prisma — dependencia dura (capa de almacenamiento)

| Archivo                           | Qué provee hoy                                                                                                                      | Dep. dura / blanda                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma:10-18`      | `provider = "postgresql"`; sin `url` en el schema (Prisma 7 lo lee desde `prisma.config.ts`).                                       | **Dura** — el nuevo modelo `Transaction` vive en el mismo archivo.                                                                                        |
| `prisma/migrations/` (directorio) | Todas las migraciones caen acá. `accounts-ledger` envió `add_financial_account`; `fx-cache` envió `add_account_fx_casa`.            | **Dura** — `transactions` envía al menos una migración. La migración DEBE ser aditiva (sin cambios destructivos de columnas en un backlog multi-feature). |
| `src/shared/db/prisma.ts:26-35`   | Singleton lazy `prisma()`; Prisma 7 con `@prisma/adapter-pg`. `setPrismaClient()` y `__resetPrismaForTests()` son costuras de test. | **Dura** — las implementaciones de repositorio consumen el mismo singleton.                                                                               |
| `src/shared/db/prisma-types.ts`   | Cast estructural `asPrismaDelegateView()` (evita `as any`).                                                                         | **Dura** — los ports de repositorio usan esto para mantener los imports estrechos.                                                                        |

### 2.6. Infraestructura compartida

| Archivo                                       | Qué provee hoy                                                                                                                                                                                                         | Dep. dura / blanda                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/errors/app-error.ts:20-35`        | `AppError` con `code`, `statusCode`, `message`, `details`, `cause`.                                                                                                                                                    | **Dura** — `transactions` lanza `AppError` para fallas de dominio (p.ej. `NAME_TAKEN`, `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`).                                                         |
| `src/shared/errors/error-codes.ts:12-43`      | Enum `ErrorCode` (`VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `NAME_TAKEN`, `FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`, `RATE_LIMITED`, `INTERNAL_ERROR`, …). Mapa `ErrorStatus` en líneas 52-66.                       | **Dura** — `transactions` reusa los códigos existentes cuando es posible; **nuevos códigos** (p.ej. `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`) se agregan a este enum. |
| `src/shared/env/env.schema.ts:25-106`         | Env validado con Zod: `NODE_ENV`, `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `SENTRY_DSN`, `DOLAR_API_BASE_URL` (opcional), `FX_DEFAULT_CASA` (opcional, enum lowercase).   | **Dura** — `transactions` puede agregar nuevas env vars (p.ej. `ATTACHMENTS_DIR`, `MAX_ATTACHMENT_BYTES`); cada nueva var se agrega acá con una regla Zod.                                   |
| `src/shared/events/event-dispatcher.ts:33-65` | Pub/sub in-process `EventDispatcher` con payloads `UserRegistered` y `UserSignedIn` (líneas 4-18). Singleton process-wide `dispatcher`.                                                                                | **Dura** — `transactions` PUEDE emitir un evento `TransactionRecorded` (ver DG-TX-N abajo); usa el mismo dispatcher.                                                                         |
| `src/shared/rate-limit/rate-limit.ts:39-94`   | Sliding window de Upstash Ratelimit; no-op gateado por env vars cuando faltan `UPSTASH_REDIS_REST_URL` / `TOKEN`. Usado por `/api/auth/register` y `/api/auth/callback/credentials`.                                   | **Blanda** — `transactions` puede hacer rate limit en endpoints de import bulk (fuera del scope v1) o como safety de creación en ráfaga.                                                     |
| `src/shared/logger/logger.ts`                 | Logger estructurado con reglas de captura de Sentry. Los eventos `fx.cache.*`, `fx.stale.refresh`, `event_subscriber_threw` ya están definidos.                                                                        | **Dura** — `transactions` emite `transactions.create`, `transactions.update`, `transactions.delete`, `transactions.fx.convert`, `attachments.upload`.                                        |
| `src/shared/clock/clock.port.ts:22-24`        | Interfaz `Clock` con `now(): Date`. `systemClock` vive en `src/shared/clock/system-clock.ts`.                                                                                                                          | **Dura** — cada servicio depende de `Clock` por `architecture-standards`; no se permite `new Date()` en dominio.                                                                             |
| `src/shared/http/error-handler.ts:34-103`     | Handler central de errores de Hono. Mapea `AppError` a `{ error: { code, message, details? } }`, `RateLimitError` a `429` con `Retry-After`, errores desconocidos a `500 INTERNAL_ERROR`. Unión de status en línea 18. | **Dura** — `transactions` no agrega ningún mapeo nuevo; los códigos existentes alcanzan.                                                                                                     |

### 2.7. Proceso OpenSpec — meta dependencia

| Archivo                                                                                                             | Qué provee hoy                                                                                                                                                                                                                                 | Dep. dura / blanda                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/AGENTS.md:42-67`                                                                                          | **Regla de autoría:** `**Autor**: Sebastián Illa` únicamente — sin atribución a IA, sin formas de co-autor, sin calificativos "con ayuda de IA". El `reviewer` valida esto en cada PR. El mirror en español lleva `**Autor**: Sebastián Illa`. | **Dura** — cada artefacto Markdown de este cambio DEBE usar ese header.                                                                                                             |
| `openspec/config.yaml`                                                                                              | `schema: spec-driven`, `artifactStore: both`, lista de capabilities (`auth`, `accounts`, `transactions`, `fx`, `snapshots`, `reports`, `ui`), `strictTdd.enabled: true`, runner `pnpm test`.                                                   | **Dura** — `transactions` es la tercera capability para escribir un delta spec; el slot ya existe.                                                                                  |
| `openspec/changes/_template/proposal.md` (inglés) y `Documents-es/openspec/changes/_template/proposal.md` (español) | La plantilla de propuesta. `sdd-propose` la lee para las secciones.                                                                                                                                                                            | **Blanda** — `sdd-propose` la lee; esta fase no.                                                                                                                                    |
| `openspec/specs/`                                                                                                   | El árbol canónico de specs. Solo `accounts`, `auth`, `fx` están escritos; `transactions`, `snapshots`, `reports`, `ui` son slots reservados.                                                                                                   | **Dura** — `transactions` escribe un delta spec en `openspec/changes/transactions/specs/transactions/spec.md`; el archive step lo promueve a `openspec/specs/transactions/spec.md`. |

## 3. Costuras reutilizables

Funciones concretas, ports, DTOs, test helpers y fixtures que
el código nuevo puede importar o usar como modelo. Cada
entrada se verifica leyendo el archivo citado.

### 3.1. Ports (interfaces) para consumir o espejar

- **`AccountRepositoryPort`** —
  `src/modules/accounts/domain/interfaces/account.repository.port.ts`.
  Declara `findById`, `create`, `update`, `archive`,
  `unarchive`, `list`, `count`. **Modelar
  `TransactionRepositoryPort` a partir de este** (4-5 métodos,
  sin leakage de DTO).
- **`FxRateProvider`** —
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts:90-100`.
  `getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult>`.
  **Ya lo importa `accounts`** — `transactions` reusa la misma
  interfaz sin cambios.
- **`Clock`** — `src/shared/clock/clock.port.ts:22-24`. Interfaz
  de un método. Inyectar en cada servicio.
- **`FxRateCachePort`** — `src/modules/fx/domain/ports/fx-rate-cache.port.ts`.
  Lo usa `FxRateProviderDolarApi`; no es directamente relevante
  para `transactions` pero vale la pena marcarlo si más
  adelante se agrega una conversión cacheada por cuenta.

### 3.2. Patrón de acción (Hono → servicio → repositorio)

- La forma canónica de una acción vive en
  `src/modules/accounts/application/actions/create-account.action.ts`
  (archivo completo, 100+ líneas). El patrón es:
  1. Parsear con `safeParse(rawBody)`; si falla devolver
     `zodErrorToActionError(parsed.error)`.
  2. Leer `userId` del contexto de Hono (nunca confiar en el body).
  3. Llamar al método del servicio con `(userId, parsedInput)`.
  4. Atrapar `AppError` y devolver `appErrorToActionError(err)`.
  5. Devolver `{ ok: true, data: result }` o `{ ok: false, error: ... }`.
- Archivo helper: `src/modules/accounts/application/actions/_shared.ts`
  exporta `zodErrorToActionError`, `appErrorToActionError`,
  tipo `ActionResult`.
- `src/modules/accounts/application/actions/_narrow.ts` existe
  para narrowing de tipos.

### 3.3. Patrón de validación (unión discriminada con Zod)

- `src/modules/accounts/application/validation/account-create.schema.ts:38-49`
  muestra `openingBalanceSchema = z.discriminatedUnion('mode', [...])`
  con ramas FRESH vs HISTORICAL. **Modelar
  `transactionCreateSchema` a partir de este** cuando haga falta
  la unión discriminada por tipo o por dirección (income / expense
  / transfer).
- `src/modules/accounts/application/validation/account-fx-casa.schema.ts:33-39`
  muestra el puente al enum UPPERCASE de Prisma. **Si la
  `Transaction` carga un campo FX desnormalizado** (DG-TX-3),
  se reusa el mismo `accountFxCasaSchema` (o un paralelo
  `transactionFxCasaSchema`).

### 3.4. Patrón de mapper a DTO

- `src/modules/accounts/application/dto/financial-account-balance.dto.ts:29-45`
  muestra `toBalanceDto(result)` que devuelve `{ native, display,
stale, warnings? }`. El DTO tiene los campos `stale` y
  `warnings` después de que aterrizara `fx-cache`
  (`FinancialAccountBalanceDto` es co-propiedad de `accounts` y
  `fx`).
- `src/modules/accounts/application/dto/financial-account.dto.ts`
  define `toFinancialAccountDto(row)`. **Modelar
  `toTransactionDto(row)` con la misma forma.**

### 3.5. Patrón de repositorio (adapter Prisma)

- `src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts`
  es el único adapter Prisma de `accounts`. Usa
  `asPrismaDelegateView(prisma()).financialAccount` para
  estrechar el cliente Prisma al delegate `financialAccount`
  (`src/shared/db/prisma-types.ts`).
- El adapter traduce `Prisma.PrismaClientKnownRequestError`
  con `code: 'P2002'` a `AppError(NAME_TAKEN)`. **Modelar
  `TransactionRepositoryPrisma` a partir de este** (misma
  traducción `P2002 → NAME_TAKEN` si aplica una unique constraint).

### 3.6. Test helpers y fixtures

- `src/modules/accounts/domain/services/account.service.test.ts`
  usa un `InMemoryAccountRepository` en memoria (leer primero).
  **Construir un fixture `InMemoryTransactionRepository`** para
  los tests a nivel de servicio.
- `src/modules/fx/spec-scenarios.test.ts` muestra cómo el
  módulo `fx` envía "escenarios de spec" como un test de
  integración top-level que ejercita el grafo completo del
  provider (cache + lock + DolarAPI). **La capability
  `transactions` debería enviar un `spec-scenarios.test.ts`
  similar** que recorra los caminos más importantes de CRUD +
  multi-moneda de punta a punta.
- `src/modules/auth/__tests__/security/` (6 archivos) es la
  plantilla para tests de seguridad (timing, origin-check,
  secrets in logs, etc.). `transactions` NO necesita una suite
  de seguridad en v1 — app de un solo usuario, no hay material
  de credenciales en las transacciones.

### 3.7. Schema Zod de env

- `src/shared/env/env.schema.ts:25-106` es la única fuente de
  verdad para las env vars. `transactions` agrega nuevas
  entradas acá (p.ej. `ATTACHMENTS_DIR`, `MAX_ATTACHMENT_BYTES`)
  en lugar de leer `process.env` directamente desde cualquier
  otro lado.

### 3.8. Event dispatcher

- `src/shared/events/event-dispatcher.ts:33-65` es el pub/sub
  in-process. La unión actual de eventos es
  `{ UserRegistered, UserSignedIn }` (líneas 4-6).
  **`TransactionRecorded` se agrega editando esta unión** para
  que los consumidores (p.ej. `reports`, `snapshots`) puedan
  subscribirse.

### 3.9. El call site de conversión FX

- El call site exacto para una conversión está en
  `src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`:
  - Cargar primero la fila de la cuenta (`getById`).
  - Resolver la casa vía `account.casa ?? deps.defaultCasa ?? 'oficial'`.
  - Normalizar UPPERCASE → lowercase vía el mapa
    `CASA_TO_LOWERCASE` (líneas 58-65).
  - Llamar a `accountService.getBalance(userId, id, displayCurrency, resolvedCasa)`.
  - **La capability `transactions` reusa exactamente este
    patrón** para cualquier superficie "mostrar monto en casa
    de la cuenta".

## 4. Vacíos y desconocidos

Lo que falta en el codebase para soportar v1 de `transactions`.
Cada entrada está apoyada en una búsqueda de código; nada se
inventa.

### 4.1. No hay modelo `Transaction` (Prisma)

- `prisma/schema.prisma` (219 líneas, archivo completo) define
  `User`, `Account`, `Session`, `VerificationToken`,
  `FinancialAccount` y 6 enums. **No existe ningún modelo
  `Transaction`.** El Slice 1 envía el modelo + la migración.
- No hay tabla `TransactionCategory`, no hay tabla `Attachment`,
  no hay tabla `RecurrenceRule`. **Las cuatro tablas faltan.**

### 4.2. No hay storage de `attachments`

- No hay modelo `Attachment`; no hay clave de cache
  `gastos-personales:attachments:*`; no hay env var
  `ATTACHMENTS_DIR` en `src/shared/env/env.schema.ts:25-106`
  ni en `.env.example`.
- No hay port `AttachmentStorage`, no hay adapter de LocalDisk
  ni de S3.
- La infraestructura es aditiva: el Slice 2 de `transactions`
  envía el port, el adapter de disco local, la migración y la
  env var.

### 4.3. No hay motor de recurrencia / scheduler

- No hay modelo `RecurrenceRule`, no hay worker Cron, no hay
  dependencia `node-cron` / `bullmq` en `package.json` (hace
  falta un grep sobre package.json para confirmar — marcado
  abajo).
- `fx-cache` ya difirió el warmup con Cron (su spec en
  líneas 102-106). La recurrencia de `transactions` se difiere
  de forma similar al Slice 3 sin worker en v1.

### 4.4. No hay tabla de categorías ni seed data

- No hay tabla `TransactionCategory`. No hay archivo de seed
  bajo `prisma/seed.ts` ni `prisma/seed/`.
- El patrón de `account-create.schema.ts` en
  `src/modules/accounts/application/validation/account-create.schema.ts:65-129`
  muestra una unión discriminada por campos por-tipo. El mismo
  patrón se usa para `Transaction` si `category` se vuelve un
  string libre (DG-TX-4) o un enum tipado.

### 4.5. No hay primitiva de `idempotency-key`

- No hay modelo `IdempotencyKey`, no hay tabla
  `idempotency_keys`, no hay middleware que lea el header
  `Idempotency-Key` de la request.
- Un `@@unique` de Prisma sobre una clave provista por el
  cliente es el camino más barato; DG-TX-9 lo plantea como
  decisión.

### 4.6. No hay schemas Zod base (currency, money, datetime)

- Currency se valida por llamada contra el
  `accountCurrencySchema` inline en
  `src/modules/accounts/application/validation/account-create.schema.ts:32-36`.
  **No hay un `currencySchema` compartido en `src/shared/`**
  para reusar entre módulos.
- Money (minor units, signed/unsigned) también está inline.
  `transactions` envía un `moneySchema` si las reglas por-tipo
  divergen de `accounts` (p.ej. montos negativos para income).
- Datetime: el único ejemplo es
  `date: z.coerce.date()` en la rama `HISTORICAL` de
  `accountCreateSchema` (línea 47). No hay `transactionDateSchema`
  compartido.

### 4.7. No hay evento para `TransactionRecorded`

- `src/shared/events/event-dispatcher.ts:4-6` declara la unión
  `{ UserRegistered, UserSignedIn }`. Agregar
  `TransactionRecorded` es una edición de una línea, pero
  implica que `transactions` es dueño de la superficie de
  contrato cross-module para cualquier consumidor
  downstream (`reports`, `snapshots`).

### 4.8. No hay política de rate-limit para endpoints de `transactions`

- `src/shared/rate-limit/rate-limit.ts:50-58` muestra el
  sliding window de Upstash (5 intentos / 60 s por defecto).
  `transactions` puede NO necesitar un rate limit (el CRUD
  manual no es propenso a ráfagas), pero un endpoint de import
  bulk (fuera de v1) sí lo necesitaría.

### 4.9. No hay superficie de "roll-up de balance"

- `get-account-balance.action.ts` devuelve el balance nativo
  - display de UNA cuenta. No hay
    `get-portfolio-balance.action.ts` (suma entre cuentas en
    moneda de display). Esto es territorio de `snapshots` o
    `reports` y está FUERA del scope v1.

### 4.10. No hay precedente de "soft delete + columnas de auditoría" para `transactions`

- `FinancialAccount` usa `archivedAt: DateTime?` (soft archive,
  sin audit log separado). `User` usa `createdAt` / `updatedAt`
  vía `@default(now())` / `@updatedAt`.
- Para `Transaction`, la decisión de auditoría (DG-TX-1) está
  abierta: ¿agregamos `createdBy`, `updatedBy`, `deletedAt`, o
  seguimos el patrón `archivedAt`? `accounts` NO tiene
  `createdBy`/`updatedBy` (el schema Prisma en líneas 211-212
  solo tiene timestamps).

### 4.11. No hay enforcement de `IdempotencyKey` en la capa de acción

- `create-account.action.ts` llama a `repo.create(userId, input)`
  sin hook de idempotencia. Un retry del cliente crea un
  duplicado. El mismo riesgo aplica a `transactions`. DG-TX-9
  lo plantea.

### 4.12. No hay regla de "transfer entre cuentas"

- El módulo `accounts` es un modelo de cuenta única (una fila
  por cuenta, sin `parentAccountId` ni tabla `transfers`). Una
  `Transaction` que mueve dinero entre dos cuentas es un patrón
  NUEVO. DG-TX-2 lo plantea como decisión.

### 4.13. No hay smoke slice de UI para `transactions`

- `app/accounts/{page.tsx,new/page.tsx,[id]/page.tsx` existen.
  No hay páginas `app/transactions/*`. El Slice 1 puede o no
  enviar una smoke UI; `accounts-ledger` v3 eligió enviar una
  porque la API era lo más difícil de validar. `transactions`
  tiene la misma forma — CRUD manual — y probablemente se
  beneficie de un slice de smoke.

### 4.14. No hay hook de CI para drift de `Documents-es/`

- El `pre-commit` de Husky en `.husky/pre-commit` corre
  `gga run` + `lint-staged` + un check de drift de
  `pnpm-lock.yaml` (`scripts/check-lockfile.sh`). **No hay
  check automatizado que el Markdown inglés + el mirror en
  `Documents-es/` se mantengan en sync.** El drift lo detecta el
  `reviewer` o manualmente según la política §13.3 del
  `AGENTS.md` raíz. Marcado como riesgo para cualquier cambio
  con mucha carga documental.

## 5. Riesgos adyacentes

Fragilidad o gotchas conocidos en el área que el cambio va a
tocar.

### 5.1. Strict TDD está ON (`openspec/config.yaml:27-30`)

- `strictTdd.enabled: true` y el runner es `pnpm test`.
- `transactions` sigue el ciclo RED → GREEN → REFACTOR por
  tarea en `tasks.md`. **Saltarse el paso RED hace fallar al
  reviewer.** Esto es vinculante según el contrato global; el
  orquestador lo va a hacer cumplir.

### 5.2. Adapter Prisma encriptado (`OAUTH_TOKEN_ENCRYPTION_KEY`)

- `prisma/schema.prisma:50-58` documenta que los tokens OAuth
  están encriptados con AES-256-GCM vía
  `src/modules/auth/infrastructure/adapters/encrypted-prisma-adapter.ts`.
- **Solo las filas de `Account` están encriptadas** —
  `refresh_token`, `access_token`, `id_token`. Las filas de
  `Transaction` NO se encriptan. No hay precedente para
  encriptar filas relacionadas con dinero; si un futuro cambio
  de "importación bancaria" aterriza, hay que diseñar la
  superficie de encriptación para transacciones (campo memo,
  strings con PII) — fuera del scope v1.

### 5.3. Gate de pre-commit GGA

- `.husky/pre-commit` corre `pnpm dlx lint-staged && gga run`
  más `scripts/check-lockfile.sh` por la política de
  `pnpm-lock.yaml` (`AGENTS.md` raíz §5.3).
- Si se stagea `package.json` y no se stagea `pnpm-lock.yaml`,
  el commit falla. El orquestador es dueño del loop build/test
  según el prompt; el worker que aplique el cambio debe correr
  `pnpm install` después de cualquier edición a `package.json`
  y stagear el lockfile en el mismo commit.

### 5.4. Forma de logging en Sentry

- `src/shared/logger/logger.ts` captura eventos estructurados.
  El módulo `fx` emite `fx.cache.hit`, `fx.cache.miss`,
  `fx.stale.refresh` (ver `fx-rate-provider.dolar-api.ts:66-128`).
- `transactions` sigue la misma convención: `transactions.create`,
  `transactions.update`, `transactions.delete`,
  `transactions.fx.convert`. El logger strippea PII según
  `BR-AUTH-11` (passwords, tokens). Las filas de transacción
  no llevan PII en v1 — `memo` es un string libre; si alguna
  vez lleva PII hay que extender la lista de strip.

### 5.5. Multi-tenancy (usuario único)

- `gastos-personales` es de un solo usuario según el skill
  `architecture-standards`. Cada endpoint escopa a `userId` (sin
  row-level security en MVP según `auth/spec.md:644-647`).
- `transactions` sigue el mismo patrón. No hay riesgo nuevo.

### 5.6. Restricción de runtime del catch-all de Hono

- `app/api/[...path]/route.ts:18-25` está forzado a
  `runtime = 'nodejs'` porque `@node-rs/argon2` no carga en
  Edge. `transactions` agrega rutas DENTRO de la sub-app
  protegida — sin archivo de ruta nuevo, sin conflicto de
  runtime.

### 5.7. Matcher de `proxy.ts`

- `proxy.ts:75` excluye `api/*` del matcher. El proxy solo
  redirige PÁGINAS del App Router (p.ej. `/transactions`,
  `/transactions/[id]`). Las nuevas páginas de transacciones
  NO deben agregarse a `PUBLIC_PATHS` (líneas 24-32); el 307
  redirect a `/auth/signin` es la puerta de auth.

### 5.8. El invariante de 7 exports en `auth/index.ts`

- `src/modules/auth/index.ts:18-20` exporta 7 símbolos. El check
  en tiempo de compilación lo asegura
  `src/modules/auth/index.test.ts`.
- `transactions/index.ts` DEBERÍA seguir la misma convención
  de barrel mínimo: ports de dominio + value objects +
  `TransactionService` + constantes de enum; nada de
  infraestructura.

### 5.9. Aislamiento de módulos

- El `AGENTS.md` raíz §10.5 declara "Un módulo NO importa
  directamente desde otro módulo." Las referencias cross-module
  pasan por `src/shared/events/` o por el barrel público.
- `transactions` NO debe importar de `fx` directamente. Importa
  `FxRateProvider` desde `@/modules/accounts` (el port vive
  ahí). Importa `fxCasaStringSchema` desde `@/modules/fx`
  solo si la normalización FX ocurre en la frontera de
  transacción — si no, el value object vive en `accounts` y se
  espeja según la tupla `FX_CASAS` existente en
  `fx-rate-provider.port.ts:52`.

### 5.10. La regla de atomicidad §13.3 de doble idioma

- El `AGENTS.md` raíz §13.3 (y el `openspec/AGENTS.md:13.1` a
  nivel de proyecto): cada Markdown inglés creado o editado
  envía el mirror en español en el MISMO commit.
- El `reviewer` busca debris de caracteres chinos según la
  regla de mirror del AGENTS.md raíz. `transactions` sigue lo
  mismo.

### 5.11. La regla del header de autoría

- `openspec/AGENTS.md:42-67` exige `**Autor**: Sebastián Illa`
  únicamente. Prohibido: `IA`, `Claude`, `GPT`, "con ayuda de
  IA", `Co-authored-by: …` en los commits. Cada artefacto
  Markdown de este cambio lleva ese header.

## 6. Decisiones abiertas (DG-TX-N)

El orquestador cerrará estas con el usuario antes de
`sdd-propose`. La lista combina las sugerencias del prompt de
lanzamiento con lo que el codebase expuso.

### DG-TX-1 — Forma del agregado `Transaction`

- **Campos.** Mínimo: `id`, `userId`, `accountId`, `direction`
  (INCOME / EXPENSE / TRANSFER), `amountMinor` (Int, signed;
  positivo para income, negativo para expense), `currency`
  (`AccountCurrency`), `categoryId | category`, `memo`,
  `transactionDate`, `createdAt`, `updatedAt`. Opcionales:
  `attachments[]`, `recurrenceId | null`.
- **Soft vs hard delete.** `accounts` usa `archivedAt` (soft).
  `transactions` PUEDE seguir el mismo patrón, O usar hard
  delete sin recuperación. Columnas de auditoría: `createdBy` /
  `updatedBy` NO están en el schema de `accounts` —
  `transactions` tiene la opción de introducirlas.
- **La decisión**: qué campos son requeridos, cuáles son
  nullable, y si el borrado es soft o hard.

### DG-TX-2 — Relación con `FinancialAccount`

- **FK simple** a un `FinancialAccount.id` (la mayoría de los
  endpoints CRUD).
- **Transfer** = un caso especial donde UNA transacción lógica
  afecta DOS cuentas (débito + crédito). Formas posibles:
  - (a) Dos filas de `Transaction` vinculadas por
    `transferGroupId` (join parent-child).
  - (b) Una entidad `Transfer` de primera clase con
    `fromAccountId` y `toAccountId` (agregado separado).
  - (c) Diferir transfers a v1.1; v1 es solo cuenta única.
- **La decisión**: cómo se representa un transfer entre dos
  cuentas en v1, o si v1 es solo cuenta única.

### DG-TX-3 — Semántica multi-moneda

Tres opciones que el codebase ya anticipa:

- **(a) Guardar solo el original; recalcular al leer.** La fila
  nativa tiene `{ amountMinor, currency }`. La conversión de
  display llama a `FxRateProvider` en cada lectura. Pros: una
  sola fuente de verdad, sin problema de tasa stale en storage.
  Contras: los totales de balance dependen de la tasa al
  momento de lectura.
- **(b) Snapshot al momento de escritura.** Cada `Transaction`
  carga `{ amountMinor, currency, fxRateSnapshot,
fxAsOfSnapshot, casaSnapshot }` cuando se escribe en una
  moneda distinta a la casa de la cuenta. Pros: balances
  históricos determinísticos. Contras: mucho almacenamiento en
  períodos de alta inflación; la línea 96-98 de la spec de
  `fx-cache` lo contempla explícitamente como opción futura.
- **(c) Ambos.** Guardar el original Y el monto convertido al
  leer (cacheado en la fila por 1 h). Pros: latencia de
  lectura. Contras: costo de almacenamiento; complejidad de
  reconciliación.

La spec de `fx-cache` en líneas 96-98 insinúa que **(b) es el
camino elegido para v1** ("a future `transactions` capability
MAY store the FX rate used at write time on each transaction
row"). **La decisión**: confirmar (b) para v1, o elegir (a)/(c).

### DG-TX-4 — Modelo de categoría

- (a) Tabla `TransactionCategory` de primera clase con FK
  `userId` y `name`. Seed con una lista chica por defecto
  (Comida, Transporte, Salario, etc.) en el primer registro.
- (b) String libre (columna `category: string` en
  `Transaction`). Menos fricción; más difícil de filtrar.
- (c) Enum (`TransactionCategory` Prisma enum con valores
  fijos). Rígido; el usuario no puede customizar.
- **La decisión**: qué modelo, y si el seed se auto-popula al
  registrar al usuario.

### DG-TX-5 — Backend de storage de adjuntos (diferido al Slice 2)

El prompt de lanzamiento recomienda **disco local solamente
con una interfaz adapter** para v1, intercambiable a Upstash
/ S3 / R2 más adelante. **La decisión**: confirmar la interfaz
adapter (port `AttachmentStorage` con métodos `put / get /
delete / signUrl`) y la implementación de disco local para dev
/ CI.

### DG-TX-6 — Modelo de recurrencia (diferido al Slice 3)

- (a) A nivel de dominio: "mensual el día 15", "semanal los
  martes", etc. El motor resuelve "próxima corrida"
  determinísticamente.
- (b) String iCal RRULE. Pros: estándar. Contras: dependencia
  de parser.
- (c) Expresión Cron. Pros: poderoso. Contras: opaco para no
  ingenieros.
- (d) Las instancias generadas son filas NUEVAS con FK
  `recurrenceTemplateId: string | null`.
- **La decisión**: qué representación, y cómo se relacionan
  las instancias generadas con el template (FK + idempotency
  key).

### DG-TX-7 — Dónde corre la recurrencia

- (a) Generación on-demand en la carga del dashboard. Cutoff
  para v1.
- (b) Función programada de Next.js (cron en `vercel.json`).
- (c) Worker externo (BullMQ, servicio separado).
- **La decisión**: (a) para v1; (b)/(c) están fuera del scope.

### DG-TX-8 — Redondeo autoritativo

- La línea `fx-rate-provider.dolar-api.ts:158` usa
  `(amount / 100) * fxRate` — sin redondeo explícito. El DTO
  manda `amount: number` por el wire.
- Para montos en minor units (centavos) la convención es
  half-up a 2 decimales. **La decisión**: confirmar half-up a
  2 decimales para display; marcar si ya existe una
  convención distinta en algún cambio próximo de `reports`.

### DG-TX-9 — Idempotencia para create

- (a) `idempotencyKey` provista por el cliente (header o campo
  en el body). `@@unique` de Prisma sobre
  `(userId, idempotencyKey)`. Un retry devuelve la fila
  original.
- (b) Llamada atómica Prisma del lado del servidor con
  wrapper de transacción. Un retry PUEDE crear un duplicado en
  falla parcial.
- (c) Sin idempotencia; los clientes reintentan en `5xx` y
  aceptan duplicados potenciales. La UI muestra un hint
  "¿salió bien esto?".
- **La decisión**: qué capa enforceza la unicidad y cómo la
  expone al cliente.

### DG-TX-10 — Permisos

- La app es de un solo usuario según `auth/spec.md:644-647`.
  Cada fila escopa a `userId`; sin row-level security.
- (a) Sin "cuenta compartida" / visor read-only en v1.
- (b) Un v1.1 futuro podría agregar un permiso `viewer`
  (link de solo lectura a una cuenta específica).
- **La decisión**: confirmar que v1 es single-user únicamente.

### DG-TX-11 — Campo `memo` / descripción

- `accounts` no tiene equivalente. `Transaction.memo` es un
  string libre.
- (a) Libre, sin validación, máximo 500 chars.
- (b) Requerido + mínimo 1 char (enforceza higiene de
  journaling).
- (c) Opcional con forma normalizada search-friendly.
- **La decisión**: requerido vs opcional, largo máximo,
  guía de PII (un memo podría contener el nombre de una
  persona — marcado para la lista de strip del logger).

### DG-TX-12 — Enum `direction` de `Transaction`

- INCOME / EXPENSE / TRANSFER. TRANSFER es el caso
  cross-cuenta de DG-TX-2.
- **La decisión**: confirmar el enum y la regla
  `sign(amountMinor)` (positivo = income, negativo = expense;
  o sin signo con campo `direction`).

### DG-TX-13 — Validación: transacciones con fecha futura

- (a) Permitir cualquier `transactionDate` (pasado o futuro —
  para pagos programados).
- (b) Rechazar fechas futuras con `400 VALIDATION_ERROR`.
- (c) Permitir fechas futuras SOLO cuando
  `recurrenceTemplateId` no sea null (programadas pero todavía
  no posteadas).
- **La decisión**: qué regla.

### DG-TX-14 — Paginación de la lista de transacciones

- `list-accounts.action.ts` usa paginación cursor
  (`?cursor=...&limit=...`). **La decisión**: misma forma para
  `/api/transactions`.

### DG-TX-15 — Política de soft delete para `Transaction`

- `accounts` hace soft-archive con `archivedAt: DateTime?`. El
  listado filtra `archivedAt: null`.
- (a) Espejar `accounts` — soft delete con `archivedAt`.
- (b) Hard delete (sin recuperación; la fila se va).
- **La decisión**: qué política.

## 7. Riesgos y no-objetivos

Qué NO construimos explícitamente en v1. La frontera entre
v1, v1.1 y v2.

### 7.1. No-objetivos v1 (NO construir)

- **Importación bancaria / CSV upload.** Fuera de v1. Un
  endpoint de import bulk es candidato a v1.1 (rate-limited,
  requiere idempotency-key).
- **OCR en recibos.** Fuera de v1.
- **Push notifications** (p.ej. "excediste tu presupuesto de
  Comida este mes"). Fuera de v1.
- **Multi-user / cuentas compartidas.** Fuera de v1.
- **App mobile.** Fuera de v1.
- **Background workers / BullMQ.** Fuera de v1. La recurrencia
  es generación on-demand (DG-TX-7).
- **Escaneo de recibos desde mobile.** Fuera de v1.
- **Archivo histórico de FX para transacciones back-dated.**
  Fuera de v1. El snapshot de DolarAPI al momento de escritura
  (opción b de DG-TX-3) NO incluye un lookup de tasa
  back-dated; la tasa es la del momento de la escritura.
- **Categorización con IA de transacciones.** Fuera de v1.
- **Reglas de presupuesto / límites de gasto.** Fuera de v1
  (territorio de `reports`).

### 7.2. Candidatos a v1.1

- Generación de recurrencia vía cron / función programada.
- Transfer entre cuentas (forma (a)/(b) de DG-TX-2).
- Importación CSV bancaria.
- Visor read-only de cuenta compartida.

### 7.3. Candidatos a v2

- Integración bancaria con OAuth (estilo Plaid).
- App mobile.
- Categorización con IA.

### 7.4. Riesgos

| Riesgo                                                                                                                             | Probabilidad | Mitigación                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| La tabla `transactions` crece sin tope; la estrategia de paginación + índices debe estar en v1                                     | Media        | Paginación cursor + `@@index([userId, transactionDate])`. Espeja `accounts` `@@index([userId, createdAt])`.             |
| El snapshot FX al escribir (opción b de DG-TX-3) se desincroniza de la tasa actual                                                 | Baja         | Cargar `fxAsOfSnapshot` en la fila para que la UI muestre "tasa al <fecha>".                                            |
| El swap de backend de adjuntos rompe el contrato                                                                                   | Baja         | Interfaz adapter (port `AttachmentStorage`) + tests que hacen swap del adapter; producción arranca solo en disco local. |
| El modelo de recurrencia en DG-TX-6 (a)/(b)/(c) genera un dolor de cabeza de migración si la representación elegida cambia después | Media        | Diferir la recurrencia al Slice 3; la elección del modelo tiene tiempo para definirse.                                  |
| Colisiones de idempotency key entre usuarios                                                                                       | Baja         | Unique constraint sobre `(userId, idempotencyKey)` — namespacing por usuario.                                           |
| PII en el campo `memo` se filtra a los logs                                                                                        | Baja         | Agregar `memo` a la denylist del logger; la regla de strip de secretos de `BR-AUTH-11` es la superficie de contrato.    |
| El mirror en español se desincroniza del original en inglés                                                                        | Media        | Aplicar la atomicidad de §13.3; el `reviewer` valida ambos archivos en el mismo commit.                                 |
| Se salta el paso RED de strict TDD y falla el reviewer                                                                             | Media        | La fase `sdd-tasks` es dueña de la estructura de tareas; `sdd-apply` enforceza RED → GREEN → REFACTOR por tarea.        |

## 8. Plan de slices recomendado

**Orientativo; `sdd-tasks` define el final.** Cada slice
apunta a ≤ 400 líneas por PR según el budget global
(`AGENTS.md` raíz §10.5).

### Slice 1 — `transactions-core`

**Objetivo:** agregado `Transaction` + CRUD + multi-moneda vía `fx`.

- Nuevo modelo Prisma `Transaction` con `userId`, `accountId`,
  `direction`, `amountMinor`, `currency`, `transactionDate`,
  `memo`, `createdAt`, `updatedAt`. Migración no destructiva.
  Índices `@@index([userId, transactionDate])` y
  `@@index([accountId, transactionDate])`.
- Nuevo módulo `src/modules/transactions/`:
  `domain/entities/transaction.ts`,
  `domain/interfaces/transaction.repository.port.ts`,
  `domain/services/transaction.service.ts`,
  `application/actions/{list,get,create,update,delete}-transaction.action.ts`,
  `application/dto/transaction.dto.ts`,
  `application/validation/transaction-create.schema.ts`,
  `infrastructure/repositories/transaction.repository.prisma.ts`.
- 7 rutas Hono bajo `/api/transactions`:
  `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`,
  `GET /:id/balance?displayCurrency=...` (usa `FxRateProvider`),
  `GET /account/:accountId` (listado filtrado).
- Wiring DI en `src/modules/api/app.ts:317` (`buildDefaultDeps`).
- Smoke UI: `app/transactions/page.tsx`,
  `app/transactions/new/page.tsx`,
  `app/transactions/[id]/page.tsx` — smoke-minimal según el
  patrón de `accounts`.
- **~600 líneas estimadas** (el slice más grande; esperar
  auto-chain por la regla de 400 líneas). Split en PR-1A
  (entidad + repo + servicio + tests), PR-1B (rutas Hono + DI
  - smoke UI).

### Slice 2 — `transactions-attachments`

- Nuevo modelo Prisma `Attachment` con FK `transactionId`,
  `filename`, `mimeType`, `sizeBytes`, `storageKey`, `createdAt`.
- Port `AttachmentStorage` + adapter `LocalDiskAttachmentStorage`.
  Env var `ATTACHMENTS_DIR` en `src/shared/env/env.schema.ts`.
- Nuevas rutas Hono bajo `/api/transactions/:id/attachments`:
  `GET` (listar), `POST` (upload — multipart/form-data), `DELETE`.
- Nuevo schema Zod `attachment-create.schema.ts` con whitelist
  de `mimeType` (image/png, image/jpeg, application/pdf) +
  `sizeBytes` máximo.
- **~350 líneas estimadas**.

### Slice 3 — `transactions-recurrence`

- Nuevo modelo Prisma `RecurrenceRule` con FK `transactionId`,
  `frequency` (DAILY / WEEKLY / MONTHLY), `interval`, `byDay`,
  `byMonthDay`, `endsAt`.
- Generación on-demand: una server action
  `generate-due-transactions.action.ts` recorre las reglas y
  crea las instancias de los períodos perdidos. Se llama en la
  carga del dashboard.
- Idempotencia: `recurrenceKey` en cada fila generada
  (`{templateId, dueDate}`).
- **~400 líneas estimadas**.

### Slice 4 — `transactions-ui` (opcional, después de que Slice 1 aterrice)

- UI de calidad de producción reemplazando las páginas smoke.
- Filtros, gráficos, export a CSV.
- **Fuera de v1** salvo que el usuario lo pida explícitamente.

### Rationale del orden

- Slice 1 primero: bloqueado por el usuario. El scope
  bloqueado dice "Slice 1 = entidad + CRUD + multi-moneda
  PRIMERO; adjuntos y recurrencia vienen DESPUÉS de que el
  Slice 1 aterrice." El
  `fx-rate-provider.port.ts` ya está en `accounts`; no hace
  falta cambio de port para el Slice 1.
- Slice 2 antes que Slice 3: los adjuntos son un cambio de
  schema aditivo (sin filas generadas, sin scheduler). La
  recurrencia toca la ruta de escritura (generación de
  instancias). Intercalar adjuntos primero mantiene el diff
  de cada slice chico.
- Slice 3 al final: la recurrencia es el slice más complejo
  (filas generadas, idempotencia, motor on-demand). Diferirla
  compra tiempo para asentar el modelo (DG-TX-6).

## 9. Preguntas abiertas para el usuario

Estas NO están cubiertas por la lista de DG-TX de arriba. El
orquestador las planteará en el grill de pre-propose. **A lo
sumo 4 preguntas, en orden.**

1. **¿V1 debería enviar una smoke UI para `transactions`?** El
   v3 de `accounts-ledger` eligió enviar una porque el CRUD
   manual es lo más difícil de validar de punta a punta sin
   curl. `transactions` tiene la misma forma. Confirmar sí
   (smoke UI en el Slice 1) o no (solo API; la smoke UI se
   difiere a un cambio separado `transactions-ui`).

2. **¿Cuál es la semántica multi-moneda en una fila de
   `Transaction`** (DG-TX-3)? Las tres opciones son mutuamente
   excluyentes: solo-store-original / snapshot-al-escribir /
   ambos. La spec de `fx-cache` insinúa snapshot-al-escribir,
   pero no es vinculante.

3. **¿El `transfer` entre dos cuentas va en v1, o en v1.1?**
   (DG-TX-2). v1 solo-cuenta-única es el camino más barato.
   Agregar `transfer` en v1 implica un agregado `Transfer` O
   un link `transferGroupId` + semántica de escritura de dos
   filas de primera clase.

4. **¿`memo` debería llevar una regla de largo mínimo /
   requerido, y hace falta guía de PII?** (DG-TX-11). Un memo
   libre sin reglas es la menor fricción pero pierde
   precisión de búsqueda; una regla requerido + largo mínimo
   es la mayor higiene.

---

## 10. Referencias cruzadas

- **`openspec/specs/accounts/spec.md`** — BR-ACC-12 (contrato
  FX para display), BR-ACC-16 (comportamiento de form),
  BR-ACC-18 (widget de balance). Todos los invariantes
  cross-module para el nuevo cambio.
- **`openspec/specs/fx/spec.md`** — REQ-FX-3 (la resolución
  de casa es responsabilidad del caller), REQ-FX-9 (la
  migración de la columna casa es no destructiva). Ambos
  aplican sin cambios a `transactions`.
- **`openspec/specs/auth/spec.md`** — BR-AUTH-1 (el email es
  el identificador canónico), el invariante del helper
  server-side `auth()`, la superficie pública de 7 exports.
- **`src/modules/accounts/application/actions/get-account-balance.action.ts:67-100`** —
  el call site canónico de conversión a espejar.
- **`src/shared/env/env.schema.ts:25-106`** — el schema de env
  a extender.
- **`src/shared/errors/error-codes.ts:12-43`** — el enum de
  códigos de error a extender.
- **`src/shared/events/event-dispatcher.ts:4-6`** — la unión
  de eventos a extender (para `TransactionRecorded`).
- **`openspec/AGENTS.md:42-67`** — la regla de atribución de
  autoría.
- **El `AGENTS.md` raíz §13** — la política de mirror
  documental en doble idioma. Cada Markdown inglés de este
  cambio envía el mirror en español en el mismo commit.
