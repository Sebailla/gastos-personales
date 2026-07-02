# Propuesta — `transactions-ui`

**Estado**: archivado (2026-06-29, sdd-archive después de PR #104) · **Autor**: Sebastián Illa
**Creado**: 2026-06-27 · **Slice objetivo**: MVP-4 (superficie de producción) · **Archivado**: 2026-06-29 (post-merge de los PRs #98/#99/#100/#101/#102/#103 + cleanup 4R #104 en `develop`)
**Upstream**: `openspec/AGENTS.md` (ciclo de vida del proyecto) · `openspec/config.yaml` (slot de capability `ui` reservado en la línea 15; TDD estricto; auto-forecast, 400 líneas)
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas; review budget 400)
**Upstream**: contrato del proyecto (`AGENTS.md` raíz §2, §4.7, §5.4, §13; `openspec/AGENTS.md` autor/dependencias)
**Downstream**: `snapshots` (futuro) — el slot de capability `ui` y los componentes presentacionales son reutilizables para la superficie de patrimonio en el tiempo.

> Primera escritura de la propuesta de `transactions-ui`. El cambio introduce la
> **superficie de UI de producción** para las tres superficies CRUD + read
> que hoy se envían como Server Components smoke-minimal bajo
> `app/transactions/`, `app/accounts/` y `app/dashboard/`. El reemplazo es una
> UI basada en primitivas de design-system: tokens, componentes base, layout
> shell y composición por superficie. **v1 envía solo web** — dark mode,
> i18n (EN/ES), mobile native y librerías de charts quedan fuera de v1
> (diferidos a cambios follow-up). El cambio también crea la **spec de la
> capability `ui`** en `openspec/specs/ui/spec.md` (canónica) más una spec
> delta que extiende REQ-TX-15 (el requirement existente de smoke UI) en un
> requirement de UI de calidad de producción.

## Por qué

`auth-foundation`, `accounts-ledger`, `fx-cache`, `transactions` y `reports`
enviaron sus superficies de lectura y escritura pero la UI visible es
**smoke-minimal** en cada página. El hueco de producto se ve en el primer
paint: el usuario puede registrar una transacción, pero la página de lista es
un `<table>` sin orden, sin filtro, sin ilustración de empty state, sin
navegación por teclado. El create form es un `<form>` escrito a mano sin
validación inline, sin error a nivel de campo, sin estado de carga. El
dashboard renderiza tres cards read-only sin account picker, sin month
switcher, sin jerarquía visual que se pueda capturar en una screenshot.

Cuatro señales a nivel de seam confirman que el cambio está listo para
enviarse ahora:

1. **El slot de capability `ui` está reservado y vacío.** La línea 15 de
   `openspec/config.yaml` declara la capability `ui`; la carpeta
   `openspec/specs/ui/` no existe. La propuesta crea ambas. No hay cambio de
   interfaz en ninguna otra capability — la UI es un concern de presentación
   que consume las rutas Hono existentes sin cambios.
2. **Los seams de lectura y escritura son estables.** Cada página ya pasa
   por `serverHonoRequest` (REQ-TX-15, REQ-RPT-7). El cambio de UI reemplaza
   la capa de render; la forma de datos (`TransactionDTO`,
   `FinancialAccountWire`, `MonthlySummaryDTO`, etc.) queda congelada.
3. **Las páginas smoke cargan un header explícito "not production".** Cada
   página smoke está tagueada con `// smoke-minimal, not production` en un
   comentario al inicio del archivo (la convención comenzó en el slice de
   `accounts`). El marcador es el seam — reemplazá el archivo, mantené la
   ruta, mantené el auth gate, mantené el contrato de datos.
4. **Las primitivas de Tailwind v4 ya están en uso.** Las páginas smoke
   existentes renderizan con la tabla de tokens de Tailwind v4 del proyecto
   (`bg-blue-600`, `text-blue-900`, `rounded`, etc.); la UI de producción
   extiende esa tabla, no un nuevo design system. La regla de arquitectura
   "no new top-level dependencies" prohíbe shadcn/NextUI/MUI/Chakra — las
   primitivas se construyen a mano encima de lo que ya está instalado.

Las consecuencias downstream (diferidas, mencionadas acá para trazabilidad):
`snapshots` (patrimonio en el tiempo) reusa el layout shell del dashboard y
las primitivas del design system para su propia superficie de lectura;
cambios futuros de i18n y dark mode extienden la tabla de tokens de la
capability `ui`, no los componentes a nivel de página.

## Qué

El cambio se envía en **seis slices encadenados** — cinco slices de
implementación + un slice de docs/verificación — cada uno un PR
auto-contenido que apunta a `develop` y que gatea con la merge del slice
previo. El cache `auto-forecast` del orquestador puede partir o fusionar
slices durante `sdd-tasks`; el presupuesto por slice de abajo es la
recomendación de la propuesta.

### Slice 1 — `ui-primitives` (PR #1)

- **Tabla de tokens** en `app/_ui/tokens.css` — declaraciones de tokens
  CSS-first de Tailwind v4 que extienden la tabla de clases existente. Los
  tokens de v1 cubren: escala de spacing (`ui-space-{1..8}`), roles de color
  (`ui-bg`, `ui-bg-muted`, `ui-bg-subtle`, `ui-fg`, `ui-fg-muted`,
  `ui-border`, `ui-accent`, `ui-danger`, `ui-success`, `ui-warning`),
  escala de radius (`ui-rounded-sm (or -md, -lg, -full)`), elevación
  (`ui-shadow-sm (or -md, -lg)`), escala de tipografía (`ui-text-{xs,sm,base,lg,
xl,2xl,3xl}` + los `ui-font-normal (or -medium, -semibold, -bold)`
  correspondientes). **Sin nueva paleta de colores** — la paleta de Tailwind
  v4 existente se consume vía CSS custom properties, no hard-codeada.
- **Componentes base** en `app/_ui/` (Server Component por default, Client
  Component solo cuando son interactivos): `Button`, `Input`, `Textarea`,
  `Select`, `Checkbox`, `RadioGroup`, `FieldError`, `FormField`, `Card`,
  `CardHeader`, `CardBody`, `CardFooter`, `Table`, `TableHeader`,
  `TableBody`, `TableRow`, `TableCell`, `Badge`, `EmptyState`, `Spinner`,
  `Skeleton`, `Pagination`, `Breadcrumb`, `Link`. Cada componente acepta un
  override por `className` y forwarda todos los atributos HTML estándar. Sin
  proliferación de boolean props `as`/`variant` (precedente de Vercel
  composition patterns; composición vía children + compound components, no
  flags booleanos).
- **Layout shell** en `app/_ui/layout/` — `PageHeader`, `PageContainer`,
  `Sidebar`, `Topbar`, `BreadcrumbBar`. El shell reemplaza el wrapper bare
  `<main className="p-6">` que usan las páginas smoke. El root layout
  existente `app/layout.tsx` se reusa; sin nuevo wrapper global.
- **Tests** en `app/_ui/*.test.tsx` (Vitest + Testing Library) — render de
  cada componente en su estado primario, su estado de loading/disabled
  (donde aplique) y su empty state (donde aplique). Snapshot tests para los
  componentes presentacionales estáticos (`Card`, `Badge`, `EmptyState`,
  `Skeleton`, `Breadcrumb`). Coverage gate por slice: ≥ 80% en
  `app/_ui/`.
- **Sin nueva dependencia.** Cada primitiva se construye a mano sobre
  React 19, Tailwind v4 y la tabla de clases existente del proyecto.

### Slice 2 — `accounts-ui` (PR #2)

- **Tres páginas reemplazadas** en `app/accounts/{page.tsx,
[id]/page.tsx, new/page.tsx}`. Cada una mantiene el auth gate, el data
  fetch y la ruta de la página smoke — solo se cambia el render a las
  primitivas del design system.
- **`AccountsListTable`** reemplazada en
  `app/accounts/accounts-list-table.tsx` — usa las primitivas `Table` /
  `TableHeader` / `TableBody` / `TableRow` / `TableCell`. Columnas nuevas:
  `Last activity` (computada desde la transacción más reciente por cuenta;
  fetched vía un nuevo query flag `GET /api/accounts?include=lastActivity`
  — ver BR-UI-1 abajo), badge `Archived` para cuentas archivadas (la
  página smoke las filtra; la UI de producción las expone detrás de un
  toggle `Archived`).
- **`AccountDetail`** reemplazada en
  `app/accounts/[id]/account-detail.tsx` — usa `Card` / `CardHeader` /
  `CardBody` / `CardFooter` más el `BalanceWidget` existente (sin cambio de
  lógica en el widget; solo un nuevo wrapper visual). El layout `<dl>` se
  reemplaza por un `Card` apilado con `CardHeader` (nombre de cuenta +
  badge de currency + badge de archivada) y `CardBody` (filas key-value).
- **`CreateAccountForm`** reemplazada en
  `app/accounts/new/create-account-form.tsx` — usa `FormField` + `Input` +
  `Select` + `FieldError` + `Button`. Los errores de validación inline se
  renderizan al lado del campo ofensor. Estado de loading en el botón de
  submit (icono `Spinner` + `disabled`). La lógica de submit del form no
  cambia (`createAccountServerAction`).
- **Tests** en `app/accounts/**.test.tsx` — extender el
  `create-account-form.test.tsx` existente con el nuevo render; nuevo
  `accounts-list-table.test.tsx` para el componente de tabla (sort,
  paginación, empty state, archived toggle); nuevo
  `account-detail.test.tsx` para el render del detail. Coverage gate:
  ≥ 80% en `app/accounts/`.
- **Accesibilidad**: todo elemento interactivo tiene un focus ring visible
  (`focus-visible:ring-2`), todo form field tiene un `<label>` pareado,
  toda tabla tiene `<caption>` y headers con `scope="col"`. La corrida de
  axe-core es parte del verify gate.

### Slice 3 — `transactions-ui` (PR #3)

- **Tres páginas reemplazadas** en
  `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}`. Mismo patrón
  que accounts: auth gate + data fetch sin cambios; render cambiado.
- **`TransactionsListTable`** reemplazada en
  `app/_components/transactions-list-table.tsx` — usa la primitiva
  `Table`. Columnas nuevas: `Direction` (badge coloreado por direction —
  `INCOME` verde, `EXPENSE` rojo, espejando el estilo `Badge` en español
  existente), `Account` (nombre de cuenta, fetched desde el join o desde
  un nuevo query flag `include=accountName`), `Date`, `Native amount`,
  `Converted amount`, `Rate as of` (tiempo relativo, p. ej. "2 hours
  ago"), `Memo`, `Category`. Sort por `Date` descending por default;
  click-to-sort sobre `Date`, `Native amount`, `Converted amount`.
  Paginación cursor-based vía la primitiva `Pagination` (la página smoke
  renderiza un footer estático; la UI de producción renderiza controles
  clickeables).
- **`TransactionDetail`** reemplazada en
  `app/transactions/[id]/transaction-detail-forms.tsx` — layout `Card`
  con los campos de la fila agrupados (Identification, Amount, FX
  snapshot, Audit). El edit form usa `FormField` + `Input` + `Select`;
  el botón de delete usa un confirm dialog (primitiva `Dialog`) en
  lugar del `confirm()` de browser de la página smoke.
- **`CreateTransactionForm`** reemplazada en
  `app/transactions/new/create-transaction-form.tsx` — usa `FormField` +
  `Input` + `Select` + `Textarea` + `FieldError` + `Button`. El
  `<select name="accountId">` ahora es un combobox searchable (primitiva
  `Combobox` — selección simple desde la lista de cuentas activas). La
  validación inline muestra el primer mensaje de error de la respuesta del
  API al lado del campo ofensor, con `aria-describedby` linkeando el
  campo al error.
- **Tests** en `app/transactions/**.test.tsx` + nuevo
  `transactions-list-table.test.tsx` (sort, paginación, filtro por
  cuenta, empty state) + nuevo
  `transaction-detail-forms.test.tsx` (submit de edit, confirm de delete,
  render del FX snapshot). Coverage gate: ≥ 80% en
  `app/transactions/`.

### Slice 4 — `dashboard-ui-refactor` (PR #4)

- **`app/dashboard/page.tsx`** reemplazada — la página mantiene el patrón
  Server Component (auth gate + `Promise.all` paralelo a los endpoints de
  reports), pero el render usa las primitivas `PageHeader` + `Card` +
  `EmptyState`. Las tres cards pasan de un CSS-grid `lg:grid-cols-3` a
  un layout apilado en viewports chicos y un grid 1+2 en viewports
  grandes (la summary card ocupa todo el ancho; las cards de breakdown
  - flow comparten la segunda fila).
- **Nuevo `AccountPicker`** en
  `app/_components/dashboard-account-picker.tsx` — Client Component que
  dispara una navegación a `?accountId=<id>` en la URL del dashboard.
  La card de flow ahora fetcha
  `/api/reports/accounts/:id/flow` cuando hay un parámetro
  `?accountId=` presente (la página smoke renderiza el empty state en
  cada visita; la UI de producción deep-linkea al flujo por cuenta).
- **Month switcher** en
  `app/_components/dashboard-month-switcher.tsx` — Client Component que
  renderiza `<Link>`s para el mes previo / actual / siguiente. La página
  lee `?month=YYYY-MM` desde los search params (default: mes UTC actual).
- **`MonthlySummaryCard`**, **`CategoryBreakdownCard`**,
  **`AccountFlowCard`** refactorizadas — render cambiado a primitivas
  `Card` + `Table` + `Badge` + `EmptyState`. Sin cambio en data shape.
  Los tests existentes (`dashboard-*.test.tsx`) se extienden.
- **Coverage gate**: ≥ 80% en `app/dashboard/` y `app/_components/`.

### Slice 5 — `integration-tests` (PR #5)

- **Suite axe-core a11y** en `tests/a11y/` — Vitest +
  `@axe-core/playwright` (o `vitest-axe` si se agrega un runner de
  Playwright después). Cada página se renderiza con data seeded
  autenticada; la aserción es
  `expect(await axe(container)).toHaveNoViolations()`. El verify gate
  falla ante cualquier violation con severidad `critical` o `serious`;
  `moderate` y `minor` son warnings que se loguean pero no bloquean.
- **Suite de visual snapshots** en `tests/visual/` — para cada
  componente presentacional (`Card`, `Badge`, `EmptyState`, `Skeleton`,
  `Breadcrumb`, `Pagination`, `Dialog`, `Combobox`, `Button`, `Input`,
  `Select`, `Textarea`, `FieldError`) en su empty state, su loading
  state, su error state (donde aplique) y su populated state. Los
  archivos de snapshot viven en `tests/visual/__snapshots__/`.
- **E2E happy paths** en `tests/e2e/` — tres specs de Playwright
  (agregados si hay un runner de Playwright en su lugar; si no, el smoke
  se queda en Vitest + Testing Library):
  1. Sign in → registrar un expense USD contra una casa ARS →
     verificar que el dashboard refleja el monto convertido.
  2. Sign in → archivar una cuenta → verificar que desaparece de la
     lista activa y aparece detrás del toggle `Archived`.
  3. Sign in → navegar a `/accounts/X` → verificar que el balance
     widget renderiza el monto convertido a casa.
- **Manual QA checklist** en `docs/qa/transactions-ui.md` + mirror
  español en `Documents-es/docs/qa/transactions-ui.md`:
  - Keyboard navigation en cada página (orden de Tab, focus visible,
    activación con Enter/Space, Escape para cerrar dialogs).
  - Recorrido con screen reader en cada página (VoiceOver en macOS,
    NVDA en Windows) — landmarks, headings, headers de tabla, labels
    de form, anuncios de error.
  - Dark mode está **fuera de scope para v1** — el checklist lo
    registra como follow-up.

### Slice 6 — `docs-and-perf` (PR #6)

- **`openspec/specs/ui/spec.md`** spec canónica creada por `sdd-archive`
  desde la delta spec.
- **`openspec/specs/transactions/spec.md`** delta — REQ-TX-15 se
  reemplaza (no se extiende) por los requirements de UI de producción;
  el delta carga las adiciones de BR-UI-N.
- **`docs/architecture/ui.md`** — referencia de design system de una
  página (tabla de tokens + inventario de componentes). Mirror
  español en `Documents-es/docs/architecture/ui.md`.
- **`CHANGELOG.md`** actualizado bajo `## [Unreleased]` con la sección
  Added listando las nuevas primitivas del design system y las
  superficies de UI de producción.
- **Verificación Lighthouse / Perf budget** — corrida manual en las
  tres páginas primarias (`/`, `/dashboard`, `/transactions`) bajo
  perfil 4G + Moto G4 simulado. La aserción es p95 page load < 2s
  (root `AGENTS.md` §10.5). El comando de verificación es
  `pnpm build && pnpm start` + Lighthouse CLI; el output se pega en
  `docs/perf/transactions-ui.md`.

## Out of scope (este cambio)

- **Dark mode.** La tabla de tokens está dark-mode-ready (usa CSS
  custom properties), pero el tema de v1 es light only. Un cambio
  follow-up `ui-dark-mode` agrega los valores de tokens dark y el
  toggle.
- **i18n (inglés / español).** v1 envía el copy que ya usan las
  páginas smoke (mezcla español + inglés; el copy del dashboard es
  español según el cambio `reports`). Un cambio follow-up `ui-i18n`
  introduce un message catalog.
- **Mobile native.** Solo web. El layout es responsive hasta 375px
  (el target más chico del spec de Tailwind v4) pero no se agrega
  un shell de React Native / Expo.
- **Librería de charts.** El dashboard renderiza `Table` + barras de
  progreso CSS. Sin `recharts` / `chartjs` / `d3`. La decisión de la
  librería de charting se difiere a un cambio follow-up `ui-charts`
  una vez que la dirección de UX esté lockeada.
- **Auditoría de accesibilidad más allá de WCAG 2.2 AA.** AA es el
  floor (axe-core `critical` + `serious` son cero). Auditorías AAA
  (contraste de text-on-accent, paridad total de teclado en cada
  interacción de drag) se difieren.
- **Design review / sign-off de stakeholder.** La dirección visual se
  aprueba en la fase de proposal; la review pixel-perfect es
  responsabilidad del usuario durante el verify gate.
- **Beta testing.** Sin TestFlight / internal beta. v1 se envía en
  `develop` y mergea a `main` según el release flow estándar (§5.5
  `AGENTS.md` raíz).
- **Capability `snapshots`.** La UI de patrimonio en el tiempo no
  está en scope. El slot `snapshots` en `openspec/config.yaml:14`
  está forward-declared pero queda vacío hasta que un cambio futuro
  introduzca tanto el data model como la superficie.

## Non-goals

- **No es una nueva capa de datos.** Cada página sigue pasando por el
  API Hono existente (`serverHonoRequest`). Sin nuevos repository
  ports. Sin nuevos Prisma models. Sin nuevas migrations.
- **No es una nueva librería de state-management.** Sin Zustand /
  Jotai / Redux. Los Server Components son dueños del read path; los
  Client Components son dueños del form state local. El mismo patrón
  que las páginas smoke.
- **No es una nueva librería de charting.** Ver "Librería de
  charts" arriba.
- **No es un nuevo framework HTTP.** Sin tRPC / GraphQL. El
  catch-all de Hono en `app/api/[...path]/route.ts:7-25` se reusa
  sin cambios.
- **No es un nuevo modelo de auth.** El helper server-side `auth()`
  existente (`src/modules/auth/nextauth`) gatea cada página. El
  cross-user isolation (`BR-TX-4`, `BR-ACC-12`) se enforce en la
  capa Hono, no en la capa de UI.
- **No es una re-arquitectura del data flow de las páginas smoke.**
  Las páginas mantienen su `redirect()` ante 401 y su
  `throw new Error(message)` ante 5xx. La UI de producción agrega
  error boundaries user-facing (`app/error.tsx`,
  `app/dashboard/error.tsx`, etc.) pero el data flow a nivel de
  página no cambia.
- **No es un rediseño del API de `reports`.** Los tres endpoints
  de reports (`/api/reports/monthly`, `/api/reports/breakdown`,
  `/api/reports/accounts/:id/flow`) se consumen sin cambios. Los
  nuevos query parameters `?accountId=` y `?month=` del dashboard
  son UI state, no superficie de API nueva.

## Users and situations

| User                                           | Situation                                                                                                                                                                  | Touchpoint                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Usuario autenticado                            | Visita `/transactions` para revisar actividad reciente. Ve una tabla sortable y paginada con badges de direction y filtros inline (cuenta, rango de fecha, categoría).     | `app/transactions/page.tsx`                    |
| Usuario autenticado                            | Click en "New transaction" → llena el form → submitea. Ve errores de validación inline; en éxito, aterriza en la detail page de la transacción nueva.                      | `app/transactions/new/page.tsx`                |
| Usuario autenticado                            | Abre la detail page de una transacción para auditar el FX snapshot. Ve el rate-as-of, la casa y el converted amount en una sola card. Edita el memo; el FX snapshot queda. | `app/transactions/[id]/page.tsx`               |
| Usuario autenticado                            | Visita `/dashboard` para ver los totales del mes. Elige una cuenta desde el picker → ve el flow por cuenta. Cambia el mes → ve los datos del mes previo.                   | `app/dashboard/page.tsx`                       |
| Usuario autenticado                            | Visita `/accounts` para ver las cuentas activas. Toggle del filtro `Archived` → ve las cuentas archivadas en un tab separado.                                              | `app/accounts/page.tsx`                        |
| Usuario nuevo (sin cuentas, sin transacciones) | Visita `/dashboard`. Ve una ilustración de empty state + un CTA hacia `/transactions/new`. Sin crash. Sin footer roto.                                                     | `app/dashboard/page.tsx` (rama de empty state) |
| Usuario keyboard-only                          | Tabea a través de la página de lista. Ve focus rings en cada elemento interactivo. Activa los sort headers con `Enter`.                                                    | Cada página (floor de a11y)                    |
| Usuario de screen reader                       | Navega `/transactions/new`. Escucha los labels de los campos, los errores inline (`aria-describedby`) y el toast de éxito.                                                 | Cada página (floor de a11y)                    |

## Business rules

El cambio carga los BRs existentes de `auth`, `accounts`, `fx`,
`reports` y `transactions` verbatim y agrega una nueva familia de BRs
(`BR-UI-N`) para las primitivas del design system y las superficies de
UI de producción. La fase de spec escribe los Scenarios completos.

1. **BR-TX-4 (cargada).** Toda referencia cross-module scopea a
   `userId`. La UI de producción no bypasea esto — las rutas Hono ya
   lo enforcean; la UI solo renderiza.
2. **BR-TX-15 (cargada, REEMPLAZADA).** El REQ-TX-15 original ("tres
   páginas smoke") se reemplaza por los requirements de UI de
   producción. La fase de spec escribe el delta que supersede el
   wording original.
3. **BR-ACC-12 a BR-ACC-19 (cargadas).** La página de accounts sigue
   el mismo filtro `archivedAt=null` en el API; la UI de producción
   agrega un toggle `Show archived` que levanta el filtro del lado
   del cliente.
4. **BR-RPT-7 (cargada).** El auth gate del dashboard se queda en el
   Server Component. Los nuevos query parameters `?accountId=` y
   `?month=` son UI state puro; el userId scoping de las rutas Hono
   es el access control.
5. **BR-UI-1 (NUEVA).** El endpoint de lista de accounts PUEDE aceptar
   un query flag `include=lastActivity`; cuando está presente, la
   respuesta incluye un campo `lastActivityAt` por fila (el
   `transactionDate` de la transacción más reciente). La UI usa esto
   para renderizar la columna `Last activity`. El endpoint SIN el
   flag no cambia.
6. **BR-UI-2 (NUEVA).** El endpoint de lista de transactions PUEDE
   aceptar un query flag `include=accountName`; cuando está
   presente, la respuesta incluye `accountName` por fila. Misma regla
   de backward-compat que BR-UI-1.
7. **BR-UI-3 (NUEVA).** Toda primitiva interactiva tiene un indicador
   de focus visible. `Button`, `Link`, `Input`, `Select`, `Combobox`,
   `Checkbox`, `RadioGroup`, acciones de fila de `Table` y controles
   de `Pagination` renderizan `focus-visible:ring-2` (o token de
   Tailwind v4 equivalente).
8. **BR-UI-4 (NUEVA).** Todo form field tiene un `<label>` pareado (o
   `aria-label` para botones icon-only). El link
   `<label htmlFor="...">` se enforcea por un test.
9. **BR-UI-5 (NUEVA).** Los errores de form se exponen inline. El
   primer mensaje de error de la respuesta del API se renderiza al
   lado del campo ofensor con `aria-describedby` linkeando el campo
   al error. El form no depende solo de un alert al tope del form.
10. **BR-UI-6 (NUEVA).** Los botones de submit renderizan un estado
    de loading (`Spinner` + `disabled` + `aria-busy="true"`) mientras
    la Server Action está en vuelo. Los double-clicks se debouncean.
11. **BR-UI-7 (NUEVA).** Las tablas tienen `<caption>` (visible o
    `sr-only`) y headers `<th scope="col">`. Las columnas sortables
    renderizan `aria-sort` reflejando el sort actual.
12. **BR-UI-8 (NUEVA).** La UI de producción envía un único tema
    light. Los tokens de dark mode están declarados pero sin usar.
    Un cambio follow-up los activa.
13. **BR-UI-9 (NUEVA).** La tabla de tokens está documentada en
    `docs/architecture/ui.md`. La intención, props y contrato de a11y
    de cada primitiva están documentados. Componentes nuevos
    agregados sin docs fallan el verify gate.

## Affected areas

| Area                                                                                                | Impact          | Description                                                                                               |
| --------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| `app/_ui/`                                                                                          | New             | Primitivas del design system (tokens, componentes base, layout shell). Single source of UI truth.         |
| `app/_ui/tokens.css`                                                                                | New             | Declaraciones de tokens CSS-first de Tailwind v4 (colores, spacing, radius, elevación, tipografía).       |
| `app/accounts/page.tsx`, `[id]/page.tsx`, `new/page.tsx`                                            | Modified        | Render smoke reemplazado por render de producción. Auth gate + data fetch sin cambios.                    |
| `app/accounts/accounts-list-table.tsx`                                                              | Modified        | Componente de tabla de producción (sort, paginación, archived toggle, columna last-activity).             |
| `app/accounts/[id]/account-detail.tsx`                                                              | Modified        | Render de detail de producción (layout Card). Sin cambio de datos.                                        |
| `app/accounts/new/create-account-form.tsx`                                                          | Modified        | Form de producción (FormField, validación inline, estado de loading). Lógica de submit sin cambios.       |
| `app/transactions/page.tsx`, `[id]/page.tsx`, `new/page.tsx`                                        | Modified        | Mismo swap que accounts.                                                                                  |
| `app/transactions/[id]/transaction-detail-forms.tsx`                                                | Modified        | Forms de edit + delete de producción (layout Card, confirm basado en Dialog).                             |
| `app/transactions/new/create-transaction-form.tsx`                                                  | Modified        | Form de producción con Combobox searchable para selección de cuenta.                                      |
| `app/_components/transactions-list-table.tsx`                                                       | Modified        | Componente de tabla de producción.                                                                        |
| `app/dashboard/page.tsx`                                                                            | Modified        | Render de producción con search params `?accountId=` y `?month=`. Auth gate + fetch paralelo sin cambios. |
| `app/_components/dashboard-account-picker.tsx`, `dashboard-month-switcher.tsx`                      | New             | Client Components para state de query params del dashboard.                                               |
| `app/_components/dashboard-monthly-summary (or -category-breakdown, -account-flow).tsx`             | Modified        | Swap de render a primitivas Card + Table + Badge. Sin cambio en data shape.                               |
| `app/error.tsx`, `app/dashboard/error.tsx`, etc.                                                    | New             | Error boundaries user-facing por segmento de ruta. Reemplazan la página de error default de Next.js.      |
| `openspec/specs/ui/spec.md`                                                                         | New (canónica)  | Creada por `sdd-archive` desde la delta spec. Reservada en `openspec/config.yaml:15`.                     |
| `openspec/specs/transactions/spec.md`                                                               | Modified        | REQ-TX-15 se REEMPLAZA (no se extiende) por los requirements de UI de producción.                         |
| `openspec/changes/transactions-ui/{specs,design,tasks,apply-progress,verify-report,sync-report}.md` | New (per phase) | Cada fase de SDD escribe su artefacto en la carpeta del cambio.                                           |
| `Documents-es/openspec/changes/transactions-ui/proposal.md`                                         | New             | Mirror en español de este archivo. Mismo commit por root `AGENTS.md` §13.3.                               |
| `docs/architecture/ui.md`                                                                           | New             | Tabla de tokens + inventario de componentes.                                                              |
| `docs/qa/transactions-ui.md`                                                                        | New             | Manual QA checklist (keyboard, screen reader, follow-ups).                                                |
| `docs/perf/transactions-ui.md`                                                                      | New             | Output de verificación de Lighthouse + perf budget.                                                       |
| `CHANGELOG.md`                                                                                      | Modified        | `## [Unreleased]` → sección Added listando las primitivas + superficies de producción.                    |
| `package.json`                                                                                      | None            | Sin nuevas dependencias (restricción BR-UI).                                                              |
| `pnpm-lock.yaml`                                                                                    | None            | Sin nuevas dependencias → lockfile sin cambios (root `AGENTS.md` §5.3).                                   |
| `prisma/schema.prisma`                                                                              | None            | Sin nuevos models.                                                                                        |

## Acceptance (evidencia que verá el reviewer)

1. `pnpm test` corre la nueva suite de UI y sale 0 con **≥ 80% de
   coverage en `app/_ui/`, `app/accounts/`, `app/transactions/` y
   `app/dashboard/`** (gate de `test:coverage:enforced`).
2. `pnpm build` succeed con cero errores de TypeScript. El flag del
   compilador `strict: true` queda igual.
3. `pnpm lint` pasa con cero warnings en el código nuevo.
4. `pnpm dev` → sign in → visitar `/transactions` con 3 transactions
   en ARS + 2 en USD en 2 cuentas. La página renderiza una tabla
   sortable y paginada. Click en el header `Date` → las filas se
   re-sortan. Click en `Next page` → el cursor avanza.
5. Visitar `/transactions/new` sin cuentas. El Combobox renderiza un
   empty state `No accounts available`. Crear una cuenta primero →
   volver → el Combobox está poblado.
6. Submeter el create form con `amountMinor = 0`. El error inline
   aparece al lado del campo de amount con el mensaje
   `INVALID_AMOUNT` del API. El botón de submit queda disabled.
7. Visitar `/transactions/X` para una transacción USD contra una
   casa ARS. La fila `Rate as of` de la card renderiza el timestamp
   del snapshot como texto plano. El FX snapshot queda igual cuando
   el usuario edita solo el memo.
8. Visitar `/dashboard` sin transactions. La ilustración de empty
   state + el CTA `Record your first transaction` renderizan. Click
   en el CTA → `/transactions/new` carga.
9. Visitar `/dashboard` con transactions. Elegir una cuenta desde el
   `AccountPicker` → la card de flow muestra el flow diario por
   cuenta. Cambiar el mes → el summary + breakdown se actualizan.
10. Visitar `/accounts` → toggle `Show archived` → las cuentas
    archivadas aparecen con un badge. Toggle off → solo las cuentas
    activas renderizan.
11. **Keyboard nav**: tabbear a través de `/transactions` end-to-end.
    Cada elemento interactivo es alcanzable; el foco es visible en
    cada elemento; `Enter` activa los sort headers; `Escape` cierra
    el delete confirm dialog.
12. **Recorrido de screen reader** (VoiceOver en macOS): cada página
    anuncia el page title, los headings, los labels de los form
    fields y los mensajes de error inline.
13. **Corrida de axe-core** en cada página con data seeded: cero
    violations `critical`; cero violations `serious`. El integration
    test asserta esto y falla el build ante cualquier violation.
14. **Snapshot tests** pasan para cada primitiva presentacional en
    su estado primario. Drift de snapshot requiere el flag
    explícito `--update`.
15. **p95 page load < 2s** en `/`, `/dashboard` y `/transactions`
    bajo 4G + Moto G4 simulado (Lighthouse CLI). El output se pega
    en `docs/perf/transactions-ui.md`.
16. **Manual QA checklist** en `docs/qa/transactions-ui.md` se
    completa y se firma por el usuario durante el verify gate.
17. `openspec/specs/ui/spec.md` existe con al menos 5 Requirements
    y un Scenario cada uno después de que corra `sdd-archive`.
    `openspec/specs/transactions/spec.md` carga el delta de
    REQ-TX-15.
18. `./Documents-es/openspec/changes/transactions-ui/proposal.md`
    mirror existe con estructura idéntica. Sin debris de caracteres
    chinos según el mirror check de root `AGENTS.md` §13.3.
19. Sin drift de `pnpm-lock.yaml` después de que el cambio mergee
    (root `AGENTS.md` §5.3). El cambio envía cero nuevas
    dependencias top-level.
20. **Sin trailer `Co-authored-by`** en ningún commit (root
    `AGENTS.md` §4.5). **Header de Author** en cada doc nuevo es
    `Sebastián Illa` (sin formas de IA, según `openspec/AGENTS.md`).

## Risks

| Risk                                                                                           | Likelihood | Mitigation                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La tabla de tokens se fragmenta a través de los seis slices y rompe el claim de design system. | Medium     | El slice 1 (`ui-primitives`) es el único slice que toca `app/_ui/`. Los slices 2-5 importan de él; no lo extienden. El verify gate asserta que toda primitiva usada por la UI de producción está declarada en `app/_ui/`.                                                                                                                                                           |
| Sort + cursor pagination regresiona el contrato existente del API.                             | Low        | El sort es un concern puramente client-side sobre la página existente de `GET /api/transactions`; el contrato del API no cambia. El cursor es el campo `nextCursor` existente. El verify gate vuelve a correr el smoke flow contra la UI nueva.                                                                                                                                     |
| La primitiva Combobox termina tomando una dependencia de librería (`downshift`, etc.).         | Low        | La primitiva se construye a mano sobre el `<Select>` + un `<input>` del proyecto + los tokens de Tailwind v4 existentes. Sin nueva dependencia. Si el approach hand-built resulta limitante, un cambio follow-up introduce una primitiva de combobox curada.                                                                                                                        |
| Axe-core flagea una violation que la página smoke no tenía.                                    | Medium     | El verify gate se setea a cero `critical` + `serious`. `moderate` + `minor` se loguean pero no bloquean; el usuario los triagea. Un checklist `docs/qa/transactions-ui.md` captura los residuales como backlog.                                                                                                                                                                     |
| p95 < 2s no se cumple porque el dashboard fetcha tres endpoints en paralelo.                   | Medium     | Los tres fetches ya están paralelizados (existente `Promise.all`). La página es un Server Component; el fetch paralelo es en el server, no en el cliente. El verify gate corre Lighthouse contra el build de producción; si el budget falla, el orquestador parte las tres llamadas del dashboard en dos chunks (summary + breakdown; flow on-demand) sin romper el contrato de UI. |
| El mirror español driftea del original inglés.                                                 | Medium     | Aplicar atomicidad de root `AGENTS.md` §13.3; el `reviewer` chequea ambos archivos en el mismo commit. El mirror se crea en esta fase; las fases spec/design/tasks/apply/verify/sync cargan sus propios mirrors.                                                                                                                                                                    |
| El paso RED del TDD estricto se skipea para una primitiva, fallando al reviewer.               | Medium     | `sdd-tasks` es dueño de la estructura de tareas; `sdd-apply` enforce RED → GREEN → REFACTOR por tarea según `openspec/config.yaml:27-30`. La spec de la capability `ui` codifica BR-UI-3 a BR-UI-9; los tests son la prueba ejecutable.                                                                                                                                             |
| El cambio es demasiado grande para un solo PR (presupuesto 400 líneas).                        | High       | El cambio es **force-chained** según el cache `auto-forecast` del orquestador. Cada slice es un PR auto-contenido con su propio verify gate. El forecast de seis slices de abajo mantiene cada PR por debajo del presupuesto.                                                                                                                                                       |
| Dark mode se envía como un addition stealth.                                                   | Low        | La tabla de tokens está dark-ready pero el tema de v1 es light only (BR-UI-8). Un code review que detecte reglas de CSS de dark mode falla el verify gate.                                                                                                                                                                                                                          |
| Se filtra una forma de IA en un header de doc.                                                 | Low        | `openspec/AGENTS.md` prohíbe la atribución de IA; el `reviewer` chequea cada doc nuevo. El cambio es suficientemente chico como para que el check sea un solo grep.                                                                                                                                                                                                                 |

## Capabilities

> Esta sección es el CONTRATO entre esta propuesta y `sdd-spec`. La
> próxima fase lee esto para saber exactamente qué spec files crear
> o actualizar.

### Nuevas capabilities

- `ui`: dueña de las primitivas del design system (tabla de tokens,
  componentes base, layout shell), las superficies de UI de
  producción para `/transactions`, `/transactions/[id]`,
  `/transactions/new`, `/dashboard`, `/accounts`,
  `/accounts/[id]`, `/accounts/new`, y los artefactos de manual
  QA + perf budget. La capability vive en `app/_ui/` (primitivas)
  y las carpetas existentes `app/{transactions,accounts,dashboard}/`
  (sitios de consumo). La spec canónica es
  `openspec/specs/ui/spec.md`.

### Modified capabilities

- `transactions`: REQ-TX-15 ("three smoke pages mirror the accounts
  slice") se **reemplaza** por los requirements de UI de producción
  (REQ-UI-1 a REQ-UI-N, codificados en la spec de `ui`). El delta
  vive en `openspec/changes/transactions-ui/specs/transactions/
spec.md`; `sdd-archive` levanta el nuevo wording a la canónica
  `openspec/specs/transactions/spec.md` y elimina el wording smoke
  de REQ-TX-15. Sin cambio de BR; sin cambio de comportamiento en
  las rutas Hono.
- `accounts`: sin delta de spec. La UI de producción consume los
  endpoints `/api/accounts` existentes sin cambios. BR-ACC-14 a
  BR-ACC-19 (slice smoke) quedan; la UI de producción es un swap
  de render.
- `reports`: sin delta de spec. Los tres endpoints de reports del
  dashboard se consumen sin cambios. Los nuevos query parameters
  `?accountId=` y `?month=` son UI state, no superficie de API.
- `auth`, `fx`: sin cambios.

## Alternatives considered

1. **Adoptar shadcn/ui o NextUI.** Rechazado para v1. La regla del
   proyecto (root `AGENTS.md` §10.5 + restricciones del orquestador)
   prohíbe nuevas dependencias top-level para la UI. Las primitivas
   se construyen a mano sobre los tokens de Tailwind v4 existentes.
   Un cambio futuro reevalúa el trade-off una vez que se pague la
   deuda del design system.
2. **Adoptar primitivas de Radix UI (unstyled).** Rechazado para v1.
   Misma regla de dependencia. El floor de accesibilidad (focus
   rings, atributos `aria-*`) es alcanzable con primitivas
   hand-built + tests de axe-core; el valor de Radix es más visible
   en widgets complejos (Combobox, Dialog) donde la superficie de
   v1 es mínima. Si un cambio futuro `ui-complex-widgets` agrega un
   Combobox / DatePicker / etc., Radix es el primer candidato.
3. **Un PR con todo el rewrite de UI.** Rechazado. El presupuesto de
   400 líneas (root `AGENTS.md` §10.5 + `openspec/config.yaml:21`)
   es el floor; un PR lo excedería por 3-5x. El approach
   force-chained mantiene cada PR por debajo del presupuesto y deja
   que el verify gate atrape regresiones temprano.
4. **UI de producción en `app/v2/` como superficie paralela.**
   Rechazado. Una superficie paralela duplica el auth gate, el data
   fetch y la ruta, duplicando el costo de mantenimiento. Las
   páginas smoke están tagueadas "not production" precisamente para
   que la UI de producción las reemplace in place.
5. **i18n + dark mode en este cambio.** Rechazado. El scope lock del
   orquestador mantiene la v1 en web + light mode + copy mezclado
   EN/ES (la convención existente). Agregar i18n + dark mode
   infla el conteo de slices y el presupuesto por PR. Los dos son
   cambios follow-up que consumen la tabla de tokens y las
   primitivas sin cambios.
6. **Librería de charts en este cambio.** Rechazado. Misma
   rationale que el cambio `reports` §"Alternatives considered"
   item 4. El dashboard renderiza `Table` + barras de progreso CSS
   en v1.

## Forecast (force-chained, presupuesto 400 líneas)

El orquestador pre-cacheó `chainedPrStrategy: auto-forecast` y
`reviewBudgetLines: 400`. Según el §E review-workload guard, cada
slice DEBE ser un PR auto-contenido con start, finish,
verificación y rollback claros. Las líneas de forecast son
**changed lines (additions + deletions)** por slice.

| PR        | Slice                   | LoC low  | LoC high | Verification gate                                                                                                                                     |
| --------- | ----------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1        | `ui-primitives`         | 380      | 480      | `pnpm test app/_ui` sale 0; coverage ≥ 80% en `app/_ui/`; snapshot tests estables; sin nueva dep.                                                     |
| #2        | `accounts-ui`           | 240      | 360      | `pnpm test app/accounts` sale 0; coverage ≥ 80% en `app/accounts/`; axe-core cero critical/serious; pass manual de keyboard + screen reader.          |
| #3        | `transactions-ui`       | 320      | 460      | `pnpm test app/transactions` sale 0; coverage ≥ 80% en `app/transactions/`; axe-core cero critical/serious; FX snapshot inalterado en edit memo-only. |
| #4        | `dashboard-ui-refactor` | 220      | 340      | `pnpm test app/dashboard app/_components` sale 0; coverage ≥ 80%; verificados empty-state + account-picker + month-switcher.                          |
| #5        | `integration-tests`     | 200      | 320      | Suite axe-core verde; visual snapshots estables; e2e happy paths verdes.                                                                              |
| #6        | `docs-and-perf`         | 160      | 260      | Existen `docs/architecture/ui.md` + `docs/qa/transactions-ui.md` + `docs/perf/transactions-ui.md`; Lighthouse p95 < 2s en las tres páginas primarias. |
| **Total** | —                       | **1520** | **2220** | Los seis PRs mergeados; `pnpm test` verde; UI de producción enviada en `develop`.                                                                     |

- Decision needed before apply: **No** (scope lockeado en
  pre-propose; las cuatro preguntas + los valores de preflight del
  orquestador son los inputs).
- Chained PRs recommended: **Yes** (force-chained según el cache
  del orquestador; cada slice supera el presupuesto de 400 líneas
  si se entrega como un único PR; los presupuestos por slice están
  por debajo del límite).
- 400-line budget risk: **Low** por slice; **High** si se colapsa
  en un solo PR.

## Open questions

Estas cuatro preguntas se grillan en la sesión de pre-spec. Los
defaults de abajo son la forma propuesta para v1; la fase de spec
lockea el wording final.

1. **Query flags `include=lastActivity` y `include=accountName`
   (BR-UI-1, BR-UI-2).** Default: sí, aditivos, sin break de
   backward-compat. El flag va sobre los GET endpoints existentes;
   el response shape gana dos campos opcionales. La UI es el único
   consumer. Lockear el flag en la spec; la fase de spec escribe
   el requirement + scenario.
2. **Primitiva Combobox vs. `<select>` plain.** Default: Combobox
   hand-built sobre `<select>` + `<input>`. Sin nueva dependencia.
   El Combobox es searchable (el usuario tipea el nombre de la
   cuenta); el `<select>` subyacente es la primitiva semántica
   para los screen readers. Lockear el diseño en la spec.
3. **Dirección visual (light theme only).** Default: light only.
   Dark mode es follow-up. La tabla de tokens está dark-ready
   (CSS custom properties) pero el tema de v1 es un único set
   light. Lockear el wording de BR-UI-8 en la spec.
4. **Owner del manual QA.** Default: el usuario corre el checklist
   de `docs/qa/transactions-ui.md` durante el verify gate; el
   agente no lo autopasea. El verify gate falla hasta que el
   checklist esté firmado. Lockear el ownership en la spec.

## Dependencies

- **Inbound**: `transactions` (enviado) provee `TransactionDTO`,
  los seis endpoints Hono, el evento `TransactionRecorded` (sin
  uso por la UI) y el patrón de fixture in-memory (para los
  integration tests).
- **Inbound**: `accounts` (enviado) provee `FinancialAccountWire`,
  los tres endpoints Hono y el precedente de smoke UI (BR-ACC-14 a
  BR-ACC-19).
- **Inbound**: `reports` (enviado) provee `MonthlySummaryDTO`,
  `CategoryBreakdownDTO`, `AccountFlowDTO`, los tres endpoints
  Hono y los componentes presentacionales del dashboard (la UI de
  producción reemplaza la capa de render; el data shape queda
  congelado).
- **Inbound**: `auth-foundation` (enviado) provee el session gate
  (`auth()`) y la invariante `AuthUser` usada por cada Server
  Component.
- **Inbound**: `fx-cache` (enviado) provee el `FxRateProvider`
  consumido en write time (la UI no llama a FX directamente;
  renderiza las columnas snapshotteadas).
- **Outbound**: `snapshots` (futuro) reusa las primitivas del
  design system y el layout shell del dashboard para la superficie
  de patrimonio en el tiempo.
- **External**: ninguno. Sin nuevo servicio externo en v1.
- **Sin co-PRs**: `transactions-ui` no bloquea ningún cambio
  in-flight.

## Next step

`/sdd-spec transactions-ui` — escribir la delta spec en
`openspec/changes/transactions-ui/specs/ui/spec.md` (la nueva
capability `ui`) y en
`openspec/changes/transactions-ui/specs/transactions/spec.md`
(el delta del reemplazo de REQ-TX-15). Levantar la primera a la
canónica `openspec/specs/ui/spec.md` según el flujo de SDD archive.
La fase de spec lockeará las cuatro open questions y escribirá los
Requirements + Scenarios para BR-UI-1 a BR-UI-9.
