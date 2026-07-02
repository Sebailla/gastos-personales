# gastos-personales

App de finanzas personales multi-usuario — cuentas, transacciones, reportes mensuales y un sistema de diseño hecho a mano.

## ¿Qué es?

`gastos-personales` es una app de finanzas personales multi-usuario construida sobre Next.js 16, React 19, Hono, Auth.js v5, Prisma 6 y PostgreSQL. Registra **cuentas financieras** y **transacciones** en cualquier moneda, convierte transacciones en moneda extranjera a una moneda base al momento de la escritura, y expone un dashboard mensual con tres agregados de lectura: un resumen de totales, un desglose por categoría y un flujo diario opcional por cuenta. La app soporta múltiples usuarios con aislamiento estricto de datos: cada lectura y escritura se acota al `userId` de la sesión, y un usuario nunca puede ver las cuentas, transacciones o reportes de otro.

El proyecto está organizado en siete capabilities: `auth` (Credentials + Google OAuth + sesiones en base de datos), `accounts` (ledger multi-moneda), `transactions` (snapshot de FX al escribir), `fx` (caché de conversión de moneda), `snapshots` (net worth de cierre de período — declarado en `openspec/config.yaml` y referenciado por `openspec/specs/accounts/spec.md`, **stub en v0.4.1, aún no implementado**), `reports` (resumen mensual + desglose por categoría + flujo por cuenta) y `ui` (la referencia del sistema de diseño hecho a mano y la capa de render de producción). El release actual es **v0.4.1**; la versión del manifest es `0.4.0` y el tag operacional es `v0.4.1`.

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16 (App Router, Server Components, React 19)
- **API**: Hono (catch-all para endpoints no-auth) — cada llamada a la API es in-process vía `serverHonoRequest`, sin round-trip de fetch
- **Auth**: Auth.js v5 + `@auth/prisma-adapter` + sesiones en base de datos + Argon2id para el hashing de contraseñas
- **ORM**: Prisma 6
- **DB**: PostgreSQL (Docker local en dev, Neon en prod)
- **Validación**: Zod (en cada frontera)
- **Styling**: Tailwind v4 + un sistema de diseño hecho a mano (sin shadcn, sin MUI, sin Radix en v1)
- **Test runner**: Vitest + `vitest-axe` para accesibilidad
- **Package manager**: pnpm

## Features (v0.4.1)

- **18 primitives del sistema de diseño** en `app/_ui/primitives/` (`Button`, `Input`, `Combobox`, `FieldError`, `Card` + sub-componentes, `Table` + sub-componentes, `Badge`, `Dialog`, etc.) y **5 primitives de layout shell** en `app/_ui/layout/` (`PageHeader`, `PageContainer`, `BreadcrumbBar`, `Sidebar`, `Topbar`).
- **Superficies UI de producción** en `/accounts`, `/accounts/:id`, `/accounts/new`, `/transactions`, `/transactions/:id`, `/transactions/new` y `/dashboard` — cada una cubriendo los cuatro estados de UI (empty, loading, error, success) según REQ-UI-3.
- **Suite de a11y con axe-core** en `tests/a11y/` — un test de `vitest-axe` por página de producción que asserta cero violaciones `critical` o `serious` (piso WCAG 2.2 AA).
- **Aislamiento multi-usuario** — cada lectura y escritura se acota al `userId` de la sesión; las lecturas cross-user devuelven 404.
- **Conversión de FX al escribir** — una transacción en moneda extranjera guarda el monto nativo Y el monto convertido + el snapshot de la tasa de FX.
- **Dashboard mensual** — tres agregados de lectura joined: totales mensuales (income/expense/net), desglose por categoría (ordenado descendente por monto) y flujo diario por cuenta.
- **Auth.js v5** — email + contraseña (Argon2id) y Google OAuth; almacenamiento de tokens encriptado; protección open-redirect en `?callbackUrl=`.
- **Prisma 6 + Postgres** — seis modelos (`User`, `Account`, `Session`, `VerificationToken`, `FinancialAccount`, `Transaction`).
- **Coverage gate en pre-push** — 80% lines / branches / functions / statements (actual en v0.4.1: 97 / 90 / 84 / 97).
- **Dos follow-ups pendientes del usuario** aún sin ejecutar: T-UI-505 (Lighthouse p95 < 2s en `/`, `/dashboard`, `/transactions`) y T-UI-506 (sign-off manual de QA según `docs/qa/transactions-ui.md`). Ninguno es un blocker del release; el maintainer puede correrlos contra el tag v0.4.1 cuando quiera.

## Project layout

El repo sigue una arquitectura por capas: `src/modules/<capability>/` (domain, application, infrastructure) para las siete capabilities, `src/composition/` para la factory de Hono + el wiring de DI, `src/shared/` para el kernel transversal (events, errors, domain ports, logger, db) y `app/` para las rutas de Next.js. La carpeta `app/_ui/` contiene el sistema de diseño hecho a mano; `app/_components/` contiene los Client Components de producción del dashboard + la lista de transacciones; `app/_lib/` redeclara localmente los wire types (la UI no puede importar de `src/modules/...` por la regla de arquitectura). La carpeta `openspec/` contiene el lifecycle SDD de cambios; `docs/` contiene los artefactos de arquitectura + ADR + QA + perf; `Documents-es/` es el espejo en español de cada Markdown en inglés.

### Reglas de arquitectura (el piso absoluto)

Estas reglas no son negociables; el agent contract (`AGENTS.md` §10.5) y el subagente `reviewer` las enforce en cada PR:

- **Independencia del domain** — la capa de domain (aggregates, value objects, ports) NO importa desde application, infrastructure ni UI.
- **Ports & Adapters** — la infraestructura implementa las interfaces del domain (p. ej. `AccountRepositoryPort`).
- **Sin dependencias circulares** — las dependencias siempre apuntan al domain.
- **Módulos aislados** — un módulo NO importa directamente desde otro módulo; la comunicación cross-module pasa por `src/shared/events/` (el event dispatcher) o `src/shared/domain-kernel/` (el kernel estructural).
- **Coverage ≥ 80%** en domain + application por capa (medido por capa, no por repo).
- **Sin `any`** — usar `unknown` o interfaces específicas. TypeScript `strict: true` siempre.
- **Manejo de errores** — los services throw, las actions catch. Input validado con Zod en cada frontera.

## Quick start (local development)

### Prerrequisitos

- **Node.js 20+** (el proyecto pinea `engines.node` a `>=20` y `packageManager` a `pnpm@10.34.3` vía corepack)
- **pnpm 10+** (vía corepack)
- **Docker** (para el Postgres local)

### Pasos

```bash
# 1. Clonar + instalar
git clone https://github.com/Sebailla/gastos-personales
cd gastos-personales
corepack enable
pnpm install

# 2. Levantar el Postgres local (puerto host 5433 -> container 5432)
pnpm db:up

# 3. Copiar el template de env y completar los valores requeridos
cp .env.example .env
# (editar .env; ver "Environment variables" abajo para qué completar)

# 4. Aplicar las migraciones de Prisma
pnpm prisma migrate deploy

# 5. Generar el Prisma client
pnpm prisma generate

# 6. Levantar el dev server
pnpm dev
# -> http://localhost:3000
```

### Environment variables

| Variable                     | Propósito                                                                                   | Cómo se genera                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `DATABASE_URL`               | Connection string de Postgres (Docker local, dev/staging/prod apuntan a Neon)               | n/a                                   |
| `AUTH_SECRET`                | String random de 32+ bytes; Auth.js firma la cookie de sesión                               | `openssl rand -base64 32`             |
| `AUTH_URL`                   | URL pública de la app; se usa para construir las URLs de callback de OAuth                  | n/a (default `http://localhost:3000`) |
| `APP_URL`                    | URL pública para el allowlist de origin-check de Hono                                       | n/a (default `http://localhost:3000`) |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | Clave AES-256-GCM de 32 bytes, hex-encoded (64 hex chars); encripta los OAuth tokens        | `openssl rand -hex 32`                |
| `AUTH_GOOGLE_ID`             | OAuth 2.0 client ID desde Google Cloud Console                                              | n/a                                   |
| `AUTH_GOOGLE_SECRET`         | OAuth 2.0 client secret desde Google Cloud Console                                          | n/a                                   |
| `ARGON2ID_DUMMY_PASSWORD`    | String random de 32+ bytes; siembra el `DUMMY_HASH` para login Credentials timing-equalized | `openssl rand -base64 32`             |
| `NODE_ENV`                   | `development` / `test` / `production`                                                       | n/a (default `development`)           |
| `LOG_LEVEL`                  | `debug` / `info` / `warn` / `error`                                                         | n/a (default `info`)                  |

### Primer sign-in

1. Ir a **http://localhost:3000/auth/register** para crear una cuenta (email + contraseña). Te redirige a la página de sign-in con una confirmación.
2. Iniciás sesión en **/auth/signin** (o continuás con Google si `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` están configurados).
3. Caés en **/accounts** — la lista está vacía; hacés clic en **+ New account**, completás el form, submit.
4. De vuelta en **/accounts**, hacés clic en **+ New transaction**, elegís la cuenta que recién creaste, submit.
5. Abrís **/dashboard** para ver los tres agregados de lectura del mes UTC actual. Usás el switcher de **Mes** para navegar meses anterior / siguiente; elegís una cuenta del picker para popular la card de flujo diario.

## Uso (las 3 páginas principales)

### Accounts — `/accounts`

La lista de accounts se renderiza como una tabla ordenable con tres sort keys (Name, Currency, Last activity) y un `aria-sort` que refleja la dirección actual. Un checkbox **Show archived** togglea las cuentas archivadas en la vista (la API excluye las archivadas por default). El botón **+ New account** del header abre el form de creación.

La vista de detalle en `/accounts/:id` muestra el badge de moneda de la cuenta, el estado de archivado, el balance actual y las acciones de edit / archive.

El form de creación en `/accounts/new` corre validación inline de Zod, paréa cada control con un `<label htmlFor>` (REQ-UI-5), surface errores por campo con `aria-describedby` (REQ-UI-6) y renderiza `Spinner + disabled + aria-busy="true"` en el submit mientras la Server Action está en flight (REQ-UI-7). Ante 201, el form navega a la nueva página de detalle.

### Transactions — `/transactions`

La lista de transactions se renderiza como una tabla ordenable con tres sort keys (Date — más reciente primero por default, Native amount, Converted amount). Los direction badges colorean cada fila: `INCOME` renderiza la variant success (verde), `EXPENSE` renderiza la variant danger (rojo). Una columna **Account** aparece cuando la API fue consultada con `?include=accountName`. La lista es cursor-paginada; una primitive `Pagination` se monta cuando `nextCursor` no es null. El botón **+ New transaction** abre el form de creación.

La vista de detalle en `/transactions/:id` renderiza un Card layout con secciones Identification / Amount / FX snapshot / Audit, más un Dialog de delete.

El form de creación en `/transactions/new` compone un `Combobox` para selección de cuenta más 7 campos (account, date, direction, amount, currency, category, memo), corre validación inline de Zod y aplica el mismo contrato de a11y que el form de account.

### Dashboard — `/dashboard`

El dashboard es un Server Component que fetchea los tres agregados de lectura en paralelo y los renderiza en una grilla 1+2 en viewports grandes (`lg:grid-cols-3`), stacked en chicos. Las tres cards son:

- **Monthly summary** — tabla de totales con direction badges `INCOME` (verde) y `EXPENSE` (rojo) y una línea de net.
- **Category breakdown** — categorías ordenadas por monto absoluto descendente.
- **Account flow** — totales por día para la cuenta elegida; la card está vacía cuando no hay `?accountId=` seteado.

El page header renderiza un switcher de **Mes** (`DashboardMonthSwitcher` — `<Link>`s para mes anterior / actual / siguiente) y un account picker que navega a `?accountId=<id>`. URL params: `?accountId=<uuid>` popula la flow card; `?month=YYYY-MM` selecciona la ventana del reporte (default = mes UTC actual). El rollover de Dec→Ene es automático.

El copy del dashboard está en **español** (por la convención existente del proyecto); los componentes en sí usan copy en inglés.

## Tests

```bash
pnpm test                     # todos los tests, ~2 min
pnpm test:watch               # modo watch
pnpm test:coverage            # reporte de coverage
pnpm test:coverage:enforced   # gate de 80% en lines/branches/functions/statements (pre-push)
```

El gate de coverage enforced corre en `git push` (una corrida por branch). El coverage actual en v0.4.1: 97.04 lines / 90.42 branches / 84.19 functions / 97.04 statements. El gate de pre-push usa `SKIP_TIMING=true` localmente para bypasear dos tests de timing flaky (`argon2.parameters.test.ts`, `login.timing.test.ts`); CI corre la suite estricta.

Más allá de las suites unit + integration + E2E en `tests/`, el proyecto shipa tres flavors de test específicos de la capability `ui`:

- **`tests/a11y/`** — un test de `vitest-axe` por página de producción que asserta cero violaciones `critical` o `serious` de axe-core.
- **`tests/visual/`** — golden-file snapshots para las primitives presentacionales (`Card`, `Badge`, `EmptyState`, `Skeleton`, `Breadcrumb`).
- **`tests/e2e/`** — journeys completos de usuario (list → detail → create → submit; dashboard account picker + month switcher).

## Build + deploy

```bash
pnpm build           # next build (bundle de producción)
pnpm start           # next start (puerto 3000 por default)
pnpm lint            # eslint
pnpm typecheck       # tsc --noEmit
```

El deploy de producción vive en el change `fly-deploy` (Fly.io, región `eze` para Buenos Aires por default). Los secrets de producción viven en `fly secrets`; el template `.env.example` documenta el set completo de variables. La integración con `@sentry/nextjs` reporta errores de runtime y páginas lentas a la instancia de Sentry del proyecto.

### Scripts útiles de base de datos

```bash
pnpm db:up           # docker compose up -d postgres (puerto host 5433)
pnpm db:down         # docker compose stop (preserva el volumen de datos)
pnpm db:reset        # docker compose down -v + up (wipea el volumen de datos)
pnpm db:logs         # docker compose logs -f postgres
pnpm prisma studio   # abre Prisma Studio contra la DB local
```

### Troubleshooting

- **El pre-commit hook se cuelga después de 2 minutos** — `pnpm exec lint-staged && gga run` corre el coverage gate completo. El primer intento de commit en un worktree es el más lento; los intentos subsiguientes usan el caché. Si tu herramienta de shell tiene un timeout de 2 minutos, súbilo a 5 minutos para el primer commit.
- **`pnpm install` es un no-op en un worktree fresco** — el `$HOME` del usuario carga un `pnpm-workspace.yaml` que pnpm trata como workspace root, secuestrando el install. Workaround: `pnpm install --ignore-workspace && npx prisma generate`. Después de que el worktree tenga `node_modules/`, todos los comandos `pnpm` subsiguientes funcionan normal.
- **El pre-commit falla en `.npmrc`** — pnpm a veces crea un `.npmrc` stray en el worktree que lint-staged trata de stagear. Borrarlo con `rm .npmrc` antes de committear. El repo no necesita `.npmrc`.
- **Los tests de timing de Argon2id son flaky localmente** — pasar `SKIP_TIMING=true pnpm test`. CI corre la suite estricta.

## Project conventions

- **Conventional Commits** — `<type>(<scope>): <description>`, imperative present, ≤ 72 chars la primera línea, el body explica el _why_. Sin trailers `Co-authored-by:`, sin atribución de IA.
- **Git Flow** — `main` es inmutable (merges desde `develop` sólo bajo pedido explícito del usuario); `develop` es integración; todo el trabajo aterriza vía worktree branches con el prefix `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `build/`, `ci/`, `perf/` o `revert/`.
- **Docs en dos idiomas** — cada Markdown en inglés tiene un espejo en español bajo `./Documents-es/` en el mismo commit (root `AGENTS.md` §13.3). La traducción al español es fiel, no creativa — preservá los code blocks, file paths, comandos y config keys verbatim.
- **Pre-commit gate** — `pnpm exec lint-staged && gga run` corre antes de cada commit. El hook puede tardar 1–2 minutos en la primera corrida; las corridas subsiguientes son más rápidas (caché). `commitlint` corre en `commit-msg`; el validador de nombre de branch corre en `pre-push`.
- **OpenSpec workflow** — los cambios no triviales pasan por el lifecycle proposal → spec → design → tasks → apply → verify → sync → archive en `openspec/changes/<name>/`. Los specs canónicos actuales están en `openspec/specs/<capability>/spec.md`.
- **TypeScript `strict: true`**; sin `any`; sin retornos implícitos. Argon2id para el hashing de passwords. Los secrets nunca aparecen en logs (el logger estructurado mantiene una denylist de `{ password, passwordHash, sessionToken, access_token, refresh_token, id_token, csrfToken, 'set-cookie' }`).
- **Autor de cada documento**: `Sebastián Illa`. Sin atribución de IA. Los metadatos del documento y la autoría del commit son independientes; ambos siguen la regla de no-atribución-de-IA.

## Documentación

Documentación shipada en v0.4.1:

- `docs/architecture/ui.md` — la referencia pública del sistema de diseño (token table, inventario de primitives con shape de props y contrato de a11y por primitive, inventario de layout-shell, contratos cross-cutting). Codifica REQ-UI-10.
- `docs/qa/transactions-ui.md` — el checklist manual de QA (per-page keyboard sweep, screen-reader pass en VoiceOver + NVDA, chequeo manual de aislamiento cross-user, sección informativa de axe-core, sección de sign-off del usuario). Runnable en 30–45 minutos. Codifica REQ-UI-11.
- `docs/perf/transactions-ui.md` — la verificación del perf budget (comandos de Lighthouse CLI, el perfil de throttling 4G + Moto G4 simulado, el budget p95 < 2s en `/`, `/dashboard` y `/transactions`; placeholders de JSON summary para las tres páginas; mitigación de budget-failure desde `design.md §16.5`).
- `openspec/specs/auth/spec.md`, `openspec/specs/accounts/spec.md`, `openspec/specs/transactions/spec.md`, `openspec/specs/fx/spec.md`, `openspec/specs/snapshots/spec.md` (stub — los requirements y scenarios completos vendrán con la change `snapshots-implementation`), `openspec/specs/reports/spec.md`, `openspec/specs/ui/spec.md` — los specs canónicos de capabilities (siete capabilities; sólo `snapshots` es stub en v0.4.1). Cada spec declara el **qué** (requirements + scenarios), no el **cómo** (file paths, nombres de componentes, sintaxis de schema).
- `openspec/changes/archive/2026-06-29-transactions-ui/` — la carpeta de change archivada con la traza completa de auditoría (proposal, design, tasks, 6 slice apply-progress notes, verify-report, sync-report, archive note). Otras carpetas archivadas cubren `accounts-ledger`, `auth-foundation`, `fx-cache`, `transactions`, `reports`, y la reapertura slice-C.
- `CHANGELOG.md` — el historial Keep-a-Changelog (`0.2.0`, `0.2.1`, `0.3.0`, `0.4.0` + el tag operacional v0.4.1).
- `Documents-es/` — el espejo en español de cada Markdown en inglés del repo (mismo path, mismo filename, traducción fiel).

## License

Proyecto privado. No se shipa un archivo `LICENSE` con el repo. Todos los derechos reservados por el autor (`Sebastián Illa`) salvo y hasta que se agregue una licencia explícita.

## Contributing

Los PRs son bienvenidos en una worktree branch off `develop`. Leer `AGENTS.md` primero — es el agent contract del proyecto y cubre el git workflow, el lifecycle de OpenSpec, los docs en dos idiomas y las reglas absolutas (Domain independence, Ports & Adapters, sin `any`, `strict: true`, etc.). Seguir el OpenSpec workflow para cambios no triviales (cualquier cosa que cruce una frontera de módulo, toque seguridad o aislamiento de datos, o cambie una API pública). Usar Conventional Commits. Mantener el Markdown en inglés y el espejo en `./Documents-es/` en el mismo commit atómico.

Un primer issue razonable podría ser: tomar un follow-up de `ui-dark-mode` o `ui-i18n` de las release notes de v0.4.0 (los dark-mode tokens están declarados pero sin usar; el message catalog de i18n es una superficie green-field). Otros puntos de entrada: el spec de la capability `snapshots` está en su lugar pero aún no implementado; la capability `revenue-categories` y la capability `budgets` están forward-declared. Los bug reports contra el tag v0.4.1 son valiosos — reportarlos en GitHub con los pasos de repro, la ruta + query params, el Sentry event id (si hay), y el comportamiento esperado vs el actual.
