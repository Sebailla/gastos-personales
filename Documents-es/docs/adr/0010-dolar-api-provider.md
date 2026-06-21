# ADR-0010 — DolarAPI como proveedor FX con caché Upstash 1h + `casa` por cuenta

**Estado**: Accepted · **Fecha**: 2026-06-21 · **Deciders**: Sebastián Illa
**Refs**: `openspec/changes/fx-cache/proposal.md` (v1.1) ·
`openspec/changes/fx-cache/specs/fx/spec.md` (REQ-FX-1 a REQ-FX-9) ·
`openspec/specs/accounts/spec.md` (BR-ACC-12, BR-ACC-13, BR-ACC-18) ·
PRs #47 (propuesta) y #48 (spec) en el tracker upstream ·
ADR-0009 (encriptación de tokens OAuth — ADR sibling de crypto/storage; sin supersede).

## Contexto y planteamiento del problema

El cambio `accounts-ledger` (mergeado 2026-06-19) envió un modelo
`FinancialAccount` discriminado con un contrato de FX de display
de sólo lectura (BR-ACC-12) y una smoke UI funcional bajo
`app/accounts/`, pero el `FxRateProvider` es un port — no se
envió implementación. El stub dentro del cambio
(`src/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured.ts`)
siempre lanza `AppError(FX_UNAVAILABLE)`, que el `errorHandler`
central mapea a HTTP 503. La consecuencia para el usuario es
concreta: abrir el detalle de cuenta y enviar el balance widget
muestra el error inline `"FX rate provider unavailable. Try
again in a few minutes."` (BR-ACC-18). La smoke UI **no es
producción**, pero el widget es el único arnés de prueba
end-to-end para el contrato FX, y un 503 en cada click es un
bloqueo duro para la validación manual de futuros cambios que
consuman el puerto (`transactions`, `reports`).

Tres decisiones acopladas viven adentro de este problema:

1. **Qué fuente FX upstream** — DolarAPI, Frankfurter,
   exchangerate.host, un scraper de BCRA, o diferir.
2. **Forma y frescura de la caché** — en memoria, Upstash
   Redis, caching propio de DolarAPI, un Cron warmup, o nada.
3. **Regla de resolución de casa** — sólo env var global,
   env var por cuenta, columna por cuenta, o auto-picker
   `MOST_RECENT`.

Este ADR captura las tres. Las dos primeras están acopladas
(la falta de SLA de DolarAPI es la razón por la que la caché
existe); la tercera es independiente y se divide en una
sub-decisión más abajo.

## Drivers

- **Gratis, sin API key** — el proyecto corre como expense
  tracker de un solo developer en Fly.io con un Fly secrets
  store personal. Cualquier proveedor que requiera tier pago,
  tarjeta en archivo, o key administrada por vendor queda
  fuera.
- **Sólo ARS↔USD en v1** — el par dominante es peso argentino a
  dólar estadounidense. EUR/ARS, USD/EUR, BRL/ARS están
  explícitamente fuera (propuesta §"Out of scope"); la interfaz
  `FxRateProvider` queda sin tocar para que un proveedor
  futuro enchufe pares EUR.
- **Sin SLA en el upstream** — DolarAPI es community-run y
  públicamente gratis; puede estar caído por horas sin aviso.
  La caché es la capa de resiliencia.
- **Upstash Redis ya es dependencia** — `auth-foundation`
  metió `@upstash/ratelimit` + `@upstash/redis` para el módulo
  de rate limit (`src/shared/rate-limit/rate-limit.ts`). El
  módulo de caché reusa el mismo patrón de cliente; sin
  nuevas dependencias.
- **Strict TDD + ≥80% coverage en `src/modules/fx/**`** según
  `openspec/config.yaml`.
- **Contrato local-dev / CI: la caché debe ser no-op sin
  Upstash** — matchea el gating por env vars del módulo de
  rate limit (`UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN`). Sin crash de boot si las env
  vars faltan.

## Opciones consideradas

### Opción 1 — DolarAPI (elegida) — https://dolarapi.com

Gratis, sin API key, JSON. Seis "casas" para ARS↔USD:
`oficial`, `blue`, `mep`, `ccl`, `cripto`, `tarjeta`. Cada una
carga una tasa `venta` (sell). Base URL hardcoded
`https://dolarapi.com/v1` con override `DOLAR_API_BASE_URL`.

- **Pros**: zero auth (sin rotación de key, sin tarjeta, sin
  cuenta de vendor). Seis casas le dan al usuario una
  elección real. Devuelve una shape estable suficientemente
  chica (~6 fields) como para validar con Zod. Momentum de
  comunidad (citada en varios tutoriales de Argentina).
  Cache-friendly (1 update por casa cada pocos minutos es
  más que suficiente).
- **Cons**: sin SLA, sin garantía de uptime. La API de
  comunidad puede cambiar shape sin aviso. Rate-limited a
  discreción del upstream. El spread blue/MEP/ccl es a veces
  políticamente sensible (la casa "blue" es la tasa del
  mercado paralelo del USD).

### Opción 2 — Frankfurter — https://www.frankfurter.dev

FX histórico basado en el ECB, gratis, sin API key. JSON.

- **Pros**: oficial (ECB), estable, API documentada, pares
  EUR cubiertos limpiamente.
- **Cons**: sin cobertura ARS↔USD con tasa utilizable para
  las casas `oficial` o `blue`; Frankfurter es cierre diario,
  demasiado stale para un balance widget de personal finance
  que necesita FX fresco.

Queda en la tabla de alternativas porque una futura capacidad
`fx-eu` (pares basados en EUR) usaría Frankfurter
naturalmente.

### Opción 3 — exchangerate.host

Free tier con API key, JSON. Histórico + actual.

- **Pros**: bien documentado; muchos pares.
- **Cons**: el free tier está rate-limited a 250 req/mes por
  IP; requiere una key; la cobertura ARS es sólo oficial (sin
  blue/MEP/ccl); el free tier es demasiado chico para un
  balance widget que dispara en cada page load.

### Opción 4 — Scraper hecho a mano de la API de BCRA

El endpoint público del Banco Central argentino. Sólo
`oficial` oficial, sin blue/MEP/ccl.

- **Pros**: fuente oficial para la casa `oficial`.
- **Cons**: sólo `oficial`; sin blue/MEP/ccl; el scraping es
  frágil; la API de BCRA tiene sus propios rate limits
  indocumentados. Duplica la superficie (nuestro scraper + la
  API del BCRA).

### Opción 5 — Diferir FX por completo

Aterrizar el cambio con una tasa `oficial` hardcoded por
request, sin upstream.

- **Pros**: cero superficie externa; determinístico en tests.
- **Cons**: la tasa queda stale en el momento en que
  mergeamos. La queja real del usuario (el 503) se reemplaza
  por una peor (una tasa hardcoded que se equivoca más cada
  semana). Esto es efectivamente lo que envió `accounts-ledger`.

## Decisión

**Elegida**: 1 (DolarAPI) + caché Upstash 1 h + lock
anti-estampida in-process + columna `casa` por cuenta.

La implementación:

- `src/modules/fx/` — módulo nuevo, paralelo a
  `src/modules/accounts/`, con el layout `domain/entities`,
  `domain/ports`, `infrastructure/external`,
  `infrastructure/cache`,
  `infrastructure/external/fx-rate-provider.dolar-api.ts`. Ver
  el doc de diseño para la rationale archivo por archivo.
- `prisma/schema.prisma` — enum `AccountFxCasa` nuevo con
  valores `OFICIAL | BLUE | MEP | CCL | CRIPTO | TARJETA`.
  Columna opcional nueva `casa AccountFxCasa?` en
  `FinancialAccount`. La migración es no-destructiva:
  `ALTER TABLE "FinancialAccount" ADD COLUMN "casa"
  "AccountFxCasa" NULL` sin default ni backfill.
- `src/shared/env/env.schema.ts` — agrega `DOLAR_API_BASE_URL`
  (opcional, default `https://dolarapi.com/v1`) y
  `FX_DEFAULT_CASA` (opcional, default `oficial`).
- `src/modules/api/app.ts` — swap de DI de una línea
  (línea 316): `const fxProvider: FxRateProvider = new
  FxRateProviderUnconfigured();` pasa a `const fxProvider:
  FxRateProvider = new FxRateProviderDolarApi({ cache, env });`.
  El archivo del stub unconfigured se borra en el mismo
  cambio.

### Sub-decisión — columna `casa` por cuenta (cierra DG-FX-2)

Alternativas:

1. **Sólo global** — `process.env.FX_DEFAULT_CASA` es la única
   perilla de casa; el usuario elige una vez para todo el
   deployment.
2. **Env var por cuenta** — env vars separadas por account id
   (ej. `FX_CASA_<accountId>`). Inmantenible.
3. **Columna `casa` por cuenta en `FinancialAccount`**
   (elegida) — nullable, aditiva, sin default. `NULL` significa
   "hereda el default global". El usuario elige por cuenta en
   el create form (el `create-account-form.tsx` existente)
   para v1; el edit form es un follow-up.
4. **Auto-picker `MOST_RECENT`** — en cada llamada, pegar a
   las seis casas y elegir la que tenga el último
   `fechaActualizacion`. Comportamiento sorprendente, oculto
   para el usuario, esconde la preferencia del usuario.

Elegida 3 porque: (a) la columna es aditiva (sin migración
destructiva; las filas existentes pasan de "sin columna" a
`NULL`); (b) el usuario eligió explícitamente esto en DG-FX-2
sobre un follow-up diferido; (c) preserva el derecho del
usuario a elegir `blue` para cuentas personales y `oficial`
para cuentas de negocio en el mismo deployment; (d) la regla
de resolución `account.casa ?? process.env.FX_DEFAULT_CASA` es
un one-liner en el call-site y el `FxRateProvider` se queda
stateless por llamada.

### Sub-decisión — lock anti-estampida (cierra DG-FX-4)

Alternativas:

1. **Sin lock** — el primer caller concurrente gana, el resto
   re-fetchea en el próximo request. Aceptable; no ideal.
2. **`Map<casa, Promise<void>>` in-process** (elegida) — el
   primer caller para una casa dada inserta una promise y
   corre el fetch; los callers concurrentes esperan la misma
   promise. ~5 líneas, sólo per-process.
3. **Lock en Redis** (`SET NX EX` por casa) — coordinación
   cross-process; funciona en deployments multi-instancia.
   Cuesta un round-trip a Redis por fetch de cold-start.
4. **Deduplicación del lado de DolarAPI** — no disponible;
   DolarAPI no tiene idempotency key.

Elegida 2 porque: (a) la caché + TTL 1 h limita la estampida a
≤ 6 por hora por proceso (seis casas); (b) per-process es
suficiente porque las estampidas multi-instancia están
acotadas por N instancias, no por N usuarios; (c) el costo
de un lock en Redis es no-trivial para un solo cold-start;
(d) la implementación son ~5 líneas de `Map` plumbing sin
nuevas dependencias.

### Sub-decisión — override `DOLAR_API_BASE_URL` (cierra DG-FX-5)

Alternativas:

1. **Sólo hardcoded** — producción apunta a la URL real; los
   tests stubean directamente el cliente DolarAPI. Los tests
   tienen una superficie menos que mockear.
2. **Hardcoded + override por env var `DOLAR_API_BASE_URL`**
   (elegida) — producción usa el default hardcoded (sin env
   var que olvidar); los tests setean la env var para apuntar
   a un sandbox.

Elegida 2 porque: (a) costo de una línea de env var; (b) los
tests consiguen un switch de sandbox sin importar un stub o
extender el cliente; (c) producción no puede derivar del
endpoint canónico a menos que la env var esté seteada
explícitamente.

### Consecuencias

- **Buena**: la smoke UI deja de dar 503 en el día 0 del
  próximo cambio. La caché + lock anti-estampida limitan las
  llamadas upstream a ≤ N×6 por hora por proceso. La interfaz
  `FxRateProvider` queda sin tocar para que un proveedor
  futuro (ej. Frankfurter para pares EUR) salga como un
  cambio propio.
- **Buena**: la columna `casa` por cuenta desbloquea `blue`
  para cuentas personales y `oficial` para cuentas de negocio
  en el mismo deployment. Las filas existentes migran a `NULL`
  (sin pérdida de datos) y heredan el default global hasta
  que el usuario override.
- **Buena**: Upstash ya está en el árbol de deps (módulo de
  rate limit), así que sin nuevas dependencias; el módulo de
  caché reusa el mismo patrón gateado por env var.
- **Mala**: DolarAPI no tiene SLA. La caché + TTL 1 h es la
  capa de resiliencia; el camino de fallback stale sirve la
  última tasa conocida cuando DolarAPI está caído con caché
  fría.
- **Mala**: DolarAPI puede cambiar shape. El schema Zod en
  `dolar-api.client.ts` rechaza shapes desconocidas con
  `FX_UNAVAILABLE`. La shape es chica (~6 fields); el riesgo
  está acotado.
- **Mala**: los períodos de alta inflación (ARS) hacen que el
  TTL 1 h sea notorio. El widget ahora también renderiza el
  chip stale (`stale: true` → amber `text-amber-600`) para
  que el usuario pueda juzgar la frescura de un vistazo. Un
  Cron warmup futuro podría acortar el TTL percibido; es un
  follow-up.
- **Mala**: el lock anti-estampida per-process significa que
  un deployment multi-instancia paga N× llamadas upstream en
  una caché fría. Aceptable para v1 porque N es chico
  (1-2 instancias en Fly.io); un futuro lock en Redis podría
  apretar esto.

### Confirmación

Cada consecuencia mapea a un scenario del spec que la prueba:

| Consecuencia | Scenario del spec |
| --- | --- |
| La smoke UI deja de dar 503 | `REQ-FX-1` Scenario "Cache miss followed by hit within TTL" + `REQ-FX-2` Scenario "DolarAPI 5xx on cache miss throws 503" |
| La caché + lock limitan las llamadas upstream | `REQ-FX-7` Scenario "Concurrent cache-miss calls for the same casa fire one fetch" |
| La interfaz `FxRateProvider` queda sin tocar | `REQ-FX-3` Scenarios "NULL account.casa falls back to the global default" / "Explicit account.casa overrides the global default" (resolución del lado del caller; sin crecimiento del port) |
| La columna `casa` por cuenta desbloquea la elección por cuenta | `REQ-FX-3` Scenario "Explicit account.casa overrides the global default" + `REQ-FX-9` Scenario "Migration adds the column without backfill" |
| Sin nuevas dependencias | `REQ-FX-5` Scenarios "Missing Upstash env vars fall through to DolarAPI" / "Missing Upstash env vars do not throw at startup" |
| Camino de fallback stale | `REQ-FX-1` Scenarios "Stale read returns the cached value and refreshes in background" / "Background refresh failure does not surface" |
| Zod rechaza shapes desconocidas de DolarAPI | `REQ-FX-2` Scenario "DolarAPI malformed payload throws 503" |
| Chip stale | `REQ-FX-6` Scenario "Stale response carries stale true and the warning string" |
| URL hardcoded + override por env var | `REQ-FX-8` Scenarios "Default base URL when env var is unset" / "Env var overrides the base URL" |
| Plug-in de proveedor futuro | La interfaz `FxRateProvider` en `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts` no cambia en este cambio; un futuro `FxRateProviderFrankfurter` implementaría el mismo port. |

## Follow-ups

1. **Cron warmup** — una función serverless que pegue a las
   seis casas cada 30 minutos para que la caché quede tibia
   durante períodos quietos. Diferido; el TTL 1 h es aceptable
   para v1.
2. **Frankfurter para pares EUR** — una capacidad `fx-eu` que
   envíe `FxRateProviderFrankfurter` (cambio separado). La
   interfaz `FxRateProvider` queda sin tocar.
3. **Historia de casa por cuenta** — audit log de "esta cuenta
   estaba en `blue` el mes pasado, ahora en `oficial`". La
   columna `casa` carga sólo el valor actual. Diferido.
4. **Factory de cliente Upstash** — colapsar los dos consumers
   de Upstash (rate-limit + caché) en una sola factory
   `UpstashClient`. Diferido; los dos consumers son chicos e
   idénticos en forma hoy.
5. **UI de producción** — picker completo de casa, display
   multi-currency, vistas de historia. Vive en `ui-accounts`.
6. **Lock anti-estampida multi-instancia** — lock en Redis por
   casa para coordinación cross-process. Diferido hasta que
   exista la segunda instancia.