# Spec — `auth-foundation-slice-c` (delta)

**Estado**: borrador · **Autor**: Sebastián Illa
**Creado**: 2026-06-13 · **Capacidad**: `auth`
**Change padre**: `auth-foundation` (Slice A + B mergeadas como PRs #5, #17)
**Spec canónico upstream**: `openspec/specs/auth/spec.md` (v2, borrador 2026-06-10)
**Stack**: v2 — Next.js 16 + Auth.js v5 + Prisma 6 + PostgreSQL + Hono catch-all + Zod + Vitest
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas)

> Este es un **delta spec** para el change `auth-foundation-slice-c`. NO re-declara el spec canónico v2; declara los requisitos **adicionales** que Slice C introduce. Cada delta referencia las reglas BR-AUTH-\* del spec canónico donde aplican.

---

## 1. Referencias al spec canónico (contratos sin cambios)

Los siguientes contratos canónicos (de `openspec/specs/auth/spec.md`) siguen aplicando a Slice C y no requieren delta:

- **BR-AUTH-1** (normalización de email) — aplica a T-026 (la action pública `signIn` sigue normalizando al escribir).
- **BR-AUTH-2** (largo de credencial ≥ 10) — aplica a T-027.3 (el test de secrets-in-logs usa un fixture con esa longitud).
- **BR-AUTH-5** (auto-link por match de email) — aplica a T-027.2 (el test OAuth state CSRF verifica que no se creen filas `User`/`Account` con state alterado).
- **BR-AUTH-7** (expiración de sesión 30d sliding 24h) — aplica a T-027.6 (la cookie lleva la ventana sliding).
- **BR-AUTH-10** (`@@unique([provider, providerAccountId])`) — aplica a T-026 (el modelo `Account` expuesto vía el módulo es de sólo lectura para otros módulos; el constraint se enforce en la capa Prisma).
- **BR-AUTH-11** (secretos/tokens en logs) — refinada (no redefinida) por DELTA-C2.6. La denylist de 11 claves de Slice A es la base; el nuevo test verifica el comportamiento end-to-end.

Los **8 decision gaps** del proposal del change padre quedan cerrados y no se re-debaten acá. Se referencian por sus nombres cortos (por ej. "decision gap #5: cliente tipado de Hono") en DELTA-C2.2 y DELTA-C3.3 ADR-0004.

---

## 2. Deltas

### DELTA-C1.1 — Fix de module-resolution (issue #18, cierre de FLAG-1)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-025, T-026 (precondición para la re-inclusión)
**Issue upstream**: #18 · **Reporte de verificación**: `file-only/verify-auth-foundation-slice-ab.md`

**Requisito**:

WHEN la suite de tests corre contra la rama develop (post-merge de todos los PRs de chores #8, #9, #12, #13, #16 y los PRs de auth-foundation #5, #17)
AND `vitest.config.ts#test.exclude` está configurado según el design
THEN los 3 archivos de test previamente excluidos (`src/modules/auth/index.test.ts`, `src/modules/auth/infrastructure/external/authjs.test.ts`, `app/api/auth/[...nextauth]/route.test.ts`) DEBEN correr sin el error de import documentado en el issue #18
AND `pnpm test` DEBE reportar **al menos 137/137 tests** pasando (eran 134/134 con 3 archivos excluidos)
AND `pnpm test --coverage` DEBE reportar coverage en `src/modules/auth/**` de **≥ 80%** para lines, branches, functions y statements (estaba debajo del 80% por los archivos excluidos)

El fix DEBE vivir en la configuración de tests (`vitest.config.ts` y cualquier stub bajo `test/stubs/`); el código de producción NO DEBE cambiar para acomodarlo.

**Escenario 1: se remueven las entradas de exclusión de tests**

- Dado: `vitest.config.ts` actualmente excluye 3 archivos de test en `test.exclude`
- Cuando: el PR de Slice C-1 mergea
- Entonces: las 3 entradas se remueven
- Y: el bloque de comentarios que explica la condición dual del bug también se remueve
- Y: el archivo no contiene ninguna entrada de `test.exclude` referenciando esos 3 paths

**Escenario 2: los archivos de test previamente excluidos se ejecutan**

- Dado: un `pnpm install` fresco contra la rama develop
- Cuando: corre `pnpm test` (o `npx vitest run`)
- Entonces: los 3 archivos previamente excluidos se ejecutan con éxito
- Y: `authjs.test.ts` reporta sus 6 casos
- Y: `index.test.ts` reporta su smoke test de API pública
- Y: `route.test.ts` reporta su test del handler de Auth.js
- Y: ningún test file se reporta como fallado en la frontera de import

**Escenario 3: el umbral de coverage se cumple**

- Dado: la suite de tests pasa 137/137
- Cuando: corre `pnpm test --coverage`
- Entonces: el reporte de coverage v8 muestra `src/modules/auth/**` en ≥ 80% en las cuatro métricas (lines, branches, functions, statements)
- Y: el check de gating de CI (DELTA-C3.1) pasa

**Escenario 4: el runtime de producción no se afecta**

- Dado: Slice C-1 mergeó
- Cuando: corre `pnpm run build` (build de producción de Next.js)
- Entonces: el build tiene éxito
- Y: ningún stub de test se bundlea en la salida de producción
- Y: el import de `next/server` en `node_modules/next-auth/lib/env.js` resuelve a través del resolver de Next.js en build time, no a través del alias de Vite

---

### DELTA-C2.1 — Mount de la ruta catch-all de Hono (T-025)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-025

**Requisito**:

WHEN un cliente hace un request HTTP a `/api/<anything>` excluyendo `/api/auth/*`
THEN el request DEBE delegarse a `honoApp.fetch(request)`
AND la respuesta de la app de Hono DEBE devolverse con el mismo status code HTTP, headers y body que si `honoApp` fuera el server.

El catch-all NO DEBE rutear paths `/api/auth/*`. El file-based routing de Next.js resuelve `app/api/auth/[...nextauth]/route.ts` primero; el catch-all sólo ve paths que no tienen un match más específico.

**Escenario 1: una ruta de Hono devuelve su respuesta nativa**

- Dado: el dev server está corriendo
- Cuando: llega un request a `GET /api/me` sin cookie de sesión
- Entonces: el status de la respuesta es **401**
- Y: el body es `{"error":{"code":"UNAUTHORIZED","message":"…"}}`
- Y: el `Content-Type` de la respuesta es `application/json`

**Escenario 2: la ruta de health de Hono devuelve 200**

- Dado: el dev server está corriendo
- Cuando: llega un request a `GET /api/health`
- Entonces: el status de la respuesta es **200**
- Y: el body matchea `{ data: { status: "ok", version, uptime } }`
- Y: `version` es igual al valor de `package.json#version`
- Y: `uptime` es un número no negativo

**Escenario 3: las rutas de Auth.js tienen precedencia sobre el catch-all**

- Dado: el dev server está corriendo
- Cuando: llega un request a `GET /api/auth/signin`
- Entonces: el request NO se rutea al catch-all de Hono
- Y: se devuelve la respuesta HTML de signin de Auth.js (status 200, `Content-Type: text/html`)
- Y: el body de la respuesta contiene el formulario de signin de Auth.js

**Escenario 4: el catch-all soporta los 4 verbos HTTP**

- Dado: la app de Hono tiene rutas registradas para `GET`, `POST`, `PATCH`, `DELETE`
- Cuando: requests a `/api/...` usan cualquiera de esos verbos
- Entonces: el método correspondiente en el `route.ts` del catch-all delega a `honoApp.fetch(request)`
- Y: la respuesta es idéntica a la que `honoApp.fetch` devuelve cuando se invoca directamente

---

### DELTA-C2.2 — Export de API pública (T-026, parte 1)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-026

**Requisito**:

La superficie pública del módulo `auth` es lo único que otros módulos (futuros: `accounts-ledger`, `transactions`, `fx-cache`, etc.) pueden importar. El archivo `src/modules/auth/index.ts` DEBE exportar los siguientes named bindings:

- `auth` — el helper del lado del server `auth()` de Auth.js v5 (devuelve la sesión o `null`)
- `signIn` — la server action que dispara un sign-in con Credentials o Google
- `signOut` — la server action que termina la sesión actual
- `handlers` — los handlers `GET` y `POST` para `/api/auth/*` (montados en `app/api/auth/[...nextauth]/route.ts`)
- `honoApp` — la instancia de `OpenAPIHono` para el catch-all de Hono (per decision gap #5; tipado como `OpenAPIHono<{ Variables: { user: PublicUser | null } }>`)
- `UserRegistered` — el string del nombre del evento de usuario registrado
- `UserSignedIn` — el string del nombre del evento de sign-in

Los paths no exportados (internals de domain services, de repositorios, de adaptadores externos) NO DEBEN ser importables desde fuera de `src/modules/auth/`. Un chequeo en tiempo de compilación (TypeScript con `verbatimModuleSyntax`) valida esto.

**Escenario 1: los named exports existen y tienen los tipos esperados**

- Dado: el módulo auth está construido
- Cuando: se intenta `import { auth, signIn, signOut, handlers, honoApp, UserRegistered, UserSignedIn } from "@/modules/auth"` desde fuera del módulo auth
- Entonces: los imports tienen éxito
- Y: `typeof auth` matchea `() => Promise<Session | null>` (contrato de Auth.js v5)
- Y: `typeof handlers` matchea `{ GET: Handler, POST: Handler }`
- Y: `honoApp` tiene tipo `OpenAPIHono<{ Variables: { user: PublicUser | null } }>`
- Y: `UserRegistered` y `UserSignedIn` son string literals

**Escenario 2: un import desde un path interno no exportado es un error de TypeScript**

- Dado: un consumidor hipotético intenta `import { AuthService } from "@/modules/auth/domain/services/auth.service"`
- Cuando: TypeScript compila
- Entonces: el compilador reporta `error TS2305: Module '"@/modules/auth"' has no exported member 'AuthService'`
- Y: el build falla

**Escenario 3: `honoApp` es consumible por la UI (contrato del cliente tipado)**

- Dado: un módulo UI futuro importa `honoApp` y deriva un cliente tipado
- Cuando: el consumidor hace `import { hc } from "hono/client"; const client = hc<typeof honoApp>("/");`
- Entonces: `client.api.me.$get()` está tipado y devuelve `PublicUser` en éxito o `ErrorResponse` en fallo
- Y: no aparece ningún `any` en la cadena inferida

---

### DELTA-C2.3 — Middleware de Next.js para protección de `/api/me` (T-026, parte 2)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-026

**Requisito**:

Un middleware de Next.js en la raíz del proyecto (`middleware.ts`) DEBE proteger las futuras rutas de server-component bajo `/app/*` (por ej. `/dashboard`) redirigiendo los requests no autenticados a `/auth/signin`. El middleware es el path de **fail-fast** para las páginas de App Router; la ruta `/api/me` de Hono ya devuelve 401 cuando falta la sesión, así que el middleware sólo aplica a páginas, no a las rutas API de Hono.

El middleware DEBE ser no-op para:

- `/api/auth/*` (rutas propias de Auth.js; el framework maneja la auth)
- `/api/*` (rutas de Hono; el origin-check y la resolución de `auth()` de Hono las cubren)
- `/_next/*` (internals de Next.js)
- Assets estáticos

**Escenario 1: un request no autenticado a una página protegida redirige**

- Dado: no hay cookie `authjs.session-token` presente
- Cuando: llega un request a `GET /dashboard`
- Entonces: la respuesta es un redirect **302**
- Y: el header `Location` es `/auth/signin` (o `/auth/signin?callbackUrl=%2Fdashboard` cuando el design soporta callback URLs)
- Y: el status de la respuesta es 302 (no 200, no 401)

**Escenario 2: un request autenticado a una página protegida se permite**

- Dado: hay una cookie `authjs.session-token` válida presente
- Cuando: llega un request a `GET /dashboard`
- Entonces: el status de la respuesta es **200** (la página renderiza)
- Y: el middleware NO redirige

**Escenario 3: el middleware es no-op para rutas API y estáticas**

- Dado: cualquiera de los siguientes paths
- Cuando: llega un request
- Entonces: el middleware pasa de largo sin modificar:
  - `/api/auth/signin`
  - `/api/me`
  - `/_next/static/chunks/main.js`
  - `/favicon.ico`

**Escenario 4: performance del middleware**

- Dado: un runner de CI silencioso
- Cuando: el middleware corre en 100 requests secuenciales
- Entonces: la latencia mediana del middleware es < 5 ms por request (el middleware puede llamar a `auth()` sólo cuando el path está en la lista protegida; una lectura de la cookie de sesión es rápida)

---

### DELTA-C2.4 — Test de seguridad: equalización de timing (T-027.1)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-027

**Requisito**:

WHEN el `authorize()` de Credentials se invoca con un email conocido y una credencial incorrecta
OR con un email desconocido y cualquier credencial
THEN las dos distribuciones de tiempo de respuesta DEBEN no tener una diferencia estadísticamente significativa (Welch's t-test, `p > 0.01`, sobre 30 muestras pareadas).

Esto refina la equalización de timing documentada en **BR-AUTH-4** agregando un **test automatizado** que detecta regresiones de la lógica de equalización de timing en `authjs.ts:91-95` (llamada al dummy-hash cuando `passwordHash` es `null`).

**Escenario 1: timing equalizado en CI**

- Dado: un hash de Argon2id real para `known@example.com` y un dummy hash fijo
- Cuando: 30 intentos de login con `known@example.com` + credencial incorrecta
- Y: 30 intentos de login con `unknown@example.com` + cualquier credencial
- Entonces: el Welch's t-test sobre los dos sets de muestras devuelve `p > 0.01`
- Y: el test pasa

**Escenario 2: flag de local-dev para máquinas ruidosas**

- Dado: una máquina de developer donde el test de timing sería flaky
- Cuando: corre `pnpm test -- --skip-timing`
- Entonces: el test de timing se skipea (no falla)
- Y: un mensaje de consola indica el skip y recomienda correrlo en CI

---

### DELTA-C2.5 — Test de seguridad: OAuth state CSRF (T-027.2)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-027

**Requisito**:

WHEN llega un request de callback a `/api/auth/callback/<provider>` con un parámetro `state` faltante o alterado (donde el `state` es el token de protección CSRF que Auth.js genera al iniciar el flow de OAuth)
THEN el callback DEBE ser rechazado por Auth.js
AND no se crea ninguna fila `User` en la tabla `User`
AND no se inserta ninguna fila `Account` en la tabla `Account`.

**Escenario 1: un state alterado se rechaza**

- Dado: se inició un flow de OAuth (se seteó un token `state`)
- Cuando: llega un callback con `state=garbage` (no es el valor que Auth.js generó)
- Entonces: la respuesta es una página de error de Auth.js (status 200, body HTML con el error renderizado)
- Y: el conteo de users en la tabla `User` no cambia
- Y: el conteo de accounts en la tabla `Account` no cambia

**Escenario 2: un state faltante se rechaza**

- Dado: se inició un flow de OAuth
- Cuando: llega un callback sin el parámetro `state`
- Entonces: el mismo outcome que el Escenario 1 (rechazado, sin filas insertadas)

**Escenario 3: un state válido procede**

- Dado: se inició un flow de OAuth y se generó un token `state`
- Cuando: llega un callback con el `state` correcto y un `code` válido
- Entonces: Auth.js procesa el callback (el test es para el path de rechazo; el path de éxito es de Auth.js y se testea en `authjs.test.ts` de Slice B)

---

### DELTA-C2.6 — Test de seguridad: secretos en logs (T-027.3)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-027

**Requisito**:

WHEN el body de un request incluye el campo de credencial del usuario, un campo refresh-token, un header `Authorization` de la forma `Bearer <jwt>`, un campo `id_token`, o un token CSRF
THEN el output capturado del logger a través de los paths de register, callback de OAuth y resolución de sesión NO DEBE contener ninguno de esos valores, en ninguna forma (raw, codificado en base64, JSON-quoted, o obfuscado de cualquier otra manera).

Esto refina **BR-AUTH-11** (que sólo requiere que la `denylist` esté aplicada en la configuración del logger) assertando el comportamiento **end-to-end** a lo largo del ciclo de vida del request.

**Escenario 1: el registro con una credencial larga no deja rastro en los logs**

- Dado: un body de request con un string de credencial placeholder de 24 caracteres bajo el nombre del campo de credencial del usuario (por ej. un string alfanumérico de 24 caracteres tomado de un set fijo conocido de test) y nunca matchea ningún valor real de producción
- Cuando: el handler de registro corre y el logger captura cada paso
- Entonces: el substring del placeholder de credencial no aparece en ninguna línea de log

**Escenario 2: el callback de OAuth con un refresh token en la respuesta no deja rastro**

- Dado: un callback de OAuth devuelve un campo refresh-token del provider
- Cuando: Auth.js procesa el callback y la aplicación loguea la sesión
- Entonces: el valor del refresh-token no aparece en ninguna línea de log

**Escenario 3: un bearer token en un request de Hono no se loguea**

- Dado: un request a una ruta de Hono con un header `Authorization` de la forma `Bearer <jwt>` donde `<jwt>` es un string placeholder de tipo JWT (por ej. arrancando con el típico prefijo base64-encoded de header usado en fixtures de test)
- Cuando: el request de Hono se procesa y el middleware de origin-check loguea el request
- Entonces: el string placeholder de tipo JWT (y el token completo) no aparece en ninguna línea de log

**Escenario 4: un token CSRF no se loguea**

- Dado: un request con una cookie o header de CSRF
- Cuando: el chequeo de CSRF de Auth.js corre
- Entonces: el valor del token CSRF no aparece en ninguna línea de log

---

### DELTA-C2.7 — Test de seguridad: chequeo de origin (T-027.4)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-027

**Requisito**:

WHEN `POST /api/auth/register` se llama con un header `Origin` faltante o no matcheado (contra `env.APP_URL`)
THEN la respuesta DEBE ser **403** con `{ error: { code: "FORBIDDEN", message: "…" } }`.

Esto refina el chequeo de origin implementado en la ruta sibling de DELTA-C2.2 (middleware `origin-check` de Hono) agregando un **test end-to-end** que ejercita el ciclo de vida completo del request, no sólo el middleware aislado.

**Escenario 1: un POST cross-origin se rechaza**

- Dado: `env.APP_URL = "https://app.example.com"`
- Cuando: llega un request con `Origin: https://attacker.com` a `POST /api/auth/register`
- Entonces: el status de la respuesta es **403**
- Y: el body es `{"error":{"code":"FORBIDDEN","message":"Origin not allowed"}}`

**Escenario 2: un POST same-origin se permite**

- Dado: `env.APP_URL = "https://app.example.com"`
- Cuando: llega un request con `Origin: https://app.example.com`
- Entonces: el status de la respuesta NO ES 403 (el registro puede tener éxito o fallar por otras razones, pero no por origin)

**Escenario 3: un Origin faltante se rechaza**

- Dado: `env.APP_URL = "https://app.example.com"`
- Cuando: llega un request sin el header `Origin`
- Entonces: el status de la respuesta es **403**
- (Esto protege contra `curl`/scripts que no envían `Origin`; el design acepta eso como out-of-scope para clientes legítimos, que todos envían `Origin`.)

---

### DELTA-C2.8 — Test de seguridad: parámetros de Argon2id (T-027.5)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-027

**Requisito**:

`hashArgon2id(credential)` con los parámetros elegidos (`memoryCost=19456`, `timeCost=2`, `parallelism=1`) DEBE producir un hash cuyo runtime mediano sobre 30 muestras esté en el rango de **50–100 ms** en el runner de CI.

El test re-corre `scripts/bench-argon2.ts` y verifica que la mediana caiga en la banda. La banda es suficientemente ancha para absorber la varianza del runner de CI (los runners de GitHub tienen ~10% de ruido) pero suficientemente ajustada para detectar regresiones de parámetros (por ej. alguien que cambie `timeCost` a 1 bajaría la mediana a ~25 ms, bien por debajo de la banda).

**Escenario 1: el runtime mediano está en la banda en CI**

- Dado: el perfil de hardware del runner de CI (GitHub-hosted Linux, 2 vCPU)
- Cuando: `hashArgon2id("a-test-credential")` se llama 30 veces
- Entonces: el runtime mediano está en [50, 100] ms
- Y: el test pasa

**Escenario 2: un cambio de parámetro falla el test**

- Dado: un developer accidentalmente cambia `timeCost=2` a `timeCost=1` en `argon2.hasher.ts`
- Cuando: corre el test
- Entonces: el runtime mediano está por debajo de 50 ms (aproximadamente 25 ms)
- Y: el test falla con un mensaje de error claro identificando el parámetro ofensor

---

### DELTA-C2.9 — Test de seguridad: atributos de la cookie (T-027.6)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-027

**Requisito**:

La cookie `authjs.session-token` DEBE tener:

- `HttpOnly` siempre (la cookie no es legible desde JavaScript)
- `SameSite=Lax` siempre (la cookie se envía en navegaciones top-level)
- `Secure` DEBE setearse en producción (`env.NODE_ENV=production`)
- `Path=/` (la cookie se envía en cada path)

**Escenario 1: la cookie tiene HttpOnly y SameSite=Lax en dev**

- Dado: cualquier autenticación exitosa en development (`NODE_ENV=development`)
- Cuando: se captura la respuesta
- Entonces: el header `Set-Cookie: authjs.session-token=…` tiene los atributos `HttpOnly` y `SameSite=Lax`
- Y: la cookie NO tiene `Secure` (dev es sobre HTTP)

**Escenario 2: la cookie tiene Secure en producción**

- Dado: un deployment de producción (`NODE_ENV=production`)
- Cuando: se captura la respuesta
- Entonces: el header `Set-Cookie` tiene `Secure`
- Y: la cookie tiene `HttpOnly` y `SameSite=Lax`

**Escenario 3: el path de la cookie es `/`**

- Dado: cualquier autenticación exitosa
- Cuando: se captura la respuesta
- Entonces: el header `Set-Cookie` tiene `Path=/`
- Y: la cookie se envía en todos los requests subsiguientes sin importar el path

---

### DELTA-C3.1 — Workflow de CI (T-028)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-028

**Requisito**:

Un workflow de CI en `.github/workflows/ci.yml` DEBE correr en:

- `pull_request` a `develop` o `main`
- `push` a `develop` o `main`

El workflow DEBE tener **4 jobs paralelos**:

1. **`lint`** — `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`. Falla el job ante cualquier error de lint o de typecheck.
2. **`test`** — `pnpm install --frozen-lockfile`, `pnpm prisma migrate deploy` (contra el testcontainer de Postgres), `pnpm test --coverage`, sube el artifact `coverage/`, postea un sticky comment en el PR con los porcentajes de coverage.
3. **`build`** — `pnpm install --frozen-lockfile`, `pnpm run build` (build de producción de Next.js).
4. **`security`** — `pnpm install --frozen-lockfile`, `pnpm test src/modules/auth/__tests__/security/`. El job más lento; corre separado para que un flake en el test de timing no bloquee a los jobs de lint y build.

**Concurrencia**: el workflow DEBE cancelar runs en vuelo del mismo `ref` cuando se pushea un nuevo commit.

**Sin force-push a `main`** (per skill `ci-cd-pipeline`). El workflow puede pushear commits a ramas de PR (por ej. para bots tipo `autofix.ci`) pero NO DEBE pushear a `main`.

**Escenario 1: los 4 jobs son verdes en un PR exitoso**

- Dado: un PR a `develop` sin fallas de lint, typecheck, test, build o security-test
- Cuando: corre el workflow
- Entonces: los 4 jobs reportan éxito
- Y: el PR tiene un check verde de cada job

**Escenario 2: una falla de lint bloquea el merge**

- Dado: un PR a `develop` con un error de lint en `src/modules/auth/...`
- Cuando: corre el workflow
- Entonces: el job `lint` falla
- Y: GitHub bloquea el merge (regla de branch protection de DELTA-C3.2)

**Escenario 3: un flake de security-test no bloquea los otros jobs**

- Dado: un PR donde `login.timing.test.ts` flaquea en el primer run
- Cuando: corre el workflow
- Entonces: el job `security` falla (el test es flaky)
- Y: los jobs `lint`, `test` y `build` siguen reportando sus resultados
- Y: un developer puede re-correr sólo el job `security` sin re-correr los otros

---

### DELTA-C3.2 — Branch protection + CODEOWNERS (T-029)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-029

**Requisito**:

Un archivo `.github/CODEOWNERS` en la raíz del repo DEBE apuntar al maintainer (`@sebailla`).

Un documento en `docs/branch-protection.md` DEBE describir las reglas que el parent va a aplicar a `develop` (y opcionalmente `main`) en GitHub:

- Requerir 1 review
- Requerir CI verde en los 4 jobs (DELTA-C3.1)
- Descartar aprobaciones obsoletas al hacer push
- Requerir historia lineal (sólo squash-merge)
- Sin force-pushes

Los settings reales de branch protection en GitHub se aplican manualmente por el usuario (no en este change) porque requieren permisos de repo-admin. El documento es la fuente de verdad de la configuración intended.

**Escenario 1: CODEOWNERS lista al maintainer**

- Dado: el repo está configurado
- Cuando: corre `cat .github/CODEOWNERS`
- Entonces: el archivo lista el handle de GitHub del maintainer

**Escenario 2: las reglas de branch protection están documentadas**

- Dado: existe `docs/branch-protection.md`
- Cuando: se lee el archivo
- Entonces: documenta las 5 reglas de arriba
- Y: explica la rationale de cada regla
- Y: linkea a los docs de GitHub para los settings correspondientes

---

### DELTA-C3.3 — ADRs (T-030)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-030

**Requisito**:

Cinco ADRs DEBEN existir en `docs/adr/`, cada uno siguiendo el template MADR (Context, Decision, Consequences, Alternatives considered). Los cinco ADRs son:

- `0001-authjs-v5.md` — por qué Auth.js v5 sobre Lucia, Clerk, Supabase Auth, hand-rolled
- `0002-prisma-6.md` — por qué Prisma 6 sobre Kysely, raw SQL
- `0003-argon2id-parameters.md` — los parámetros finales (`memoryCost=19456, timeCost=2, parallelism=1`), el resultado del benchmark, el path de fallback
- `0004-hono-catch-all.md` — por qué Hono sobre route handlers puros de Next.js, tRPC, Fastify; la forma del export `OpenAPIHono` + `hc<typeof honoApp>`
- `0005-auto-link-security-model.md` — auto-link estándar de la industria por match de email; BR-AUTH-5 / BR-AUTH-10; el deferral de un hardening pass

Cada ADR DEBE tener al menos una sub-sección `### Alternatives considered` (no sólo una lista) explicando por qué se rechazó cada alternativa.

**Escenario 1: los 5 archivos de ADR existen**

- Dado: Slice C-3 mergeó
- Cuando: corre `ls docs/adr/`
- Entonces: los 5 archivos están listados
- Y: `grep -c "^## Decision" docs/adr/*.md` devuelve 5

**Escenario 2: cada ADR tiene una sección de Alternatives sustantiva**

- Dado: cualquiera de los 5 ADRs
- Cuando: se lee el archivo
- Entonces: hay una sub-sección `### Alternatives considered`
- Y: cada alternativa tiene al menos 2 oraciones explicando el trade-off
- Y: la alternativa rechazada está nombrada explícitamente (no sólo listada)

---

### DELTA-C3.4 — Update de `docs/architecture.md` (T-031)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-031

**Requisito**:

`docs/architecture.md` DEBE ganar una sección "Auth" con:

- Un diagrama Mermaid de alto nivel (el mismo del §1 del design)
- El resumen del data model (los 4 modelos de Prisma, las 3 columnas agregadas, el constraint `@@unique([provider, providerAccountId])`)
- Las 8 rutas de Auth.js y las 3 rutas de Hono
- La estrategia de sesión (database sessions, 30-day sliding, no JWT)
- El modelo de seguridad de auto-link (con referencia a BR-AUTH-5 / BR-AUTH-10)
- Los cross-module contracts (helper `auth()`, `User` es el identity anchor, eventos `UserRegistered` / `UserSignedIn`)

El mirror español en `Documents-es/docs/architecture.md` DEBE actualizarse en el mismo commit (atómico per §13.3).

**Escenario 1: la sección Auth está presente**

- Dado: Slice C-3 mergeó
- Cuando: corre `grep -A 1 "^## Auth" docs/architecture.md`
- Entonces: el heading de la sección está presente
- Y: la sección contiene el diagrama Mermaid
- Y: la sección referencia las reglas BR-AUTH-\*

**Escenario 2: el mirror español matchea**

- Dado: la sección en inglés se actualizó
- Cuando: se lee el mirror español
- Entonces: tiene una sección correspondiente `## Auth` (o `## Auth — Autorización`)
- Y: la estructura de la sección mirrora el inglés
- Y: los términos técnicos (BR-AUTH-\*, `OpenAPIHono`, `hc<typeof honoApp>`, etc.) están verbatim

---

### DELTA-C3.5 — Update de `README.md` (T-032)

**Estado**: ADDED
**Capacidad**: auth
**Tasks**: T-032

**Requisito**:

`README.md` DEBE tener una sección de local-dev con:

- Cómo instalar dependencias (`pnpm install`)
- Cómo configurar la base de datos (testcontainer de Postgres OR `docker compose up`)
- Cómo correr el dev server (`pnpm dev`)
- Cómo correr los tests (`pnpm test`)
- Cómo correr los security tests (`pnpm test -- src/modules/auth/__tests__/security/`)
- El flag `--skip-timing` para local-dev ruidoso
- Una nota de que `pnpm prisma generate` es requerido después de `pnpm install` (CI lo corre automáticamente)

El mirror español en `Documents-es/README.md` DEBE actualizarse en el mismo commit (atómico per §13.3).

**Escenario 1: un nuevo contributor puede seguir el README desde un clone fresco**

- Dado: un clone fresco del repo
- Cuando: el nuevo contributor sigue la sección de local-dev del README
- Entonces: `pnpm install` tiene éxito
- Y: la base de datos es accesible
- Y: `pnpm dev` arranca el server en el puerto 3000
- Y: `pnpm test` corre los unit tests
- Y: `pnpm test -- src/modules/auth/__tests__/security/` corre los security tests

**Escenario 2: el mirror español existe y está actualizado**

- Dado: el README en inglés se actualizó
- Cuando: se lee el mirror español
- Entonces: tiene una sección de local-dev correspondiente
- Y: los comandos y la estructura mirroran el inglés
- Y: la sección explica los mismos pasos

---

### DELTA-C3.6 — Cierre de drift bilingüe (FLAG-2 del verify del padre)

**Estado**: ADDED
**Capacidad**: auth (artifact del change padre)
**Tasks**: T-033 (parte del handoff)

**Requisito**:

`Documents-es/openspec/changes/auth-foundation/apply-progress.md` DEBE actualizarse para mirrorar el contenido de Slice B en inglés. El mirror español está actualmente stale (cubre sólo Slice A; el archivo en inglés cubre Slice A + Slice B).

Esto cierra el **WARNING FLAG-2** del reporte de verificación del change padre (`file-only/verify-auth-foundation-slice-ab.md`).

**Escenario 1: el mirror español menciona Slice B**

- Dado: el mirror español fue actualizado
- Cuando: corre `grep -E "T-019|T-020|Slice B" Documents-es/openspec/changes/auth-foundation/apply-progress.md`
- Entonces: hay al menos un match
- Y: el line count del mirror español está dentro de ±20% de la fuente en inglés

**Escenario 2: las 8 desviaciones de Slice B están mirroradas**

- Dado: el archivo en inglés documenta 8 desviaciones
- Cuando: se lee el mirror español
- Entonces: tiene secciones `## Desviaciones` (o equivalente) correspondientes para las 8 desviaciones
- Y: la estructura mirrora el inglés

---

## 3. Criterios de aceptación (consolidados)

Estos son los outcomes **observables** que un reviewer de Slice C va a chequear. Son la unión de los escenarios por delta de arriba.

1. `vitest.config.ts#test.exclude` NO lista los 3 archivos previamente excluidos.
2. `pnpm test` → **137/137 tests verde** a través de 33 archivos de test.
3. `pnpm run typecheck` → **0 errores**.
4. `pnpm test --coverage` → coverage en `src/modules/auth/**` **≥ 80%** (lines, branches, functions, statements).
5. Los 6 security tests en `src/modules/auth/__tests__/security/` existen y pasan (el test de timing gated por el flag `--skip-timing` localmente; CI corre la suite completa).
6. `.github/workflows/ci.yml` existe y corre 4 jobs (`lint`, `test`, `build`, `security`); los 4 están verde en el commit de merge.
7. `.github/CODEOWNERS` lista al maintainer; `docs/branch-protection.md` documenta las reglas.
8. `docs/adr/0001..0005-*.md` existen; `grep -c "^## Decision" docs/adr/*.md` devuelve **5**.
9. `docs/architecture.md` tiene una sección "Auth"; `Documents-es/docs/architecture.md` la mirrora en el mismo commit.
10. `README.md` tiene una sección de local-dev; `Documents-es/README.md` la mirrora en el mismo commit.
11. `Documents-es/openspec/changes/auth-foundation/apply-progress.md` está actualizado para mirrorar el contenido de Slice B en inglés (cierre de FLAG-2).
12. Las 9 tasks de Slice C (T-025..T-033) flipeadas a `[x]` en `openspec/changes/auth-foundation/tasks.md`.
13. `auth-foundation-slice-c` se cierra vía `sdd-archive` después de que el PR final mergea y `sdd-verify` pasa.

## 4. Fuera de alcance (sin cambios desde el proposal)

- Nuevos auth providers más allá de Google y Credentials
- Flow de verificación de email
- Flow de reseteo de credencial
- Two-factor authentication (2FA)
- Los 61 `pnpm audit` vulns del issue #7
- Postgres real en CI (desviación #2 de Slice A; restaurar testcontainers es una preocupación futura)
- Configuración del provider `openrouter` de GGA (FLAG-3 del verify del padre)

## 5. Próximo paso

Después de que este spec se commitee, la siguiente fase SDD es `sdd-design`:

- `design.md` con el patrón de alias de Vite, la arquitectura de los security tests, la forma del workflow de CI, los drafts de los ADRs, la estructura de los docs.
- Después `sdd-tasks` (un archivo de tasks que rompe cada uno de T-025..T-033 en sub-tasks con columnas de evidencia TDD).
- Después `sdd-apply` (3 PRs chained: C-1, C-2, C-3).
- Después `sdd-verify` (re-correr verify sobre T-001..T-033, esperar `PASS` sin flags).
- Después `sdd-sync` (no hacen falta promociones a canónico — el spec canónico `openspec/specs/auth/spec.md` ya cubre los 8 decision gaps).
- Después `sdd-archive` (este change + el change padre).
