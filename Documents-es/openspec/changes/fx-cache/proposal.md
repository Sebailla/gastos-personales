# Propuesta — `fx-cache`

**Estado**: borrador · **Autor**: Sebastián Illa · **Creada**: 2026-06-21
**Slice objetivo**: MVP-1.5 (proveedor FX + caché) · **Reemplaza**: ninguna
**Origen**: preflight global SDD (interactive, both, auto-chain, 400 líneas)
**Lagunas de decisión**: DG-FX-1 a DG-FX-5 **cerradas** (2026-06-21).
Ver [Decisiones cerradas](#decisiones-cerradas-dg-fx-1-a-dg-fx-5--2026-06-21)
abajo para la rationale por gap.

> Primera escritura de la propuesta `fx-cache`. El cambio llena
> el puerto `FxRateProvider` declarado por `accounts-ledger`
> (`src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`),
> entrega un proveedor real respaldado por **DolarAPI**, agrega
> una **caché de 1 hora en Upstash Redis** y expone un camino
> elegante de **fallback con valor stale** para que la smoke UI
> no devuelva 503 cuando DolarAPI no esté disponible. La propuesta
> no introduce EUR/ARS ni múltiples fuentes FX; el puerto
> `FxRateProvider` queda abierto para futuros proveedores.
> **Actualización (2026-06-21):** el cambio ahora también entrega
> selección de casa por cuenta (DG-FX-2 cerrada como
> in-scope). `FinancialAccount` gana una columna nullable `casa
> AccountFxCasa` + un enum Prisma `AccountFxCasa`. Las filas
> existentes migran a `NULL` (heredan el default global
> `oficial`). Un nuevo campo `stale: boolean` en el DTO de
> balance expone el chip de warning en el smoke widget. Un
> `Map<casa, Promise<void>>` por proceso protege contra
> estampidas en arranque en frío. La base URL de DolarAPI va
> hardcoded con override por env var.

## Por qué

`accounts-ledger` ya envió un modelo discriminado
`FinancialAccount` con un contrato de FX de display de sólo
lectura (BR-ACC-12, BR-ACC-13) y una smoke UI funcional bajo
`app/accounts/`. El contrato declara que
`GET /api/accounts/:id/balance?displayCurrency=…` devuelve
`{ native, display, warnings? }` con `fxAsOf` para la frescura.
El `FxRateProvider` es un puerto — `accounts-ledger` no envía
implementación. El stub dentro del cambio
(`src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`)
siempre lanza `AppError(FX_UNAVAILABLE)`, que el
`errorHandler` central mapea a HTTP 503.

La consecuencia para el usuario es concreta: abrir el detalle
de cuenta y enviar el widget de balance muestra el error inline
`"FX rate provider unavailable. Try again in a few minutes."`
(BR-ACC-18). La smoke UI **no es producción**, pero el widget es
el único arnés de prueba end-to-end para el contrato FX, y un
503 en cada click es un bloqueo duro para la validación manual
de los próximos cambios que consuman el puerto (`transactions`,
`reports`).

Dos decisiones de producto dan forma al cambio:

1. **ARS↔USD es el par dominante dentro del alcance** (cotizaciones
   del peso argentino en USD). EUR/ARS no es una cotización
   soportada por DolarAPI y queda fuera de este cambio. El puerto
   `FxRateProvider` no se toca, para que un proveedor futuro
   pueda enchufarse.
2. **DolarAPI no tiene SLA** (API pública gratuita, sin contrato).
   Una caché de 1 hora es la unidad más chica que nos da:
   (a) protección ante ráfagas en un reopen simultáneo (todos los
   usuarios tocan el widget al mismo minuto), (b) fallback con
   valor stale para que el widget siga renderizando un monto
   convertido cuando DolarAPI está caído, y (c) margen para sumar
   más adelante un refresh disparado por Cron sin un refactor.

La caché también es una preocupación transversal: `transactions` y
`reports` necesitarán la misma lógica de conversión y se
beneficiarán de la misma caché. Enviarla como su propia capacidad
(`fx`) — no como una implementación oculta dentro de `accounts` —
es lo que hace posibles los consumidores futuros.

## Qué

Seis cambios llegan en `fx-cache`. El cambio se envía a través
de **tres PRs encadenados** (ver Forecast). Los seis cambios
deben aterrizar antes de que el smoke widget deje de mostrar el
503.

### Cambio 1 — Proveedor DolarAPI

Una implementación real de `FxRateProvider` que habla con
DolarAPI (`https://dolarapi.com/v1`). DolarAPI devuelve
cotizaciones del peso argentino en USD para seis "casas":
`oficial`, `blue`, `mep`, `ccl`, `cripto`, `tarjeta`. Cada casa
trae una tasa `venta` que usamos para la conversión de display
(el usuario convierte balances a una moneda de display, lo que
conceptualmente es una compra de moneda de display; para
ARS↔USD la `venta` es la elección conservadora y coincide con
lo que la smoke UI muestra cuando el usuario piensa en USD).

- Módulo nuevo: `src/modules/fx/` (paralelo a
  `src/modules/accounts/`).
  - `domain/entities/fx-quote.ts` — value object: `{ casa, buy,
    sell, fxAsOf }` con esquema Zod.
  - `domain/ports/dolar-api.port.ts` — puerto para el cliente
    HTTP.
  - `domain/ports/fx-rate-provider-cache.port.ts` — puerto para
    la capa de caché que envuelve al proveedor upstream.
  - `infrastructure/external/dolar-api.client.ts` — cliente
    tipado de DolarAPI usando `fetch` global (Node 20 nativo).
    Base URL hardcoded a `https://dolarapi.com/v1` con override
    `process.env.DOLAR_API_BASE_URL` (BR-FX-8). Validación con
    Zod; no-2xx mapea a `AppError(FX_UNAVAILABLE)` (503).
  - `infrastructure/cache/upstash-fx-rate.cache.ts` — wrapper
    Upstash Redis sobre el cliente DolarAPI. Forma de la clave
    `gastos-personales:fx:ars-usd:<casa>`, valor JSON, TTL 1 h.
  - `infrastructure/external/fx-rate-provider.dolar-api.ts` —
    impl de `FxRateProvider` que combina caché + upstream. El DI
    reemplaza `FxRateProviderUnconfigured` por esta clase.
- **Selección de proveedor** (por cuenta, in-scope — ver
  Cambio 5): el proveedor recibe `account.casa ??
  FX_DEFAULT_CASA` en cada llamada desde la acción. La env
  default a `oficial`. La columna `casa` en `FinancialAccount`
  es el nuevo enum nullable `AccountFxCasa` (Cambio 5).
- El proveedor lee `process.env.UPSTASH_REDIS_REST_URL` y
  `process.env.UPSTASH_REDIS_REST_TOKEN`; cuando falta alguno,
  la capa de caché degrada a no-op (sin Redis, sin error —
  cada llamada va directo a DolarAPI). Refleja el patrón de
  `src/shared/rate-limit/rate-limit.ts`.
- **Lock anti-estampida:** `Map<casa, Promise<void>>` en
  memoria del proceso (Cambio 6). ~5 líneas. Sin coordinación
  cross-process.

### Cambio 2 — Capa de caché (TTL 1 h + fallback stale)

- Camino de lectura: Redis `GET key` → si hay hit y no está
  stale, devolver. Si hay hit y está stale (TTL expirado pero
  valor presente), devolver con `stale: true` en el DTO,
  `warnings: ["FX rate is stale; showing last known value."]`
  Y refrescar en background (Promise fire-and-forget, sin
  bloquear la respuesta).
- Camino de miss: fetch a DolarAPI → Redis `SET key value EX 3600`
  → devolver sin warning, `stale: false`.
- DolarAPI caído en miss: lanzar `AppError(FX_UNAVAILABLE)` (503).
  Esto preserva el contrato: si nunca vimos una tasa, no podemos
  servir una.
- DolarAPI caído en refresh stale: silencioso. La próxima lectura
  stale devuelve el mismo valor con el mismo warning. NO
  relanzamos al usuario.
- Forma de la clave: `gastos-personales:fx:ars-usd:<casa>`. Una
  sola clave por casa. Sin fan-out por request-key (la caché es
  global, no por usuario; la tasa es la misma para todos).

### Cambio 3 — Semántica de error y frescura

- `FxConversionResult.warnings` es el array que viaja en cada
  respuesta cuando la tasa está stale. El DTO ya lo soporta
  (`financial-account-balance.dto.ts`); hoy siempre es undefined.
- **`stale: boolean` se suma a `FinancialAccountBalanceDto`** para
  que el smoke widget pueda mostrar un chip de warning de
  Tailwind sin parsear el array `warnings`. El widget renderiza
  `<span class="text-amber-600">Cotización desactualizada (hace 2h)</span>`
  cuando `stale === true`, junto al texto existente
  `"Last updated: <ISO>"` de BR-ACC-18 (1 archivo, ~15 líneas
  en `app/accounts/[id]/balance-widget.tsx`). Ambas señales se
  mantienen: `fxAsOf` para el timestamp, `stale` para el booleano
  que condiciona el chip.
- El array `warnings` se queda en el DTO para trabajo futuro de
  `ui-accounts` (multi-warning surfaces, historial, etc.). Para
  v1 el smoke widget usa `stale` para el chip e ignora `warnings`.
- `fxAsOf` sigue llevando el timestamp de la fuente. El smoke
  widget renderiza `"Last updated: <ISO>"` según BR-ACC-18
  Decisión 3.
- Ningún código de error HTTP nuevo. `FX_UNAVAILABLE` (503) y
  `FX_NOT_SUPPORTED` (409) mantienen su semántica actual.
- El stub sin configurar se borra en este cambio. El grafo DI
  debe registrar el proveedor real; si falta el swap, la app
  arranca y cada llamada lanza en su primer uso (sin fail-fast
  en DI en este slice — marcado).

### Cambio 4 — Límite de capacidad y swap de DI

- Una capacidad nueva `fx` envía su propio spec en
  `openspec/specs/fx/spec.md` (creado por `sdd-spec`). La
  capacidad declara el contrato `FxRateProvider` desde la
  perspectiva de `accounts` y los contratos de caché + proveedor
  DolarAPI desde la perspectiva de `fx`.
- El spec de `accounts` gana dos deltas: (a) edición de una
  oración de cross-link en BR-ACC-12 hacia la capacidad `fx`
  (sin cambio de comportamiento), y (b) la nueva columna
  `casa AccountFxCasa?` en `FinancialAccount` con la regla
  `account.casa ?? FX_DEFAULT_CASA` aplicada en
  `GET /api/accounts/:id/balance`.
- El cableado DI en
  `src/modules/accounts/infrastructure/di.ts` (o equivalente)
  reemplaza `FxRateProviderUnconfigured` por
  `FxRateProviderDolarApi`. El archivo stub sin configurar se
  elimina.

### Cambio 5 — Selección de casa por cuenta (DG-FX-2 cerrada in-scope)

El usuario eligió **selección de casa por cuenta en v1**. El
alcance crece por un enum Prisma + una columna nullable + un
input de formulario. Las filas existentes migran a `NULL` (sin
pérdida de datos; el proveedor cae al default global hasta que
el usuario lo sobrescriba explícitamente).

- **Prisma** (`prisma/schema.prisma`): nuevo enum `AccountFxCasa`
  con valores `OFICIAL`, `BLUE`, `MEP`, `CCL`, `CRIPTO`,
  `TARJETA`. Nueva columna opcional `casa AccountFxCasa?` en
  `FinancialAccount`. La migración es `ALTER TABLE … ADD COLUMN
  "casa" "AccountFxCasa" NULL` — sin backfill, sin default, sin
  pérdida de datos.
- **Validación:** nuevo esquema de enum en el existente
  `update-account.schema.ts` (un archivo).
- **DTO:** el DTO de lectura de cuenta gana
  `casa: AccountFxCasa | null`; el DTO de update acepta lo
  mismo. El DTO de balance no se ve afectado.
- **Cableado en la acción:** `get-account-balance.action.ts`
  resuelve `account.casa ?? env.FX_DEFAULT_CASA` y pasa la casa
  al proveedor en cada llamada. El proveedor no tiene estado
  global por llamada.
- **UI:** nuevo `<select>` en el formulario de edición de
  cuenta con una opción "Default (oficial)" representando
  `NULL`.
- **Límite de capacidad:** `accounts` dueña del esquema, DTO,
  acción y form; `fx` dueña de la integración DolarAPI y la
  caché. El cambio es una columna fina + DTO + input de form en
  `accounts` más un cambio de una línea en el call-site. Ver
  `docs/adr/0010-dolar-api-provider.md` para las alternativas
  consideradas (single-global-only, env-var por cuenta,
  columna, auto-picker `MOST_RECENT`).

### Cambio 6 — Lock anti-estampida (DG-FX-4 cerrada in-scope)

Un `Map<casa, Promise<void>>` en memoria del proceso coalesce
fetches concurrentes de arranque en frío para la misma casa.
~5 líneas. Solo por proceso (las estampidas multi-instancia
quedan acotadas por N instancias, no por N usuarios; aceptado
para v1). Sin lock de Redis, sin advisory lock, sin
deduplicación del lado de DolarAPI. Caché + lock juntos
limitan las llamadas upstream a ≤ N×6 por hora por proceso.

## Fuera del alcance (este cambio)

- EUR/ARS, USD/EUR, BRL/ARS, o cualquier par que no sea
  ARS↔USD. El puerto `FxRateProvider` queda intacto para que un
  futuro `FxRateProviderFrankfurter` (o similar) pueda enviarse
  como su propio cambio. **Confirmado:** EUR/ARS queda fuera de
  v1 — DolarAPI no lo cotiza y la interfaz `FxRateProvider` no
  necesita crecer una superficie multi-par para soportarlo.
- **FX multi-moneda por transacción** (una futura capacidad
  `transactions` puede guardar la tasa FX usada al momento de
  escritura en cada fila de transacción, pero para v1 la
  superficie FX queda read-only y sólo de display según
  BR-ACC-12).
- **Historial de cambios de casa por cuenta** (audit log de
  "esta cuenta estaba en `blue` el mes pasado, ahora en
  `oficial`"). La columna `casa` lleva sólo el valor actual.
  El historial es follow-up.
- **Un auto-picker `MOST_RECENT`** que elija la casa con la
  última `fechaActualizacion` de DolarAPI. El usuario eligió el
  default fijo `oficial` para v1.
- Un Cron programado que entibie la caché cada 30 minutos. El
  TTL de 1 h significa que la caché está caliente mientras la app
  está en uso y se enfría durante la noche; el primer request
  después de un período quieto paga el round-trip a DolarAPI. Un
  warmup por Cron es follow-up.
- FX multi-fuente (DolarAPI + Frankfurter + una tercera fuente
  para resiliencia). Fuente única en v1; la resiliencia la
  resuelve el camino de fallback stale, no agregando proveedores.
- Exponer `warnings` en la UI del smoke widget más allá del
  nuevo chip `stale: boolean`. El DTO lleva el array; el widget
  usa `stale` para el chip e ignora `warnings`.
- Migrar el cliente Upstash del módulo rate-limit a una factory
  `UpstashClient` compartida. Dos consumidores Upstash con su
  propio constructor de cliente es aceptable en v1.
- Cambios de UI de producción más allá del chip de warning del
  smoke. La UI de producción para FX (selector de casa
  completo, display multi-moneda, vistas de historial) vive en
  `ui-accounts`.
- Notificaciones push o jobs en background de cualquier tipo.

## No-objetivos

- **No es una app multi-moneda.** FX es sólo display. El balance
  nativo en la fila nunca se convierte (BR-ACC-12, heredada). Un
  futuro cambio de `transactions` PUEDE convertir para reports;
  el storage sigue siendo de moneda única.
- **No es un archivo histórico de FX.** La caché guarda la última
  tasa. Las tasas históricas para reports de patrimonio neto son
  una capacidad futura (`snapshots` o `reports`).
- **No es un reemplazo de DolarAPI.** Si DolarAPI se cae 24 h,
  servimos stale; si se cae 7 días, la caché sigue sirviendo
  stale. Ningún fallback a otra fuente está en este slice.
- **No es un cambio de rate-limiting.** El `checkRateLimit`
  existente sigue gateando los endpoints de auth. Las llamadas FX
  no necesitan un límite por IP porque la caché frena la llamada
  upstream.
- **No es un framework HTTP o DI nuevo.** El catch-all de Hono y
  el grafo DI existente quedan igual.

## Usuarios y situaciones

| Usuario                        | Situación                                                                  | Punto de contacto                                       |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| Developer en `accounts-ledger` | Corre `pnpm dev`, abre una cuenta, envía el widget de balance              | La smoke UI ya no muestra 503; la conversión renderiza   |
| PM revisando la superficie FX  | Elige una cuenta en USD, elige ARS, ve el monto convertido y `fxAsOf`      | Widget de balance de la smoke UI                        |
| Autor futuro de `transactions` | Construye `getAccountBalanceAction` para la lista de transacciones        | Importa `FxRateProvider` desde `src/modules/accounts/`  |
| Autor futuro de `reports`      | Agrega balances entre cuentas en una sola moneda de display                | Igual — `FxRateProvider` es la costura                  |
| Usuario autenticado (smoke)    | Mira una cuenta de brokerage en USD y quiere verla en ARS                  | Widget de balance                                        |

## Reglas de negocio

El cambio lleva las BRs existentes de `accounts` verbatim y
suma una BR nueva para la caché. Las BRs de `accounts` que este
cambio NO modifica no se re-enuncian acá; viven en
`openspec/specs/accounts/spec.md`.

1. **BR-ACC-12 (heredada, sólo edición).**
   `GET /api/accounts/:id/balance?displayCurrency=…` es de sólo
   lectura. Devuelve
   `{ native: { amount, currency }, display?: { amount, currency,
   fxRate, fxAsOf }, warnings?: string[] }`. Errores:
   `503 FX_UNAVAILABLE`, `409 FX_NOT_SUPPORTED`. Edición: el
   `FxRateProvider` es "un puerto declarado en
   `src/modules/accounts/`; la implementación llega en la
   capacidad `fx`" (cross-link, sin cambio de comportamiento).
2. **BR-ACC-13 (heredada).** Stale no es `5xx`. El proveedor
   devuelve la tasa con `fxAsOf` aunque esté stale.
3. **BR-ACC-18 (heredada).** El smoke widget renderiza
   `display.fxAsOf` como texto plano `"Last updated: <ISO>"`. El
   copy de error inline para `FX_UNAVAILABLE` no cambia.
4. **BR-FX-1 (NUEVA).** El TTL de caché es 1 hora
   (`EX 3600`). Tras la expiración, el valor está "stale". El
   proveedor DEBE devolver los valores stale con
   `warnings: ["FX rate is stale; showing last known value."]`
   en una lectura stale Y disparar un refresh en background. La
   falla del refresh en background NO DEBE surfacear al caller;
   la próxima lectura ve el mismo valor stale.
5. **BR-FX-2 (NUEVA).** DolarAPI no disponible en cache miss
   lanza `AppError(FX_UNAVAILABLE)` (503). DolarAPI no disponible
   en refresh stale es silencioso. No hay un tercer estado:
   hit-fresh, hit-stale, miss-sin-upstream (lanza).
6. **BR-FX-3 (NUEVA, editada 2026-06-21).** La casa que usa el
   proveedor es `account.casa ?? process.env.FX_DEFAULT_CASA`.
   `process.env.FX_DEFAULT_CASA` default a `oficial` cuando no
   está seteada. `account.casa` es la nueva columna nullable en
   `FinancialAccount` (Cambio 5); `NULL` significa "heredar
   default global". El proveedor recibe la casa resuelta en cada
   llamada; no consulta la env var ni la columna por su cuenta.
7. **BR-FX-4 (NUEVA).** La clave de caché es
   `gastos-personales:fx:ars-usd:<casa>`. El prefijo matchea la
   convención `gastos-personales:ratelimit` del módulo rate-limit.
8. **BR-FX-5 (NUEVA).** La caché es no-op cuando faltan las env
   vars de Upstash. El proveedor igual llama a DolarAPI en cada
   request (sin caché, sin error). Este es el contrato de dev
   local / CI.
9. **BR-FX-6 (NUEVA).** `FinancialAccountBalanceDto` lleva un
   nuevo campo `stale: boolean` además del array `warnings?`
   existente. `stale === true` dispara el chip de warning del
   smoke widget
   (`<span class="text-amber-600">Cotización desactualizada (hace 2h)</span>`).
   El texto `fxAsOf` de BR-ACC-18 no cambia. El widget ignora
   `warnings` para v1; el array queda para trabajo futuro de
   `ui-accounts`.
10. **BR-FX-7 (NUEVA).** Un `Map<casa, Promise<void>>` en memoria
    del proceso coalesce fetches concurrentes de arranque en
    frío para la misma casa. El primer caller para una casa dada
    en cache miss inserta una promise y corre el fetch; los
    callers concurrentes esperan la misma promise. La entrada se
    borra al resolver para que el próximo miss vuelva a fetchear.
    Sin coordinación cross-process.
11. **BR-FX-8 (NUEVA).** La base URL de DolarAPI está hardcoded
    como `https://dolarapi.com/v1` en `dolar-api.client.ts`. Los
    tests y un futuro endpoint de staging sobrescriben vía
    `process.env.DOLAR_API_BASE_URL`. Producción usa el default
    hardcoded.
12. **BR-FX-9 (NUEVA).** La migración de Prisma suma la columna
    `casa` como `AccountFxCasa NULL` sin default y sin backfill.
    Las filas existentes pasan de sin-columna a `NULL`. La smoke
    UI para esas cuentas muestra el default global heredado
    (`oficial`) hasta que el usuario elija explícitamente una
    casa distinta en el form de edición de cuenta. **Sin pérdida
    de datos.**

## Áreas afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `src/modules/fx/` | Nuevo | Módulo nuevo: entidades de dominio, cliente DolarAPI, capa de caché Upstash, lock anti-estampida, impl `FxRateProvider`. |
| `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts` | Eliminado | Stub borrado; reemplazado por el proveedor real en `fx`. |
| `src/modules/accounts/infrastructure/di.ts` (o grafo DI equivalente) | Modificado | Cambia el stub por el proveedor real. |
| `src/modules/accounts/application/actions/get-account-balance.action.ts` | Modificado | Ahora resuelve `account.casa ?? env.FX_DEFAULT_CASA` y pasa la casa al proveedor. |
| `src/modules/accounts/application/dto/financial-account-balance.dto.ts` | Modificado | Nuevo campo `stale: boolean` en el DTO de respuesta (Cambio 3). |
| `src/modules/accounts/application/dto/financial-account.dto.ts` (DTO de lectura de cuenta) | Modificado | Expone `casa: AccountFxCasa \| null` en las lecturas de cuenta. |
| `src/modules/accounts/application/actions/update-account.action.ts` | Modificado | Acepta `casa` en el payload de update; valida con Zod. |
| `app/accounts/[id]/balance-widget.tsx` | Modificado | Suma el chip de warning de Tailwind cuando `stale === true` (~15 líneas). El texto `fxAsOf` no cambia. |
| `app/accounts/[id]/edit-account-form.tsx` (o equivalente) | Modificado | Nuevo `<select>` para `casa` con "Default (oficial)" representando `NULL`. |
| `prisma/schema.prisma` | Modificado | Nuevo enum `AccountFxCasa` + nueva columna opcional `casa AccountFxCasa?` en `FinancialAccount`. |
| `prisma/migrations/<ts>_add_account_fx_casa/migration.sql` | Nuevo | `ALTER TABLE "FinancialAccount" ADD COLUMN "casa" "AccountFxCasa" NULL`. No destructivo. |
| `openspec/specs/accounts/spec.md` | Modificado (delta) | Edición de cross-link en BR-ACC-12; nuevo requirement de `casa` en lecturas + updates de cuenta. |
| `openspec/specs/fx/spec.md` | Nuevo | Spec de capacidad nueva, declarado por `sdd-spec`. |
| `openspec/changes/fx-cache/proposal.md` | Nuevo | Este documento. |
| `openspec/changes/fx-cache/specs/fx/spec.md` | Nuevo (carpeta delta) | Delta spec para la capacidad nueva, creado por `sdd-spec`. |
| `openspec/changes/fx-cache/specs/accounts/spec.md` | Nuevo (carpeta delta) | Delta spec para la columna `casa` por cuenta, creado por `sdd-spec`. |
| `Documents-es/openspec/...` | Nuevo + Modificado | Mirror en español de cada Markdown inglés de arriba. Mismo commit. |
| `docs/adr/0010-dolar-api-provider.md` | Nuevo | ADR para la elección de DolarAPI + estrategia de caché de 1 h + decisión de casa por cuenta (linkeado desde el spec nuevo). |

## Decisiones cerradas (DG-FX-1 a DG-FX-5 — 2026-06-21)

Las cinco lagunas de decisión están **cerradas**. El detalle vive
en la sección de Cambio / BR correspondiente arriba; esto es el
resumen de auditoría.

| Gap | Decisión | Rationale | Donde se codifica |
| --- | --- | --- | --- |
| DG-FX-1 | Casa default = `oficial` | Elección conservadora; el smoke widget ya lo muestra por BR-ACC-18. | BR-FX-3 |
| DG-FX-2 | Casa por cuenta en v1 | La columna es aditiva; el usuario eligió v1 sobre un follow-up diferido. | Cambio 5, BR-FX-3 |
| DG-FX-3 | Chip amber visible `stale: boolean` | Señal user-visible más chica que mapea a una primitiva UX. | Cambio 3, BR-FX-6 |
| DG-FX-4 | Lock in-process `Map<casa, Promise<void>>` | Defensa más barata contra estampida de cold-start; sin protocolo de coordinación. | Cambio 6, BR-FX-7 |
| DG-FX-5 | Base URL hardcoded + override `DOLAR_API_BASE_URL` | Costo de una línea de env var; los tests consiguen un switch de sandbox; producción no puede drift. | BR-FX-8 |

Las alternativas consideradas para cada gap quedan registradas
en `docs/adr/0010-dolar-api-provider.md` (escrito por
`sdd-design`). EUR/ARS queda fuera de v1 según la sección de
No-objetivos.

## Criterios de aceptación

El cambio está hecho cuando:

1. `pnpm test` corre la suite nueva de `fx` (dominio +
   integración) y termina con código 0 con ≥ 80% de cobertura
   sobre `src/modules/fx/**`.
2. `pnpm dev` → sign in → abrir una cuenta en USD → enviar el
   widget de balance con `displayCurrency=ARS` → el widget
   renderiza `display.amount`, `display.fxRate` y
   `"Last updated: <ISO>"`. Sin 503.
3. Con las env vars de Upstash sin setear: cada llamada golpea
   DolarAPI; sin crash; el widget sigue renderizando bien (sin
   caché, pero el request sale bien porque DolarAPI es
   alcanzable).
4. Con DolarAPI forzado a 500 en un test: el camino de cache miss
   lanza `FX_UNAVAILABLE` (503). El camino de hit-stale devuelve
   el valor stale con `stale: true` en el DTO, el string de
   warning de BR-FX-1 en `warnings`, Y la caché se refresca en
   background.
5. Inspección de clave de caché: `redis-cli GET
   gastos-personales:fx:ars-usd:oficial` devuelve el JSON
   cacheado después del primer call exitoso.
6. Después de 1 h, un segundo call devuelve el valor cacheado
   con `stale: true` en el DTO, el string de warning en
   `warnings`, Y la caché se refresca en background.
7. El grafo DI registra `FxRateProviderDolarApi`; el archivo
   `fx-rate-provider.unconfigured.ts` queda eliminado.
8. `openspec/specs/fx/spec.md` existe y declara BR-FX-1 a
   BR-FX-9 con al menos un Scenario cada una.
9. `openspec/specs/accounts/spec.md` BR-ACC-12 lleva el nuevo
   texto de cross-link hacia `fx`. Ninguna otra BR cambia.
10. `docs/adr/0010-dolar-api-provider.md` existe con Contexto,
    Opciones (DolarAPI vs. Frankfurter vs. una tabla hardcoded,
    más las alternativas de casa por cuenta: single-global-only
    vs. env-var por cuenta vs. columna vs. auto-picker
    `MOST_RECENT`), Decisión, Consecuencias.
11. `./Documents-es/openspec/changes/fx-cache/proposal.md` existe
    con el mismo contenido traducido (sin caracteres chinos;
    verificado por la regla §13.3 del `AGENTS.md` raíz).
12. Sin drift de `pnpm-lock.yaml` después de stagear
    `package.json` (chequeo pre-commit de Husky por
    `AGENTS.md` §5.3 raíz).
13. **Casa por cuenta:** la migración de la columna `casa` +
    enum corre sobre una base de datos poblada; las filas
    existentes de `FinancialAccount` tienen `casa = NULL`; el
    smoke widget renderiza el default global heredado para esas
    filas; elegir una casa distinta en el form de edición de
    cuenta persiste y se refleja en la próxima llamada de
    balance.
14. **Chip stale:** con el valor de caché pasado el TTL, el
    smoke widget renderiza el chip amber `text-amber-600`
    además del texto `fxAsOf` existente.
15. **Lock anti-estampida:** un test que dispara N llamadas
    concurrentes de cache-miss para la misma casa registra
    exactamente 1 fetch saliente a DolarAPI (verificado vía un
    spy sobre el `fetch` subyacente).
16. **Override de base URL:** un test que setea
    `DOLAR_API_BASE_URL=http://localhost:9999` confirma que el
    cliente apunta al override; sin la env var el cliente apunta
    a `https://dolarapi.com/v1`.

## Riesgos

| Riesgo                                                                                | Probabilidad | Mitigación                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| DolarAPI se cae con la caché fría (sin valor stale para servir).                     | Media        | El widget muestra el error inline 503 según BR-ACC-18. Comportamiento documentado; no es regresión. Un Cron warmup futuro lo elimina.    |
| DolarAPI nos rate-limita (sin SLA público; endpoint gratuito).                        | Baja–Media   | La caché de 1 h + el refresh lock por proceso (BR-FX-7) cortan las llamadas upstream ~99% en estado estable. Fallback es el stale.       |
| DolarAPI cambia la forma de su respuesta (es una API comunitaria).                    | Baja         | Validación con Zod en `dolar-api.client.ts` rechaza formas desconocidas con `FX_UNAVAILABLE`. La forma es chica (~6 campos); acotado.   |
| `oficial` no es el default correcto para una app de finanzas personales.             | Baja         | Cerrada (DG-FX-1). El default es sobrescribible por cuenta vía la nueva columna `casa` (BR-FX-3). Usuarios que quieren `blue` lo setean en la cuenta. |
| La caché se vuelve fuente de staleness en períodos de alta inflación (ARS).           | Media        | El TTL de 1 h matchea la cadencia típica de actualización de DolarAPI para `oficial` y `blue`. El widget ahora también muestra el chip stale. |
| La duplicación del cliente Upstash (rate-limit + nuevo módulo de caché) deriva.       | Baja         | Una factory `UpstashClient` compartida es follow-up; los dos consumidores son chicos e idénticos hoy.                                    |
| La capacidad nueva `fx` se confunde con feature de conversión de dinero, no un puerto.| Baja         | La propuesta es explícita sobre el alcance (sólo display, ARS↔USD, fuente única, override por cuenta). El spec lleva el mismo lenguaje. |
| El cambio pesa ~800 líneas y supera el presupuesto de review de 400 líneas.          | Alta         | Auto-chain en tres PRs (ver Forecast). PR #1 = módulo `fx` + tests; PR #2 = schema por cuenta + UI; PR #3 = swap de DI + spec + ADR.     |
| El swap de DI deja una ventana donde ni el stub ni el proveedor real están cableados. | Baja         | El cableado por cuenta se estagia antes del swap de DI; un feature flag sobre `FX_DEFAULT_CASA` mantiene el stub cableado hasta que PR #3 mergea. |
| **La migración de `casa` por cuenta corre contra una base de datos poblada** con N filas de `FinancialAccount`. | Baja | La migración es `ADD COLUMN casa AccountFxCasa NULL` — no destructiva. Sin backfill, sin default en la columna. La smoke UI debe mostrar el default global heredado hasta que el usuario lo sobrescriba explícitamente (sin auto-migración de filas existentes a `oficial`). El runbook del smoke incluye un `SELECT count(*) WHERE casa IS NULL` manual post-migración. |
| **El mapping del enum `casa`** (Prisma `OFICIAL` ↔ DolarAPI `oficial`) deriva si DolarAPI renombra una casa. | Baja | El mapping está centralizado en un módulo (`dolar-api.client.ts`) y unit-testeado contra cada casa. Un rename de casa requiere una edición deliberada de código + DTO + Zod. |
| **El enum `casa` y el string `OFICIAL` en env vars se desincronizan** (`FX_DEFAULT_CASA=oficial` vs. `AccountFxCasa.OFICIAL`). | Baja | El proveedor normaliza ambas fuentes a través de un único esquema Zod (`fx-casa-string.schema.ts`) que acepta la forma lowercase de DolarAPI y rechaza cualquier otra cosa. Unit-testeado para ambos code paths. |

## Rollback

- **PR no mergeado**: `git branch -D feat/fx-cache-*`,
  `git worktree remove`.
- **PR #1 mergeado, PR #2 todavía no**: revertir PR #1. El stub
  `fx-rate-provider.unconfigured.ts` sigue existiendo en
  `develop` y el grafo DI sigue cableándolo; restaurar `develop`
  a pre-PR-1 es limpio.
- **PR #2 mergeado, pre-release**: revertir PR #2. Re-agregar el
  stub, re-cablear DI. El módulo `src/modules/fx/` nuevo es
  aditivo y puede quedar en disco o eliminarse como paso
  separado; no tiene callers una vez revertido el DI.
- **PR publicado en producción**: stop. Este release se gobierna
  por el flujo de release (`AGENTS.md` §5.5 raíz) que requiere
  aprobación del usuario. Ningún camino de rollback automático
  está documentado acá.
- **Incidente de DolarAPI post-release**: sin rollback necesario.
  El camino de fallback stale sirve la última tasa conocida con
  el string de warning. El widget queda degradado pero funcional.

## Dependencias

- **Entrante**: `accounts-ledger` (enviado). La interfaz
  `FxRateProvider` vive en
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`.
  `get-account-balance.action.ts` consume
  `deps.fxRateProvider`. Ambas son entradas estables.
- **Saliente**: `transactions`, `reports`, `snapshots`
  (futuros). Cada uno va a consumir `FxRateProvider` para
  conversiones nativo→display. La capacidad `fx` nueva es la
  costura.
- **Externa**: DolarAPI (`https://dolarapi.com`). Gratuita, sin
  API key, devuelve JSON. Sin SLA. Servicio público mantenido
  por la comunidad.
- **Externa**: Upstash Redis (ya es dependencia de
  `auth-foundation` vía `@upstash/ratelimit` y
  `@upstash/redis`). El módulo de caché reusa el mismo patrón
  de cliente.
- **Sin co-PRs**: `fx-cache` no bloquea ningún cambio en curso.
  `accounts-ledger` ya está mergeado. `transactions` todavía no
  está scoped.

## Capacidades

> Esta sección es el CONTRATO entre esta propuesta y `sdd-spec`.
> La próxima fase la lee para saber exactamente qué archivos de
> spec crear o actualizar.

### Capacidades nuevas

- `fx`: la capacidad nueva dueña de la implementación de
  `FxRateProvider` (cliente DolarAPI + caché Upstash), el contrato
  de caché, el contrato de fallback stale y el default de
  selección de casa. `accounts` sigue siendo dueña del puerto y
  del endpoint de display de sólo lectura; `fx` es dueña de la
  integración upstream y de la caché. Las dos capacidades se
  comunican vía la interfaz `FxRateProvider` existente en
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  — la dependencia apunta de `fx` al puerto de `accounts`, nunca
  al revés, preservando el invariante de ports & adapters.

### Capacidades modificadas

- `accounts`: el spec gana dos deltas — (a) una edición de una
  oración de cross-link en BR-ACC-12 hacia la capacidad `fx`
  (sin cambio de comportamiento), y (b) el nuevo requirement de
  la columna `casa AccountFxCasa?` en `FinancialAccount` más la
  regla de resolución `account.casa ?? FX_DEFAULT_CASA` aplicada
  en `GET /api/accounts/:id/balance`. El cambio de comportamiento
  queda confinado a qué casa usa el proveedor; la forma del DTO
  no gana ningún campo nuevo required (sólo un `casa` opcional
  en el DTO de lectura de cuenta y `stale: boolean` en el DTO
  de balance). El cambio se envía como delta en
  `openspec/changes/fx-cache/specs/accounts/spec.md`.

## Alternativas consideradas

1. **Frankfurter** (https://www.frankfurter.dev) — FX histórico
   basado en el BCE, gratuito, sin API key. Rechazado para v1
   porque (a) Frankfurter no cubre ARS↔USD con una tasa utilizable
   para las casas "oficial" o "blue"; (b) Frankfurter es cierre
   diario, demasiado stale para un widget de balance de finanzas
   personales. Queda en la tabla de alternativas porque una futura
   capacidad `fx-eu` (pares basados en EUR) usaría Frankfurter de
   forma natural.
2. **Abstracción de proveedor con múltiples fuentes desde el día 1**
   (DolarAPI + Frankfurter + una tabla hardcoded de fallback ARS).
   Rechazado porque la abstracción es over-engineering para una
   v1 de fuente única. La interfaz `FxRateProvider` ya nos da la
   costura para sumar fuentes más adelante.
3. **Caché en memoria** (`Map<casa, { rate, ts }>` por proceso
   Node). Rechazada porque (a) no sobrevive un deploy (la caché se
   enfría después de cada release), (b) es por proceso así que un
   deploy multi-instancia paga N× llamadas a DolarAPI, y (c) el
   módulo rate-limit ya usa Upstash, así que el patrón de cliente
   está en el árbol.
4. **Warmup de caché disparado por Cron** (una función serverless
   que refresca cada 30 minutos). Diferido a un follow-up. El TTL
   de 1 h es suficiente para v1 porque el primer request después
   de una caché fría paga el costo upstream una vez y sirve cada
   request siguiente durante la hora.
5. **Empujar la tasa FX a una columna DB en `FinancialAccount`**
   (computar la conversión al momento del write). Rechazado porque
   viola BR-ACC-12 (el storage nunca se convierte) y requeriría un
   job de re-conversión cada minuto para ser útil en períodos de
   alta inflación.
6. **Extender `accounts` en vez de crear una capacidad nueva `fx`**.
   Considerado y rechazado: (a) la caché la consumen capacidades
   futuras, no sólo `accounts`; (b) el layout de `openspec/` ya
   reserva `specs/fx/`; (c) el puerto `FxRateProvider` se queda en
   `accounts` igual (es la costura consumer-facing), así que la
   nueva capacidad `fx` es puramente aditiva del lado de la
   implementación.

## Forecast (auto-chain, presupuesto de 400 líneas)

| PR  | Alcance                                                                                                                                                | Líneas aprox. | Estado |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------ |
| 1   | Módulo nuevo `src/modules/fx/`: cliente DolarAPI + caché Upstash + lock anti-estampida + impl `FxRateProvider` + tests unitarios de dominio + tests de integración | ~600      | Auto   |
| 2   | Casa por cuenta: enum Prisma + columna nullable + migración + validación Zod + `<select>` en form de edición + DTO de cuenta + update de acción            | ~300          | Auto   |
| 3   | Swap de DI (borrado del stub) + acción de balance cablea `account.casa ?? FX_DEFAULT_CASA` + chip `stale` en smoke widget + delta spec `accounts` + spec `fx` + ADR-0010 + mirror ES | ~250   | Auto   |
|     | **Total**                                                                                                                                              | **~1150**     |        |

PR #1 supera el presupuesto de review de 400 líneas. El
orchestrator hace auto-chain (por preflight de sesión). PR #1 es
un slice autocontenido que no toca ningún consumer; PR #2 suma
la columna `casa` por cuenta y el form (el proveedor sigue
cayendo al default por env var porque `account.casa` es `NULL`
para todas las filas en este punto); PR #3 es swap de DI + chip
del smoke widget + creación del spec que prende el proveedor
nuevo con selección por cuenta completa. Un reviewer puede
aterrizar PR #1 y PR #2 sin riesgo para la smoke UI; PR #3
gira el cable de DI y suma el chip de warning visible.

## Audit trail

- **v1** (esta propuesta, 2026-06-21) — DolarAPI + caché Upstash
  1 h + fallback stale + capacidad nueva `fx`. Sin cambios al
  puerto de `accounts`. Primera escritura del cambio.
- **v1.1** (esta propuesta, edición del mismo día 2026-06-21) —
  DG-FX-1 a DG-FX-5 cerradas por el usuario:
  - DG-FX-1: casa default `oficial`.
  - DG-FX-2: casa por cuenta en v1 (columna + enum nuevos).
  - DG-FX-3: chip de warning visible vía nuevo DTO `stale:
    boolean`.
  - DG-FX-4: `Map<casa, Promise<void>>` in-process como lock
    anti-estampida.
  - DG-FX-5: base URL hardcoded + override por env var
    `DOLAR_API_BASE_URL`.
  El alcance creció de ~497 a ~700 líneas. Nuevas BRs: BR-FX-6
  a BR-FX-9. Nueva área afectada: `prisma/schema.prisma` +
  migración de Prisma. El Forecast creció de 2 PRs a 3 PRs
  (~1150 líneas totales).

Refs:

- `openspec/changes/archive/2026-06-19-accounts-ledger/proposal.md`
  — el cambio upstream que declaró el puerto.
- `openspec/specs/accounts/spec.md` — BR-ACC-12, BR-ACC-13,
  BR-ACC-18 (heredadas verbatim en esta propuesta).
- `src/shared/rate-limit/rate-limit.ts` — patrón de cliente
  Upstash reusado por el módulo de caché.
- `src/shared/errors/error-codes.ts` — `FX_UNAVAILABLE` (503),
  `FX_NOT_SUPPORTED` (409).
- `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  — el puerto que la implementación nueva satisface.
- `src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`
  — el stub que este cambio elimina.
- DolarAPI: https://dolarapi.com (sin API key, sin SLA, JSON).
- Upstash Redis: https://upstash.com (REST API; env vars
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
