# Spec — Capability `ui`

**Autor**: Sebastián Illa
**Capability**: `ui`
**Cambio fuente**: `transactions-ui`
**Estado**: implementado · **Creado**: 2026-06-27 · **Promovido**: 2026-06-29 (sdd-archive, después de 6 PRs de slice mergeados en develop vía #98/#99/#100/#101/#102 + slice 6 docs-and-perf)
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4

> Spec canónica de la capability `ui`. Operacionaliza la propuesta
> de `transactions-ui` v1 (2026-06-27). El spec declara **lo que
> DEBE ser verdadero** después de que el cambio aterrice, no cómo
> implementarlo. Los detalles de implementación (paths de archivo,
> nombres de componentes, sintaxis de schemas, layout de tests)
> se limitan a lo que requiere el contrato cross-module.
>
> Esta es la **spec canónica** de la capability `ui`, promovida
> desde la delta en la carpeta del cambio el 2026-06-29 por la
> fase `sdd-archive` del cambio `transactions-ui` (ver
> `openspec/changes/transactions-ui/apply-progress.md` §"Slice 6
> — docs-and-perf"). La copia delta se mantiene en lockstep en
> `openspec/changes/transactions-ui/specs/ui/spec.md` como
> audit-trail; la canónica en `openspec/specs/ui/spec.md` es la
> fuente de verdad. El espejo en español vive en este archivo.

## Propósito

La capability `ui` es la **capa de presentación** de
`gastos-personales`. Es dueña de las primitivas del design system
(tabla de tokens, componentes base, layout shell) y de las
superficies de UI de producción que renderizan los seams de
lectura y escritura expuestos por las capabilities existentes
(`auth`, `accounts`, `transactions`, `reports`). La capability
garantiza que: (a) cada superficie respeta el gate existente de
Server Component `auth()` y no introduce un data path paralelo;
(b) cada primitiva de UI es **accesible WCAG 2.2 AA** en el floor
(violations `critical` + `serious` de axe-core son cero); (c) el
design system se **construye a mano** sobre los tokens de
Tailwind v4 existentes del proyecto, sin nuevas dependencias
top-level (no shadcn, no NextUI, no MUI, no Chakra, no Radix en
v1); (d) el tema de v1 es solo light y el copy es mixto EN/ES (la
convención existente); dark mode, i18n completo, mobile native y
librerías de charting quedan fuera de v1.

La capability expone dos flags aditivos de query sobre los GET
endpoints existentes — `include=lastActivity` sobre
`GET /api/accounts` e `include=accountName` sobre
`GET /api/transactions` — que son los únicos cambios de superficie
de API (los endpoints sin el flag quedan sin cambios). Los query
parameters `?accountId=` y `?month=` del dashboard son **UI state
puro** (lectura de search params), no superficie de API nueva.
Cualquier otro cambio de UI es un swap de render sobre rutas,
contratos de datos y endpoints Hono existentes.

## Alcance

### In scope

- Una nueva carpeta `app/_ui/` que contiene:
  - `app/_ui/tokens.css` — declaraciones de tokens CSS-first de
    Tailwind v4 que extienden la tabla de clases existente. Los
    tokens de v1 cubren spacing, roles de color, escala de
    radius, elevación y escala de tipografía (ver §Glosario).
  - Componentes presentacionales base (Server Component por
    default, Client Component solo cuando son interactivos):
    `Button`, `Input`, `Textarea`, `Select`, `Checkbox`,
    `RadioGroup`, `Combobox`, `FieldError`, `FormField`,
    `Card`, `CardHeader`, `CardBody`, `CardFooter`,
    `Table`, `TableHeader`, `TableBody`, `TableRow`,
    `TableCell`, `Badge`, `EmptyState`, `Spinner`,
    `Skeleton`, `Pagination`, `Dialog`, `Breadcrumb`,
    `Link`.
  - Primitivas de layout shell: `PageHeader`, `PageContainer`,
    `Sidebar`, `Topbar`, `BreadcrumbBar`.
- Un nuevo patrón de layout que reemplaza el wrapper bare
  `<main className="p-6">` de las páginas smoke. El root layout
  existente `app/layout.tsx` se reusa sin cambios; no hay nuevo
  wrapper global.
- Renders de producción para las tres superficies smoke
  existentes:
  - `app/accounts/{page.tsx, [id]/page.tsx, new/page.tsx}`
  - `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}`
  - `app/dashboard/page.tsx`
  - Los componentes presentacionales correspondientes
    (`AccountsListTable`, `AccountDetail`,
    `CreateAccountForm`, `TransactionsListTable`,
    `TransactionDetail`, `CreateTransactionForm`,
    `MonthlySummaryCard`, `CategoryBreakdownCard`,
    `AccountFlowCard`).
- Dos nuevos Client Components para el state de query params del
  dashboard:
  - `app/_components/dashboard-account-picker.tsx`
    (navega a `?accountId=<id>`).
  - `app/_components/dashboard-month-switcher.tsx`
    (renderiza `<Link>`s para el mes previo / actual /
    siguiente).
- Error boundaries user-facing por segmento de ruta:
  `app/error.tsx`, `app/dashboard/error.tsx`,
  `app/accounts/error.tsx`,
  `app/transactions/error.tsx`.
- Dos flags aditivos de query sobre los GET endpoints existentes:
  - `GET /api/accounts?include=lastActivity`
    (la respuesta gana `lastActivityAt` por fila).
  - `GET /api/transactions?include=accountName`
    (la respuesta gana `accountName` por fila).
- Tests:
  - Tests unitarios de Vitest + Testing Library por primitiva
    (estado primario, loading/disabled, empty state).
  - Snapshot tests para las primitivas presentacionales
    estáticas (`Card`, `Badge`, `EmptyState`, `Skeleton`,
    `Breadcrumb`).
  - Coverage ≥ 80% en `app/_ui/`, `app/accounts/`,
    `app/transactions/`, `app/dashboard/`.
- Artefactos de documentación:
  - `docs/architecture/ui.md` (tabla de tokens + inventario
    de componentes).
  - `docs/qa/transactions-ui.md` (manual QA checklist,
    user-owned).
  - `docs/perf/transactions-ui.md` (output de Lighthouse).

### Out of scope

- **Dark mode.** La tabla de tokens está dark-mode-ready (usa
  CSS custom properties), pero el tema de v1 es light only.
  Un cambio follow-up `ui-dark-mode` agrega los valores de
  tokens dark y el toggle.
- **i18n (inglés / español).** v1 envía el copy mixto EN/ES que
  ya usan las páginas smoke. Un cambio follow-up `ui-i18n`
  introduce un message catalog.
- **Mobile native.** Solo web. Layout responsive hasta 375px
  (el target más chico de Tailwind v4). Sin shell de React
  Native / Expo.
- **Librería de charts.** El dashboard renderiza `Table` +
  barras de progreso CSS. Sin `recharts` / `chartjs` / `d3`.
  Diferido a un cambio follow-up `ui-charts`.
- **Auditoría de accesibilidad más allá de WCAG 2.2 AA.** AA
  es el floor (violations `critical` + `serious` de axe-core
  son cero). Auditorías AAA (contraste text-on-accent, paridad
  total de teclado en interacciones de drag) se difieren.
- **Design review pixel-perfect.** La dirección visual se
  aprueba en la fase de propuesta. El sign-off del reviewer es
  responsabilidad del usuario durante el verify gate.
- **Beta testing.** Sin TestFlight / internal beta. v1 se envía
  en `develop` y mergea a `main` según el release flow
  estándar.
- **UI de la capability `snapshots`.** La superficie de
  patrimonio en el tiempo no está in scope. El slot
  `snapshots` en `openspec/config.yaml` está forward-declared
  pero queda vacío hasta que un cambio futuro introduzca tanto
  el data model como la superficie.

### Capability boundary

- `ui` es dueña de las primitivas del design system
  (`app/_ui/`), el layout shell, los renders de producción de
  las páginas, los Client Components de state de query params
  para el dashboard y los error boundaries por segmento de
  ruta.
- `ui` lee desde el Hono API existente
  (`serverHonoRequest`) — sin nuevos repository ports, sin
  nuevos Prisma models, sin nuevas migrations.
- `ui` PUEDE agregar los dos flags aditivos de query
  (`include=lastActivity` sobre `/api/accounts`,
  `include=accountName` sobre `/api/transactions`). El flag es
  opcional; el endpoint sin el flag DEBE quedar sin cambios. La
  forma de los datos gana solo campos opcionales.
- `ui` NO DEBE introducir nuevas dependencias top-level. Las
  primitivas se construyen a mano sobre React 19 + Tailwind v4
  - la tabla de clases existente del proyecto.
- `ui` NO DEBE bypasear el gate de Server Component `auth()`.
  Cada página DEBE mantener el patrón de session-resolution +
  redirect de las páginas smoke.
- `ui` NO DEBE agregar código de un framework HTTP nuevo,
  librerías de state-management o librerías de charting.
- Los search params `?accountId=` y `?month=` del dashboard son
  UI state, NO superficie de API nueva. Las rutas Hono quedan
  sin cambios; los search params se leen en el Server
  Component antes del fetch paralelo.

## Glosario

Los términos de abajo son parte del contrato. Cada uno se define
una vez acá y se usa verbatim a lo largo del spec.

| Término                | Definición                                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token**              | Una CSS custom property declarada en `app/_ui/tokens.css` (p. ej. `--ui-bg`, `--ui-space-2`). Los tokens son la única fuente de styling.                                                                                                                                   |
| **Primitiva**          | Un componente presentacional base en `app/_ui/` (p. ej. `Button`, `Card`, `Table`). Las primitivas aceptan un override por `className` y forwardan los atributos HTML estándar.                                                                                            |
| **Layout shell**       | Las primitivas estructurales que envuelven una página (`PageHeader`, `PageContainer`, `Sidebar`, `Topbar`, `BreadcrumbBar`).                                                                                                                                               |
| **Superficie**         | Una página de Next.js App Router que consume una o más primitivas para renderizar una feature (p. ej. `/transactions`, `/dashboard`).                                                                                                                                      |
| **Máquina de estados** | Los cuatro estados de UI que una superficie puede renderizar: `empty`, `loading`, `error`, `success`. Cada superficie declara qué estados cubre.                                                                                                                           |
| **Query flag**         | Un parámetro de query aditivo `?<key>=<value>` sobre un GET endpoint existente que, cuando está presente, augmenta la respuesta con campos opcionales extra. El endpoint sin el flag queda sin cambios.                                                                    |
| **A11y floor**         | El contrato mínimo de accesibilidad: violations `critical` + `serious` de axe-core son cero; todo elemento interactivo tiene un indicador de foco visible; todo form field tiene un `<label>` pareado (o `aria-label`); toda tabla tiene `<caption>` y `<th scope="col">`. |
| **WCAG 2.2 AA**        | El nivel de conformidad assertado por axe-core `critical` + `serious` = 0. AAA se difiere a un cambio follow-up.                                                                                                                                                           |
| **Snapshot test**      | Una aserción de Vitest que compara el output renderizado de un componente presentacional contra un golden file almacenado. Drift requiere el flag explícito `--update`.                                                                                                    |
| **Copy mixto EN/ES**   | La convención existente del proyecto: español para el copy y labels del dashboard, inglés para el texto de UI a nivel de componente (tooltips, button text, etc.). Un cambio follow-up `ui-i18n` introduce un message catalog.                                             |

## Reglas de negocio

Las reglas de abajo son normativas. Cada regla tiene un ID
estable para trazabilidad entre spec, design, implementación y
tests.

### Cargadas de otras capabilities

- **BR-TX-4 (cargada)** — Toda referencia cross-module a una
  transacción scopea a `userId`. La capability `ui` no
  bypasea esto; las rutas Hono ya lo enforcean. La UI solo
  renderiza.
- **BR-ACC-12 (cargada)** — El storage nunca se convierte. La
  UI renderiza las columnas snapshotteadas
  `convertedAmountMinor` / `convertedCurrency`; sin llamada
  live a FX en el read path.
- **BR-RPT-7 (cargada)** — El auth gate del dashboard vive en
  el Server Component. Los nuevos query parameters
  `?accountId=` y `?month=` son UI state; el userId scoping
  de las rutas Hono es el access control.

### Nuevas (familia BR-UI-N)

- **BR-UI-1 (NUEVA)** — `GET /api/accounts` PUEDE aceptar un
  query flag `include=lastActivity`. Cuando está presente, la
  respuesta incluye un campo `lastActivityAt` por cuenta (el
  `transactionDate` de la transacción más reciente, o `null`
  si la cuenta no tiene transacciones). El endpoint SIN el
  flag DEBE quedar sin cambios (sin campo `lastActivityAt`
  presente).
- **BR-UI-2 (NUEVA)** — `GET /api/transactions` PUEDE aceptar
  un query flag `include=accountName`. Cuando está presente,
  la respuesta incluye un campo `accountName` por transacción
  (el nombre de la cuenta padre). El endpoint SIN el flag
  DEBE quedar sin cambios (sin campo `accountName` presente).
- **BR-UI-3 (NUEVA)** — Toda primitiva interactiva renderiza un
  indicador de foco visible en `:focus-visible`. Las primitivas
  cubiertas son `Button`, `Link`, `Input`, `Select`,
  `Combobox`, `Checkbox`, `RadioGroup`, acciones de fila de
  `Table`, controles de `Pagination` y controles de `Dialog`.
  El tratamiento visual DEBE ser al menos `focus-visible:ring-2`
  (o un token equivalente de Tailwind v4).
- **BR-UI-4 (NUEVA)** — Todo form field renderiza un `<label
htmlFor="<field-id>">` pareado (o `aria-label` para botones
  icon-only). El pairing DEBE ser enforced por un test sobre
  cada form.
- **BR-UI-5 (NUEVA)** — Los errores de form se exponen inline.
  El primer mensaje de error de la respuesta del API se
  renderiza al lado del campo ofensor con `aria-describedby`
  linkeando el campo al error. El form NO DEBE depender
  solamente de un alert al tope del form.
- **BR-UI-6 (NUEVA)** — Los botones de submit renderizan un
  estado de loading (`Spinner` + `disabled` + `aria-busy="true"`)
  mientras la Server Action está en vuelo. Los double-clicks
  se debouncean.
- **BR-UI-7 (NUEVA)** — Las tablas renderizan `<caption>`
  (visible o `sr-only`) y headers `<th scope="col">`. Las
  columnas sortables renderizan `aria-sort` reflejando la
  dirección de sort actual.
- **BR-UI-8 (NUEVA)** — v1 envía un único tema light. Los
  tokens de dark mode están declarados pero sin usar. Un
  cambio follow-up `ui-dark-mode` los activa.
- **BR-UI-9 (NUEVA)** — La intención, props y contrato de a11y
  de cada primitiva están documentados en
  `docs/architecture/ui.md`. Componentes nuevos agregados sin
  docs fallan el verify gate. El manual checklist de
  `docs/qa/transactions-ui.md` es user-owned y el verify gate
  falla hasta que el usuario lo firme.

## Requisitos

### Augmentación de API (query flags)

#### Requirement: include=lastActivity agrega lastActivityAt a la lista de accounts (REQ-UI-1)

`GET /api/accounts` DEBE aceptar un query flag
`include=lastActivity`. Cuando el flag está presente, la
respuesta DEBE incluir un campo `lastActivityAt` por cuenta,
igual al `transactionDate` de la transacción más reciente
(ISO-8601) o `null` cuando la cuenta no tiene transacciones.
Cuando el flag está ausente, la respuesta NO DEBE incluir
`lastActivityAt`; el campo DEBE omitirse por completo de cada
fila. El endpoint sin el flag DEBE ser byte-identical al
contrato existente.

(Traces: BR-UI-1.)

#### Scenario: include=lastActivity retorna el timestamp

- GIVEN: una sesión autenticada
- AND: la cuenta `A` tiene 3 transacciones, la más reciente el
  `2026-06-15T12:00:00Z`
- WHEN: se llama a `GET /api/accounts?include=lastActivity`
- THEN: el status de la respuesta es `200`
- AND: la cuenta `A` está en la respuesta
- AND: `A.lastActivityAt` es `"2026-06-15T12:00:00.000Z"` (o un
  string ISO-8601 equivalente)

#### Scenario: include=lastActivity retorna null para cuentas vacías

- GIVEN: una sesión autenticada
- AND: la cuenta `B` existe con cero transacciones
- WHEN: se llama a `GET /api/accounts?include=lastActivity`
- THEN: la cuenta `B` está en la respuesta
- AND: `B.lastActivityAt` es `null`

#### Scenario: el endpoint sin el flag queda sin cambios

- GIVEN: cualquier estado
- WHEN: se llama a `GET /api/accounts` (sin flag)
- THEN: el status de la respuesta es `200`
- AND: ninguna fila de la respuesta lleva un campo
  `lastActivityAt`

#### Requirement: include=accountName agrega accountName a la lista de transactions (REQ-UI-2)

`GET /api/transactions` DEBE aceptar un query flag
`include=accountName`. Cuando el flag está presente, la
respuesta DEBE incluir un campo `accountName` por transacción,
igual al nombre de la cuenta padre. Cuando el flag está
ausente, la respuesta NO DEBE incluir `accountName`; el campo
DEBE omitirse por completo de cada fila. El endpoint sin el
flag DEBE ser byte-identical al contrato existente.

(Traces: BR-UI-2.)

#### Scenario: include=accountName retorna el nombre de la cuenta

- GIVEN: una sesión autenticada
- AND: la cuenta `A` tiene `name = "Main ARS account"`
- AND: existe una transacción `T` con `accountId = A`
- WHEN: se llama a `GET /api/transactions?include=accountName`
- THEN: el status de la respuesta es `200`
- AND: la transacción `T` está en la respuesta
- AND: `T.accountName` es `"Main ARS account"`

#### Scenario: el endpoint sin el flag queda sin cambios

- GIVEN: cualquier estado
- WHEN: se llama a `GET /api/transactions` (sin flag)
- THEN: el status de la respuesta es `200`
- AND: ninguna fila de la respuesta lleva un campo
  `accountName`

### Máquina de estados de UI

#### Requirement: las páginas de lista renderizan empty/loading/error/success (REQ-UI-3)

Cada superficie de lista (`/transactions`, `/accounts`,
`/dashboard`) DEBE declarar los cuatro estados de UI —
`empty`, `loading`, `error`, `success` — y renderizar la rama
correspondiente en cada render. El estado `empty` renderiza una
primitiva `EmptyState` con un slot para ilustración y un CTA
contextualmente apropiado. El estado `loading` renderiza un
placeholder `Skeleton` que matchea la forma del layout
poblado. El estado `error` renderiza un error boundary
user-facing (`app/<segment>/error.tsx`) con el mensaje de error
y un link de retry a la misma ruta. El estado `success`
renderiza el layout poblado. La rama del estado DEBE ser
testeable independientemente de las otras.

(Traces: BR-UI-1, BR-UI-2.)

#### Scenario: la lista vacía renderiza EmptyState con CTA

- GIVEN: un usuario autenticado con cero transacciones
- WHEN: el usuario visita `/transactions`
- THEN: la página renderiza la primitiva `EmptyState`
- AND: la página renderiza un CTA linkeando a `/transactions/new`

#### Scenario: el error boundary renderiza ante un throw del Server Component

- GIVEN: una sesión autenticada
- AND: `GET /api/transactions` retorna un 5xx
- WHEN: el usuario visita `/transactions`
- THEN: la página renderiza el error boundary user-facing
  (`app/transactions/error.tsx`)
- AND: el boundary renderiza el mensaje de error y un link de
  retry a `/transactions`

#### Scenario: success renderiza el layout poblado

- GIVEN: un usuario autenticado con 3 transacciones
- WHEN: el usuario visita `/transactions`
- THEN: la página renderiza el layout poblado de `Table`
- AND: la tabla contiene 3 filas ordenadas por `transactionDate`
  descendente

### Accesibilidad (WCAG 2.2 AA)

#### Requirement: toda primitiva interactiva tiene un indicador de foco visible (REQ-UI-4)

Toda primitiva interactiva DEBE renderizar un indicador de foco
visible cuando se focaliza vía teclado. Las primitivas cubiertas
son `Button`, `Link`, `Input`, `Select`, `Combobox`, `Checkbox`,
`RadioGroup`, acciones de fila de `Table`, controles de
`Pagination` y controles de `Dialog`. El tratamiento visual DEBE
ser al menos `focus-visible:ring-2` (o un token equivalente de
Tailwind v4); el indicador DEBE tener un contrast ratio de al
menos 3:1 contra el background circundante. Un test de
regresión asserta que el focus ring está presente en toda
primitiva cubierta.

(Traces: BR-UI-3, BR-UI-9.)

#### Scenario: Button renderiza focus ring al focalizar con teclado

- GIVEN: una primitiva `Button` renderizada en una página
- WHEN: el usuario presiona `Tab` para focalizar el botón
- THEN: el botón focalizado renderiza el focus ring
- AND: el focus ring es visible contra el background
  circundante

#### Requirement: todo form field tiene un label pareado (REQ-UI-5)

Todo form field DEBE renderizar un `<label htmlFor="<id>">`
pareado (o `aria-label` para botones icon-only). El pairing DEBE
ser enforced por un test sobre cada form. Los botones icon-only
DEBEN llevar un `aria-label` que describa la acción. Un test de
regresión asserta que todo `<input>` / `<select>` /
`<textarea>` de un form tiene un label pareado o `aria-label`.

(Traces: BR-UI-4.)

#### Scenario: el label del form field se parea con el input

- GIVEN: un `CreateTransactionForm` renderizado con fields
  `accountId`, `amountMinor`, `currency`, `direction`,
  `transactionDate`, `memo`, `category`
- WHEN: el form se renderiza
- THEN: todo field tiene un `<label htmlFor="<id>">` pareado
  donde el `id` matchea el atributo `id` del field

#### Scenario: el botón icon-only lleva aria-label

- GIVEN: una primitiva `Pagination` renderizada con un botón
  icon-only `Previous page`
- WHEN: la primitiva se renderiza
- THEN: el elemento `<button>` lleva
  `aria-label="Previous page"`

#### Requirement: los errores de form se renderizan inline con aria-describedby (REQ-UI-6)

Los errores de form DEBEN renderizarse al lado del campo
ofensor con `aria-describedby` linkeando el campo al `id` del
elemento de error. Se renderiza el primer mensaje de error de
la respuesta del API (`error.message` o `error.details[0]`). El
form NO DEBE depender solamente de un alert al tope del form.
Un test de regresión asserta que el atributo `aria-describedby`
está presente en todo field con un error del lado del server.

(Traces: BR-UI-5.)

#### Scenario: el error inline aparece al lado del campo ofensor

- GIVEN: un `CreateTransactionForm` submiteado con
  `amountMinor = 0`
- WHEN: el API retorna `400 INVALID_AMOUNT`
- THEN: el campo de amount renderiza un mensaje de error
- AND: el `id` del mensaje de error está referenciado por el
  `aria-describedby` del campo
- AND: el texto del mensaje de error matchea el mensaje
  `INVALID_AMOUNT` del API

#### Scenario: sin alert al tope del form como única surface

- GIVEN: cualquier form con errores del lado del server
- WHEN: el form renderiza el estado de error
- THEN: todo error tiene un rendering inline al lado de su
  campo
- AND: si existe un summary al tope del form, es una surface
  secundaria, no la primaria

#### Requirement: los botones de submit renderizan un estado de loading (REQ-UI-7)

Los botones de submit DEBEN renderizar un estado de loading
(icono `Spinner` + atributo `disabled` + `aria-busy="true"`)
mientras la Server Action está en vuelo. Los double-clicks
DEBEN debouncarse; un segundo click dentro de la ventana
pending de la acción NO DEBE disparar una segunda submission.
Un test de regresión asserta que el botón transiciona a
`disabled` y renderiza el `Spinner` en el submit, y que un
segundo submit se debouncea.

(Traces: BR-UI-6.)

#### Scenario: el submit transiciona a loading al hacer click

- GIVEN: un `CreateTransactionForm` con un body válido
- WHEN: el usuario hace click en el botón de submit
- THEN: el botón renderiza el icono `Spinner`
- AND: el botón tiene `disabled` en `true`
- AND: el botón tiene `aria-busy="true"`

#### Scenario: el double-click se debouncea

- GIVEN: un `CreateTransactionForm` con el botón de submit en
  estado de loading
- WHEN: el usuario hace click en el botón por segunda vez
- THEN: el segundo click se ignora
- AND: la Server Action se invoca exactamente una vez

#### Requirement: las tablas tienen caption, scope y aria-sort (REQ-UI-8)

Toda primitiva `Table` DEBE renderizar `<caption>` (visible o
`sr-only`), headers `<th scope="col">`, y `aria-sort` en las
columnas sortables reflejando la dirección de sort actual
(`ascending`, `descending`, o `none`). Un test de regresión
asserta que los atributos caption y scope están presentes, y
que las columnas sortables actualizan `aria-sort` cuando la
dirección de sort cambia.

(Traces: BR-UI-7.)

#### Scenario: la tabla renderiza caption y scope

- GIVEN: un `TransactionsListTable` renderizado con columnas
  `Date`, `Direction`, `Account`, `Native amount`,
  `Converted amount`
- WHEN: la tabla se renderiza
- THEN: el elemento `<table>` tiene un `<caption>` (visible o
  `sr-only`)
- AND: todo `<th>` lleva `scope="col"`

#### Scenario: la columna sortable refleja aria-sort

- GIVEN: un `TransactionsListTable` con la columna `Date`
  ordenada descending por default
- WHEN: la tabla se renderiza
- THEN: el `<th>` de `Date` lleva `aria-sort="descending"`
- AND: los demás `<th>`s llevan `aria-sort="none"`

### Tema y tokens

#### Requirement: v1 envía un único tema light (REQ-UI-9)

La UI de producción de v1 DEBE enviar un único tema light. La
tabla de tokens en `app/_ui/tokens.css` PUEDE declarar valores
de tokens de dark mode vía CSS custom properties (así el
cambio follow-up `ui-dark-mode` es non-breaking), pero v1 NO
DEBE renderizar los tokens dark. El dashboard NO DEBE incluir
un toggle de tema. Un check de code-review asserta que no hay
reglas de CSS de dark mode renderizadas en v1 (p. ej. sin
variantes `dark:` de Tailwind en `app/_ui/` ni en los renders
de páginas de producción). Toda primitiva DEBE renderizar con
los valores de tokens light.

(Traces: BR-UI-8, BR-UI-9.)

#### Scenario: sin variantes dark en las páginas de producción

- GIVEN: el codebase de v1
- WHEN: corre `git grep` por `dark:` dentro de `app/_ui/`,
  `app/accounts/`, `app/transactions/`, `app/dashboard/`,
  `app/_components/dashboard-*.tsx`
- THEN: cero variantes `dark:` de Tailwind están presentes

#### Scenario: la tabla de tokens declara ambos temas

- GIVEN: `app/_ui/tokens.css`
- WHEN: el archivo se lee
- THEN: los valores de tokens de light mode son los defaults
  renderizados
- AND: los valores de tokens de dark mode están declarados bajo
  un selector `[data-theme="dark"]` (o scope CSS equivalente)
  para activación futura

### Documentación y QA

#### Requirement: toda primitiva está documentada (REQ-UI-10)

Toda primitiva en `app/_ui/` DEBE tener una sección
correspondiente en `docs/architecture/ui.md` describiendo su
intención, props y contrato de a11y. Primitivas nuevas
agregadas sin docs fallan el verify gate. El artefacto de docs
DEBE incluir una tabla de tokens mapeando cada clase `ui-*` a
su CSS custom property. El verify gate asserta que toda
primitiva exportada tiene una sección de docs.

(Traces: BR-UI-9.)

#### Scenario: la tabla de tokens mapea toda clase ui-\*

- GIVEN: `app/_ui/tokens.css` declara el set de tokens de v1
- WHEN: se lee `docs/architecture/ui.md`
- THEN: la tabla de tokens lista toda clase `ui-*` usada por
  cualquier primitiva
- AND: cada fila mapea la clase a su CSS custom property

#### Scenario: toda primitiva tiene una sección de docs

- GIVEN: las primitivas exportadas en `app/_ui/`
- WHEN: se lee `docs/architecture/ui.md`
- THEN: los docs tienen una sección por primitiva exportada
- AND: cada sección describe intención, props y contrato de
  a11y

#### Requirement: el manual QA checklist es user-owned (REQ-UI-11)

`docs/qa/transactions-ui.md` DEBE existir y contener un manual
QA checklist cubriendo keyboard navigation (orden de Tab, foco
visible, activación con Enter/Space, Escape para cerrar
dialogs) y recorrido con screen reader (VoiceOver en macOS, NVDA
en Windows) en cada página. El checklist DEBE registrar dark
mode como out of scope para v1 (follow-up). El verify gate
DEBE fallar hasta que el usuario firme el checklist (la fecha
del sign-off se registra en el archivo).

(Traces: BR-UI-9.)

#### Scenario: el checklist existe y está firmado

- GIVEN: corre el verify gate
- WHEN: se lee `docs/qa/transactions-ui.md`
- THEN: el archivo contiene una línea `Signed off by:` con un
  nombre de usuario no vacío y una fecha
- AND: el checklist cubre keyboard nav + screen reader + la
  nota de follow-up de dark mode

## Migración

Sin migración de Prisma. `ui` es un consumidor de presentation
layer de las capabilities existentes. El schema queda sin
cambios. Los dos flags aditivos de query
(`include=lastActivity`, `include=accountName`) augmentan las
formas de respuesta de los GET endpoints existentes solo con
campos opcionales; los callers existentes que omiten el flag
ven una respuesta byte-identical.

## Cross-references

- **Propuesta**: `openspec/changes/transactions-ui/proposal.md`
  — el cambio upstream que creó esta capability. BR-UI-1 a
  BR-UI-9 están codificados acá; la propuesta carga la
  rationale, las alternativas consideradas y el forecast.
- **Spec de transactions**: `openspec/specs/transactions/spec.md`
  — REQ-TX-15 es REEMPLAZADO (no extendido) por REQ-UI-1 a
  REQ-UI-11; el delta de reemplazo vive en
  `openspec/changes/transactions-ui/specs/transactions/spec.md`
  y es levantado al canónico por `sdd-archive`.
- **Spec de accounts**: `openspec/specs/accounts/spec.md` —
  BR-ACC-12 (display-only FX), BR-ACC-14 a BR-ACC-19 (slice
  smoke). La UI de producción reemplaza la capa de render; la
  forma de datos (`FinancialAccountWire`) queda congelada.
- **Spec de reports**: `openspec/specs/reports/spec.md` —
  BR-RPT-7 (Server Component auth gate) y los tres DTOs de
  report (`MonthlySummaryDTO`, `CategoryBreakdownDTO`,
  `AccountFlowDTO`) son consumidos sin cambios por el
  dashboard.
- **Spec de auth**: `openspec/specs/auth/spec.md` — la
  invariante del helper server-side `auth()`. Cada página de la
  UI de producción mantiene el patrón de session-resolution +
  redirect.
- **Hono endpoints (inputs estables)**:
  - `app/api/[...path]/route.ts:7-25` — el catch-all protegido
    que consumen el dashboard y las form actions.
  - Los dos flags no cambian el shape de ruta de los endpoints;
    augmentan el shape de respuesta aditivamente.
- **Referencia del design system** (deliverable del slice 6):
  `docs/architecture/ui.md` — tabla de tokens + inventario de
  componentes, codificando REQ-UI-10.
- **Servicios externos**: ninguno. El read path nunca alcanza
  un servicio externo en v1 (las llamadas a FX ocurren en
  write time según la capability `transactions`).

## Historial

- **2026-06-27 (v1 draft)** — primera escritura. Creada por el
  cambio `transactions-ui`. Lockea las cuatro open questions de
  la propuesta: Q1 (flags aditivos de query sin break de
  backward-compat, codificados en REQ-UI-1 y REQ-UI-2); Q2
  (Combobox hand-built sobre `<select>` + `<input>`, sin nueva
  dep, codificado en el §Capability boundary); Q3 (light theme
  only, tokens dark declarados pero sin usar, codificado en
  REQ-UI-9); Q4 (owner del manual QA es el usuario, codificado
  en REQ-UI-11). Scope: primitivas del design system
  (`app/_ui/`) + renders de producción para las tres
  superficies smoke existentes (`/transactions`, `/accounts`,
  `/dashboard`) + Client Components de state de query params
  del dashboard + error boundaries user-facing. Sin migración
  de Prisma. Sin nuevas dependencias top-level. v1 envía web +
  light + copy mixto EN/ES + render de Table/CSS-bar. Dark
  mode, i18n, mobile native, librería de charting, auditoría
  a11y AAA, y capability `snapshots` diferidos a cambios
  follow-up.

## Referencias

- `openspec/changes/transactions-ui/proposal.md` — propuesta
  v1 (2026-06-27) con BR-UI-1 a BR-UI-9.
- `openspec/changes/transactions-ui/proposal.md` §"Open
  questions" — Q1 a Q4 lockeadas en la sesión de pre-spec.
- `openspec/specs/auth/spec.md` — invariante del helper
  `auth()`, userId scoping.
- `openspec/specs/accounts/spec.md` — BR-ACC-12, BR-ACC-14 a
  BR-ACC-19.
- `openspec/specs/transactions/spec.md` — REQ-TX-15
  reemplazado por los REQs de este spec.
- `openspec/specs/reports/spec.md` — BR-RPT-7, tres DTOs de
  report.
- `openspec/specs/fx/spec.md` — BR-ACC-12 / BR-ACC-13
  (display-only FX).
- `app/api/[...path]/route.ts:7-25` — el catch-all protegido
  que consume cada Server Component.
- `openspec/config.yaml` — reglas de TDD estricto; runner
  `pnpm test`.
- `AGENTS.md` (raíz) — §5.3 política de `pnpm-lock.yaml` (sin
  nuevas deps en este cambio); §10.5 (regla de módulos
  aislados); §13 política de mirror de docs en dos idiomas.
- `openspec/AGENTS.md` — invariante de atribución de autor; el
  autor de este spec es `Sebastián Illa`.
