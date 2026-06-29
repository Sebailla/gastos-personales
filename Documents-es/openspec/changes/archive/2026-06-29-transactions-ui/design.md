# Design — `transactions-ui`

**Estado**: draft · **Autor**: Sebastián Illa · **Creado**: 2026-06-27
**Cambio**: `transactions-ui`
**Propuesta**: `openspec/changes/transactions-ui/proposal.md` (v1, 2026-06-27) — mirror ES en `Documents-es/openspec/changes/transactions-ui/proposal.md`
**Spec (delta, ui)**: `openspec/changes/transactions-ui/specs/ui/spec.md` — 11 Requirements (REQ-UI-1 a REQ-UI-11)
**Spec (delta, transactions)**: `openspec/changes/transactions-ui/specs/transactions/spec.md` — REQ-TX-15 REPLACED
**Capabilities afectadas**: `ui` (nueva; spec canónica en `openspec/specs/ui/spec.md` al ejecutar `sdd-archive`), `transactions` (un delta — REQ-TX-15 reemplazado por referencia a `ui/spec.md`), `accounts` (sin cambio de comportamiento; dos query flags aditivos en los GET endpoints existentes — ver BR-UI-1, BR-UI-2), `reports` (sin cambio de comportamiento; los query params `?accountId=` y `?month=` del dashboard son UI state puro según REQ-UI-3), `errors` (sin códigos nuevos; la superficie UI reusa el `ErrorEnvelope` existente en `src/shared/errors/app-error.ts`), `auth` (sin cambios; cada página mantiene el `auth()` Server Component gate)
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4
**Preflight**: interactive · `both` (Engram + OpenSpec files) · `auto-forecast` · review budget 400
**Strict TDD**: habilitado según `openspec/config.yaml:27-30`; runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Este documento NO re-debate la propuesta ni la spec.
> Implementa el "qué" de la spec con el "cómo" — la tabla
> de tokens del design-system, el API de los primitives, el
> layout shell, los renders por slice, los dos query flags
> aditivos, los cambios en el composition-root (cero — la
> UI no cambia la composición de Hono), la estrategia de
> surface de errores del envelope, los TDD markers por
> slice, y las tres correcciones del orquestador que la
> propuesta / spec phase no codificaron explícitamente:
> (1) la tabla de tokens de v1 incluye dark-mode CSS custom
> properties bajo `[data-theme="dark"]` pero la UI de
> producción nunca las renderiza (BR-UI-8, REQ-UI-9 —
> verbatim de la spec);
> (2) los dos query flags aditivos aterrizan en los GET
> endpoints existentes bajo `src/modules/api/` sin cambiar
> las rutas, el auth gate, ni el envelope de error
> (REQ-UI-1, REQ-UI-2);
> (3) cada Client Component se opt-in mediante una directiva
> explícita `'use client'` al tope del archivo — los Server
> Components son el default, los Client Components son la
> excepción (BR-UI-6: el loading state del submit button es
> el único Client Component del write path).

---

## 1. Resumen

`transactions-ui` es la **superficie de presentación de
producción** de `gastos-personales`. Es el primer cambio que
envía un design-system (tabla de tokens + primitives + layout
shell) por encima de los seams de lectura y escritura
existentes (`auth`, `accounts`, `transactions`, `reports`).
El cambio se envía como **seis PRs encadenados** bajo el
`auto-forecast` pre-cached del orquestador, cada uno un PR
auto-contenido que apunta a `develop` y gatea con la merge
del slice previo.

El cambio introduce la **`ui` capability** en `app/_ui/`
(primitives + layout shell) y reemplaza el render smoke-minimal
de tres route segments existentes (`/accounts`,
`/transactions`, `/dashboard`) con renders de calidad de
producción que consumen las rutas Hono existentes sin
cambios. Las únicas adiciones a la superficie de API son dos
query flags aditivos `include=` en los GET endpoints
existentes (`/api/accounts?include=lastActivity`,
`/api/transactions?include=accountName`); los endpoints sin
el flag DEBEN ser byte-identical al contrato existente
(REQ-UI-1, REQ-UI-2).

Cinco decisiones de diseño atan la implementación:

- **Primitives hand-built sobre Tailwind v4 + React 19.** Sin
  nuevas top-level dependencies (no shadcn, no NextUI, no
  MUI, no Chakra, no Radix en v1). Los primitives consumen
  la tabla de clases Tailwind v4 existente; la tabla de
  tokens en `app/_ui/tokens.css` la extiende vía CSS custom
  properties.
- **Server Component por default; Client Component solo cuando
  es interactivo.** El render layer es server-first. Los
  únicos Client Components son los dos componentes de estado
  de query-params del dashboard (`dashboard-account-picker.tsx`,
  `dashboard-month-switcher.tsx`) y el loading state del
  submit-button en los componentes de form (este último es
  interactivo Client Component por el contrato de BR-UI-6).
- **Composición vía children + compound components, NO
  proliferación de boolean props.** `Card` usa children
  `CardHeader`, `CardBody`, `CardFooter`. `Table` usa children
  `TableHeader`, `TableBody`, `TableRow`, `TableCell`. Sin
  props `variant` / `size` / `as` en los primitives
  (precedente de Vercel composition patterns; la regla se
  documenta como parte de la referencia de BR-UI-9).
- **Dos query flags aditivos, cero breaking change.** Los
  query parameters `include=lastActivity` y `include=accountName`
  son OPCIONALES. Los endpoints sin el flag DEBEN ser
  byte-identical al contrato actual. La forma de datos gana
  campos opcionales solamente. Sin nuevas rutas Hono, sin
  nuevos modelos Prisma, sin migrations.
- **Floor de accesibilidad WCAG 2.2 AA.** Las violaciones
  axe-core `critical` + `serious` son cero (REQ-UI-4 a
  REQ-UI-8). Cada primitive interactivo renderiza
  `focus-visible:ring-2` (o token Tailwind v4 equivalente),
  cada form field tiene un `<label htmlFor="<id>">` apareado,
  cada error de form renderiza inline con `aria-describedby`,
  cada `Table` renderiza `<caption>` y `<th scope="col">`,
  cada submit button renderiza `aria-busy="true"` + `disabled`
  - `Spinner` mientras el Server Action está en flight
    (BR-UI-3 a BR-UI-7).

---

## 2. Estructura del módulo — `app/_ui/` (nuevo)

La nueva carpeta `app/_ui/` es la **fuente única de verdad
del UI**. NO es un módulo TypeScript bajo `src/` — es una
carpeta de Next.js App Router que aloja primitives del
design-system (Server Components por default, Client
Components solo cuando son interactivos), los primitives del
layout shell, y la tabla de tokens en `app/_ui/tokens.css`.
Los consumption sites (`app/accounts/`, `app/transactions/`,
`app/dashboard/`) importan de los primitives; NO extienden la
tabla de tokens ni duplican primitives.

### 2.1 File tree

```
app/_ui/
├── index.ts                                 # barrel público: tokens (import CSS) + re-exports de primitives
├── tokens.css                               # declaraciones CSS-first de tokens Tailwind v4 (light + dark scope)
├── primitives/
│   ├── button.tsx                           # Server Component por default; acepta className override
│   ├── button.test.tsx                      # render: primary, secondary, ghost, disabled, loading (aria-busy)
│   ├── input.tsx                            # text input; se aparea con FormField; forwardRef
│   ├── input.test.tsx
│   ├── textarea.tsx                         # input multilínea; se aparea con FormField
│   ├── textarea.test.tsx
│   ├── select.tsx                           # <select> nativo; se aparea con FormField
│   ├── select.test.tsx
│   ├── checkbox.tsx                         # <input type=checkbox> nativo; se aparea con FormField
│   ├── checkbox.test.tsx
│   ├── radio-group.tsx                      # compuesto de RadioGroup + RadioGroupItem
│   ├── radio-group.test.tsx
│   ├── combobox.tsx                         # 'use client' — combobox buscable sobre <select> + <input>
│   ├── combobox.test.tsx
│   ├── field-error.tsx                      # bloque de mensaje de error; se aparea con FormField vía aria-describedby
│   ├── field-error.test.tsx
│   ├── form-field.tsx                       # compone Label + control + FieldError; enforce <label htmlFor>
│   ├── form-field.test.tsx
│   ├── card.tsx                             # compuesto de CardHeader, CardBody, CardFooter (compound)
│   ├── card.test.tsx                        # snapshot: empty, populated
│   ├── card-header.tsx
│   ├── card-body.tsx
│   ├── card-footer.tsx
│   ├── table.tsx                            # compuesto de TableHeader, TableBody, TableRow, TableCell
│   ├── table.test.tsx                       # snapshot: empty, populated; a11y: caption + scope + aria-sort
│   ├── table-header.tsx
│   ├── table-body.tsx
│   ├── table-row.tsx
│   ├── table-cell.tsx
│   ├── badge.tsx                            # badges de dirección (INCOME verde, EXPENSE rojo); badges de status
│   ├── badge.test.tsx                       # snapshot: cada variant
│   ├── empty-state.tsx                      # slot de ilustración + título + descripción + CTA
│   ├── empty-state.test.tsx                 # snapshot: con CTA, sin CTA
│   ├── spinner.tsx                          # SVG inline; accessible role="status" + aria-label
│   ├── spinner.test.tsx                     # snapshot + aserción a11y
│   ├── skeleton.tsx                         # placeholder animado
│   ├── skeleton.test.tsx                    # snapshot
│   ├── pagination.tsx                       # <Link>s server-rendered; aria-label en controles
│   ├── pagination.test.tsx                  # render: first/middle/last page; aria-labels
│   ├── dialog.tsx                           # 'use client' — confirm dialog (delete transaction)
│   ├── dialog.test.tsx                      # render: open + close; Escape para cerrar
│   ├── breadcrumb.tsx                       # server-rendered <nav><ol> con aria-label="Breadcrumb"
│   ├── breadcrumb.test.tsx                  # snapshot
│   └── link.tsx                             # wrapper de Next.js Link; focus-visible ring
│       └── link.test.tsx
├── layout/
│   ├── page-header.tsx                      # title + description + actions slot
│   ├── page-container.tsx                   # max-width wrapper + responsive padding
│   ├── sidebar.tsx                          # rail izquierdo opcional (no usado en v1 — exportado para follow-up)
│   ├── topbar.tsx                           # top bar opcional
│   └── breadcrumb-bar.tsx                   # compone el primitive Breadcrumb
└── README.md                                # interno: overview developer-facing de la tabla de tokens

app/
├── error.tsx                                # NUEVO — boundary de error user-facing para el segmento root
├── not-found.tsx                            # NUEVO — boundary 404 user-facing para el segmento root
├── accounts/
│   ├── error.tsx                            # NUEVO — boundary de error a nivel de segmento
│   ├── page.tsx                             # MODIFICADO — render de producción con primitives del design-system
│   ├── accounts-list-table.tsx              # MODIFICADO — tabla de producción (sort, archived toggle, col last-activity)
│   ├── accounts-list-table.test.tsx         # MODIFICADO — snapshots extendidos + tests a11y
│   ├── [id]/
│   │   ├── page.tsx                         # MODIFICADO — render de producción
│   │   ├── account-detail.tsx               # MODIFICADO — layout Card de producción
│   │   └── account-detail.test.tsx          # MODIFICADO — snapshots extendidos
│   └── new/
│       ├── page.tsx                         # MODIFICADO — render de producción
│       ├── create-account-form.tsx          # MODIFICADO — form de producción con FormField + FieldError + Spinner
│       └── create-account-form.test.tsx     # MODIFICADO — snapshots extendidos + tests a11y
├── transactions/
│   ├── error.tsx                            # NUEVO
│   ├── page.tsx                             # MODIFICADO
│   ├── [id]/
│   │   ├── page.tsx                         # MODIFICADO
│   │   └── transaction-detail-forms.tsx     # MODIFICADO — forms edit + delete de producción (Card + Dialog)
│   ├── [id]/transaction-detail-forms.test.tsx  # NUEVO — extendido
│   └── new/
│       ├── page.tsx                         # MODIFICADO
│       ├── create-transaction-form.tsx      # MODIFICADO — form de producción con Combobox para account selection
│       └── create-transaction-form.test.tsx # MODIFICADO — snapshots extendidos + tests a11y
├── dashboard/
│   ├── error.tsx                            # NUEVO
│   ├── page.tsx                             # MODIFICADO — render de producción con ?accountId + ?month searchParams
│   ├── page.test.tsx                        # MODIFICADO — snapshots extendidos (empty, populated, accountId, month)
│   └── page.seeded.test.tsx                 # MODIFICADO — extendido
├── _components/                             # Client Components específicos del dashboard
│   ├── dashboard-account-picker.tsx         # NUEVO — 'use client' — account picker basado en Link
│   ├── dashboard-account-picker.test.tsx    # NUEVO — render + accesibilidad
│   ├── dashboard-month-switcher.tsx         # NUEVO — 'use client' — month switcher basado en Link (prev/curr/next)
│   ├── dashboard-month-switcher.test.tsx    # NUEVO — render + edge cases (rollover Dec→Ene)
│   ├── dashboard-monthly-summary.tsx        # MODIFICADO — render de producción (Card + Table + Badge)
│   ├── dashboard-monthly-summary.test.tsx   # MODIFICADO — extendido
│   ├── dashboard-category-breakdown.tsx     # MODIFICADO
│   ├── dashboard-category-breakdown.test.tsx # MODIFICADO
│   ├── dashboard-account-flow.tsx           # MODIFICADO
│   ├── dashboard-account-flow.test.tsx      # MODIFICADO
│   ├── transactions-list-table.tsx          # MODIFICADO — tabla de producción (sort, pagination, filters)
│   ├── transactions-list-table.test.tsx     # NUEVO — tests de sort + pagination + filter
│   └── ephemeral-toast.tsx                  # SIN CAMBIOS — toast cliente (ya enviado)
├── _actions/
│   └── transactions-server-actions.ts       # SIN CAMBIOS — server actions (ya enviadas)
├── _lib/
│   ├── format-minor.ts                      # SIN CAMBIOS — formateador de currency en minor-units
│   ├── account-types.ts                     # SIN CAMBIOS — shape FinancialAccountWire
│   ├── transaction-types.ts                 # SIN CAMBIOS — shape TransactionDTO
│   ├── report-types.ts                      # SIN CAMBIOS — MonthlySummaryDTO, CategoryBreakdownDTO, AccountFlowDTO
│   └── report-types.test.ts                 # SIN CAMBIOS
├── layout.tsx                               # SIN CAMBIOS — root layout (sin wrapper nuevo)
├── globals.css                              # MODIFICADO — importa app/_ui/tokens.css
└── page.tsx                                 # SIN CAMBIOS — landing page

docs/
├── architecture/
│   └── ui.md                                # NUEVO — referencia del design-system (tabla de tokens + inventario de componentes)
├── qa/
│   └── transactions-ui.md                   # NUEVO — checklist manual de QA (keyboard, screen reader, follow-ups)
└── perf/
    └── transactions-ui.md                   # NUEVO — output de Lighthouse + verificación del budget de perf

Documents-es/
├── architecture/
│   └── ui.md                                # mirror ES de docs/architecture/ui.md
├── qa/
│   └── transactions-ui.md                   # mirror ES de docs/qa/transactions-ui.md
└── perf/
    └── transactions-ui.md                   # mirror ES de docs/perf/transactions-ui.md
```

El árbol propuesto difiere de la spec en dos formas
intencionales (el cache del orquestador bakeó estas):

1. La spec propone `app/_ui/primitives/` y
   `app/_ui/layout/` como las dos sub-carpetas. La propuesta
   confirma la misma estructura. El árbol de arriba preserva
   ambas sub-carpetas para que la referencia del
   design-system (§10 abajo) tenga un hogar estable tanto
   para los primitives presentacionales como para los
   primitives estructurales del layout.

2. La spec propone un primitive `Dialog` en la lista. El
   design hace `Dialog` un Client Component explícito
   (`'use client'`) porque tiene estado local (`isOpen`).
   El elemento `<dialog>` HTML5 nativo y server-rendered
   soporta el atributo `open`; el primitive envuelve el
   elemento HTML nativo y agrega el patrón `aria-labelledby` +
   `aria-describedby`. El `Dialog` lo consume solo el flujo
   de confirm de delete-transaction en v1 (el loading state
   de REQ-UI-7 vive en el submit button del form; el `Dialog`
   mismo es un thin wrapper de accesibilidad alrededor del
   elemento nativo).

### 2.2 Dirección de dependencias cross-module

```
            app/_ui/ (nuevo)
            ├─ tokens.css (declaraciones CSS-first de Tailwind v4; @import en app/globals.css)
            ├─ primitives/ (Server Component por default; 'use client' solo en Combobox + Dialog)
            │   ├─ Button, Input, Textarea, Select, Checkbox, RadioGroup
            │   │   Server Component; sin estado; sin hooks; sin eventos
            │   ├─ Combobox, Dialog
            │   │   Client Component ('use client'); estado local + a11y
            │   ├─ FieldError, FormField, Card, Table, Badge, EmptyState,
            │   │   Spinner, Skeleton, Pagination, Breadcrumb, Link
            │   │   Server Component; sin estado; props puros
            │   └─ _shared/cx.ts (merge de className estilo clsx; SIN dep nueva)
            ├─ layout/ (PageHeader, PageContainer, BreadcrumbBar)
            │   Server Component; props puros
            └─ README.md (interno)

            app/accounts/ (consume app/_ui/)
            ├─ page.tsx, [id]/page.tsx, new/page.tsx
            │   Server Component; usa Card, Table, Badge, EmptyState
            ├─ accounts-list-table.tsx, account-detail.tsx, create-account-form.tsx
            │   Server Component (o Client Component para el estado del submit button del form)
            └─ error.tsx (boundary a nivel de segmento)

            app/transactions/ (consume app/_ui/)
            ├─ page.tsx, [id]/page.tsx, new/page.tsx
            │   Server Component; usa Card, Table, Badge, Pagination, EmptyState
            ├─ transactions-list-table.tsx, transaction-detail-forms.tsx,
            │   create-transaction-form.tsx
            │   Combobox para account selection (Client Component)
            │   Dialog para delete confirm (Client Component)
            └─ error.tsx

            app/dashboard/ (consume app/_ui/)
            ├─ page.tsx (Server Component; lee ?accountId y ?month searchParams)
            ├─ dashboard-account-picker.tsx, dashboard-month-switcher.tsx
            │   Client Component ('use client'); navegación basada en Link
            └─ error.tsx

            app/_components/ (Client Components específicos del dashboard)
            └─ dashboard-{monthly-summary,category-breakdown,account-flow}.tsx
                Server Component; props puros

src/modules/api/ (solo cambios aditivos)
├─ accounts/ GET /api/accounts (aditivo ?include=lastActivity)
│   Handler agrega campo opcional lastActivityAt por row cuando el flag está presente
└─ transactions/ GET /api/transactions (aditivo ?include=accountName)
    Handler agrega campo opcional accountName por row cuando el flag está presente

src/shared/errors/ (SIN cambios)
└─ app-error.ts (reusado; ErrorEnvelope es la shape de wire)
```

Las flechas de dependencia apuntan **solo** desde `app/_ui/`
hacia afuera hacia las páginas consumidoras. Las páginas
consumen los primitives; los primitives NO dependen de las
páginas. Los dos query flags aditivos aterrizan en
`src/modules/api/` bajo los handlers existentes; los
handlers NO cambian para los callers que omiten el flag.

La dependencia sobre `src/shared/errors/app-error.ts` es
**read-only** en el boundary de la UI: los componentes de
form consumen los campos `error.code` y `error.details[]`
del envelope; NO importan las definiciones de clases de error
ni el enum de códigos de error desde el lado UI. El mapeo es
una función pura en el componente de form
(`mapApiErrorToFieldError`).

### 2.3 Barrel público — `app/_ui/index.ts`

El barrel re-exporta los primitives y el layout shell. Los
consumers importan basado en path
(`import { Button } from '../_ui/primitives/button'`);
`app/_ui/index.ts` existe para propósitos de documentación
(declarar la superficie pública en un solo lugar) pero no
se importa en el path de runtime.

El barrel NO exporta:

- `tokens.css` directamente — el archivo CSS se `@import`a en
  `app/globals.css` (convención de CSS global de Next.js
  App Router).
- Archivos de test (`*.test.tsx`) — los tests van
  co-localizados con el source según la convención existente
  del proyecto.
- Helpers internos (`_shared/cx.ts`) — son privados a
  `app/_ui/`.

---

## 3. Modelo de dominio

La capability `ui` NO posee entidades de dominio. Posee
**contratos de props** para los primitives del design-system
y los **tipos TypeScript** para los DTOs wire-aligned que
fluyen por los Server Components. Los tipos de DTO
(`TransactionDTO`, `FinancialAccountWire`,
`MonthlySummaryDTO`, `CategoryBreakdownDTO`,
`AccountFlowDTO`) se importan de los archivos existentes
`app/_lib/` y NO se redefinen acá.

### 3.1 Tabla de tokens

La tabla de tokens es la **fuente única de styling**. Cada
primitive consume tokens; las páginas consumen primitives;
nada hard-codifica un color, spacing o font-size fuera de
la tabla de tokens.

```css
/* app/_ui/tokens.css — light theme (v1) */

@layer base {
  :root {
    /* Escala de spacing — ui-space-{1..8} mapea a 4..32px */
    --ui-space-1: 0.25rem;
    --ui-space-2: 0.5rem;
    --ui-space-3: 0.75rem;
    --ui-space-4: 1rem;
    --ui-space-5: 1.25rem;
    --ui-space-6: 1.5rem;
    --ui-space-7: 2rem;
    --ui-space-8: 2.5rem;

    /* Roles de color — light theme */
    --ui-bg: #ffffff;
    --ui-bg-muted: #f9fafb;
    --ui-bg-subtle: #f3f4f6;
    --ui-fg: #111827;
    --ui-fg-muted: #6b7280;
    --ui-border: #e5e7eb;
    --ui-accent: #2563eb;
    --ui-accent-fg: #ffffff;
    --ui-danger: #dc2626;
    --ui-danger-fg: #ffffff;
    --ui-success: #16a34a;
    --ui-success-fg: #ffffff;
    --ui-warning: #d97706;
    --ui-warning-fg: #ffffff;

    /* Escala de radius */
    --ui-rounded-sm: 0.25rem;
    --ui-rounded-md: 0.5rem;
    --ui-rounded-lg: 0.75rem;
    --ui-rounded-full: 9999px;

    /* Elevación */
    --ui-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --ui-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --ui-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);

    /* Escala de tipografía */
    --ui-text-xs: 0.75rem;
    --ui-text-sm: 0.875rem;
    --ui-text-base: 1rem;
    --ui-text-lg: 1.125rem;
    --ui-text-xl: 1.25rem;
    --ui-text-2xl: 1.5rem;
    --ui-text-3xl: 1.875rem;
    --ui-font-normal: 400;
    --ui-font-medium: 500;
    --ui-font-semibold: 600;
    --ui-font-bold: 700;
  }

  /* Tokens dark-mode — declarados pero no usados en v1 (BR-UI-8, REQ-UI-9) */
  [data-theme='dark'] {
    --ui-bg: #0a0a0a;
    --ui-bg-muted: #171717;
    --ui-bg-subtle: #262626;
    --ui-fg: #fafafa;
    --ui-fg-muted: #a3a3a3;
    --ui-border: #404040;
    --ui-accent: #3b82f6;
    --ui-accent-fg: #ffffff;
    --ui-danger: #ef4444;
    --ui-danger-fg: #ffffff;
    --ui-success: #22c55e;
    --ui-success-fg: #ffffff;
    --ui-warning: #f59e0b;
    --ui-warning-fg: #ffffff;
  }
}
```

La tabla de tokens se importa una sola vez en
`app/globals.css` vía `@import './_ui/tokens.css';`. Tailwind
v4 lee las CSS custom properties y las expone como utility
classes vía `@theme inline { --color-ui-bg: var(--ui-bg); ... }`
(config CSS-first de v4). Cada primitive consume las
utility classes (`bg-ui-bg`, `text-ui-fg`, `rounded-ui-md`,
etc.); ningún primitive hard-codifica un valor hex.

### 3.2 Contratos de props de los primitives

Los primitives son componentes de función puros. Los
contratos de props son el **contrato estable cross-slice** —
slice 1 (`ui-primitives`) los envía; slices 2-5 los consumen
sin modificación.

#### 3.2.1 `Button`

```typescript
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Variante visual. Default 'primary'. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Estado de carga — renderiza Spinner + disabled + aria-busy. */
  isLoading?: boolean;
  /** Icono opcional (nombre de Lucide React o ReactNode). v1: omitido. */
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}
```

Contrato a11y: renderiza `<button>` con
`focus-visible:ring-2 focus-visible:ring-ui-accent`. Cuando
`isLoading=true`, renderiza `<Spinner aria-label="Loading" />`

- `disabled` + `aria-busy="true"`.

#### 3.2.2 `Input`

```typescript
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field id — apareado con <label htmlFor> desde FormField. */
  id: string;
}
```

Contrato a11y: el `id` es requerido (enforced por
TypeScript). `FormField` inyecta el atributo `aria-describedby`
que linkea el input con el elemento `FieldError`.

#### 3.2.3 `FormField`

```typescript
export interface FormFieldProps {
  /** Field id — pasado a <label htmlFor> y al id del input. */
  id: string;
  /** Texto del label (español para dashboard, inglés para component-level según BR-UI-4). */
  label: string;
  /** Si el field es requerido (renderiza marcador visual; no sustituye HTML required). */
  required?: boolean;
  /** Texto de ayuda opcional debajo del field. */
  description?: string;
  /** Mensaje de error opcional — renderizado vía FieldError; setea aria-describedby. */
  error?: string;
  /** El control de form (Input, Select, Textarea, Combobox, etc.). */
  children: React.ReactNode;
}
```

Contrato a11y: renderiza `<label htmlFor={id}>{label}{required && ' *'}</label>`
y un wrapper `<div>` que contiene los children + la
description opcional + el `FieldError` si `error` está
presente. El elemento children recibe
`aria-describedby={errorId}` cuando `error` está presente.
`aria-invalid="true"` se setea en los children cuando
`error` está presente.

#### 3.2.4 `Card` + `CardHeader` + `CardBody` + `CardFooter`

```typescript
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Label accesible opcional para la región del card. */
  'aria-label'?: string;
  /** aria-labelledby opcional apuntando al id de un heading. */
  'aria-labelledby'?: string;
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Texto del título — renderizado como <h2> por default. */
  title: string;
  /** Slot opcional para badge (ej. badge de archivado). */
  badge?: React.ReactNode;
  /** Slot opcional para acciones (ej. botón Edit). */
  actions?: React.ReactNode;
}

export interface CardBodyProps extends React.HTMLAttributes<HTMLElement> {}

export interface CardFooterProps extends React.HTMLAttributes<HTMLElement> {}
```

Patrón de composición (Vercel composition patterns):

```tsx
<Card>
  <CardHeader title="Account detail" badge={<Badge>Active</Badge>} />
  <CardBody>{/* key-value rows, tables, forms */}</CardBody>
  <CardFooter>
    <Button variant="ghost">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>
```

#### 3.2.5 `Table` + `TableHeader` + `TableBody` + `TableRow` + `TableCell`

```typescript
export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Texto del caption — requerido para a11y (visible o sr-only). */
  caption: string;
  /** Si el caption está visualmente oculto. Default false. */
  hideCaption?: boolean;
}

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /** Definiciones de columnas — drives <th scope="col"> y aria-sort. */
  columns: ReadonlyArray<{
    key: string;
    label: string;
    /** Si la columna es sortable. */
    sortable?: boolean;
    /** Dirección de sort actual. */
    sortDirection?: 'ascending' | 'descending' | 'none';
    /** Handler de sort — recibe la key de la columna. */
    onSort?: (key: string) => void;
  }>;
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {}
```

Contrato a11y: el `caption` es requerido (enforced por
TypeScript). `<th scope="col">` se renderiza automáticamente.
Cuando `sortable=true` y `onSort` está provisto, el `<th>`
renderiza `aria-sort` reflejando el `sortDirection` actual y
renderiza un `<button>` adentro del `<th>` para activación
por teclado (Enter activa el sort).

#### 3.2.6 `Badge`

```typescript
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Variante — rol semántico de color. */
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  /** Texto del badge. */
  children: React.ReactNode;
}
```

Badges de dirección (REQ-UI-3 / precedente smoke): `INCOME`
renderiza `variant="success"` (verde); `EXPENSE` renderiza
`variant="danger"` (rojo). Badges de archivado:
`variant="neutral"`. La copia en español usa `Ingreso` y
`Gasto` según la convención existente.

#### 3.2.7 `EmptyState`

```typescript
export interface EmptyStateProps {
  /** Texto del título — corto, escaneable. */
  title: string;
  /** Texto de la descripción — explica por qué la superficie está vacía. */
  description?: string;
  /** Ilustración opcional (SVG o ReactNode). */
  illustration?: React.ReactNode;
  /** CTA opcional — Link o Button. */
  cta?: React.ReactNode;
}
```

Contrato a11y: renderiza `<div role="status">` para que los
screen readers anuncien el empty state en la navegación. El
CTA es el primer elemento focuseable cuando está presente.

#### 3.2.8 `Combobox` (Client Component)

```typescript
export interface ComboboxProps {
  /** Field id — apareado con <label htmlFor> desde FormField. */
  id: string;
  /** Valor actual (controlled). */
  value: string | null;
  /** Handler de cambio — recibe el valor seleccionado. */
  onChange: (value: string | null) => void;
  /** Lista de options — derivada de la lista live de accounts. */
  options: ReadonlyArray<{
    value: string;
    label: string;
    /** Estado disabled opcional para accounts archivados. */
    disabled?: boolean;
  }>;
  /** Placeholder del input de búsqueda. */
  placeholder?: string;
  /** Si el field es requerido. */
  required?: boolean;
  /** Si el field está disabled. */
  disabled?: boolean;
  /** Label accesible (overrides el label de FormField). */
  'aria-label'?: string;
}
```

Contrato a11y: el `<select>` subyacente es el primitive
semántico para screen readers (el rol combobox nativo). El
`<input type="search">` es el campo de búsqueda visual.
Teclado: `ArrowDown` / `ArrowUp` para navegar options,
`Enter` para seleccionar, `Escape` para cerrar.

#### 3.2.9 `Dialog` (Client Component)

```typescript
export interface DialogProps {
  /** Si el dialog está abierto. */
  open: boolean;
  /** Handler de cierre — dispara en Escape, en backdrop click, en Cancel. */
  onClose: () => void;
  /** Título — renderizado en <h2> con id; aria-labelledby apunta a este id. */
  title: string;
  /** Descripción — renderizada con id; aria-describedby apunta a este id. */
  description?: string;
  /** Botones de acción (Cancel + Confirm). */
  children: React.ReactNode;
}
```

Contrato a11y: el foco está atrapado dentro del dialog
cuando está abierto. `Escape` dispara `onClose`. El dialog
tiene `role="dialog"` y `aria-modal="true"`. El primer
elemento focuseable recibe el foco al abrir.

#### 3.2.10 `Pagination`

```typescript
export interface PaginationProps {
  /** Página actual (1-indexed). */
  currentPage: number;
  /** Total de páginas. */
  totalPages: number;
  /** URL base — la pagination appendea ?page=N a esta URL. */
  baseUrl: string;
}
```

Contrato a11y: renderiza `<nav aria-label="Pagination">` con
controles `<Link>`. Cada `<Link>` carga `aria-label="Page N"`
o `aria-label="Previous page"` / `aria-label="Next page"`.

### 3.3 Tipos DTO wire-aligned

Los tipos DTO no cambian respecto a los archivos existentes
`app/_lib/`. El design NO introduce tipos DTO nuevos; la UI
de producción consume las shapes de wire de `app/_lib/` y
los dos query flags aditivos agregan dos campos opcionales
(`lastActivityAt` por account, `accountName` por
transaction) a las shapes de response existentes.

```typescript
// app/_lib/account-types.ts — extendido para BR-UI-1
export interface FinancialAccountWire {
  id: string;
  name: string;
  currency: AccountCurrency;
  casa: AccountFxCasa;
  archivedAt: string | null;
  /**
   * BR-UI-1 — presente SOLO cuando ?include=lastActivity está seteado.
   * String ISO-8601 de la transactionDate de la transacción más reciente,
   * o null cuando el account no tiene transacciones.
   */
  lastActivityAt?: string | null;
}

// app/_lib/transaction-types.ts — extendido para BR-UI-2
export interface TransactionDTO {
  id: string;
  userId: string;
  accountId: string;
  direction: TransactionDirection;
  amountMinor: number;
  currency: AccountCurrency;
  memo: string | null;
  category: string | null;
  transactionDate: string;
  convertedAmountMinor: number;
  convertedCurrency: AccountCurrency;
  fxAsOfSnapshot: string | null;
  casaSnapshot: AccountFxCasa | null;
  createdAt: string;
  updatedAt: string;
  /**
   * BR-UI-2 — presente SOLO cuando ?include=accountName está seteado.
   * Nombre del parent FinancialAccount.
   */
  accountName?: string;
}
```

Los campos opcionales se declaran con `?:` (no `| undefined`)
para que la serialización JSON sea byte-identical cuando el
flag está ausente: el campo se omite del response
completamente, no presente-con-undefined. El tipo TypeScript
asegura la opcionalidad en el call-site; la serialización en
runtime omite la key cuando es undefined (según la spec de
JSON.stringify).

### 3.4 Resumen de invariantes (cross-cutting)

- **Sin valores hard-coded en primitives.** Cada color,
  spacing, radius, elevation y font-size viene de la tabla
  de tokens. Una code review que detecte un valor hex en un
  primitive falla el verify gate (BR-UI-9 + REQ-UI-10).
- **Sin variantes `dark:` Tailwind en páginas de
  producción.** El theme de v1 es solo light (REQ-UI-9). Los
  tokens dark se declaran bajo `[data-theme='dark']` pero
  ningún consumer setea ese atributo. Un `git grep -E
'\bdark:' app/_ui/ app/accounts/ app/transactions/
app/dashboard/'` devuelve cero matches en v1.
- **Server Component por default.** La directiva `'use
client'` se permite SOLO en `Combobox`, `Dialog`, el
  estado del submit-button en los componentes de form, y
  los dos Client Components de estado de query-param del
  dashboard. Todo otro archivo en `app/_ui/` y
  `app/{accounts,transactions,dashboard}/` es un Server
  Component.
- **Composición vía children.** `Card`, `Table`, `FormField`
  usan patrones de compound component. SIN props
  `variant="primary|secondary|ghost"` en `Card`; el variant
  vive en el `Button` o `Badge` interior. SIN prop `as` en
  `Table`; el variant vive en el `TableCell` interior.
- **`aria-describedby` en cada form field con error.** Un
  test asegura que el atributo `aria-describedby` está
  presente en cada field con error del lado servidor
  (REQ-UI-6).
- **`aria-busy="true"` en cada submit button en estado de
  carga.** Un test asegura que el atributo se setea en el
  click y se limpia en la respuesta (REQ-UI-7).

---

## 4. Áreas / capabilities afectadas

El cambio toca tres route segments, una carpeta compartida
(`app/_ui/`), y un seam opcional en los handlers Hono
existentes. El modelo de capabilities trata cada área
afectada como una **capability nueva** (`ui`), una
**capability modificada** (`transactions` — REQ-TX-15
REPLACED; `accounts` — solo query flag aditivo; sin cambio
de spec), o **sin cambios** (`auth`, `fx`, `reports`,
`errors`).

### 4.1 Capability nueva — `ui`

La capability `ui` es la capa del design-system. Su
superficie abarca:

- `app/_ui/` (primitives + layout shell + tokens.css)
- `app/accounts/{page.tsx, [id]/page.tsx, new/page.tsx}`
- `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}`
- `app/dashboard/page.tsx`
- `app/_components/dashboard-account-picker.tsx`,
  `app/_components/dashboard-month-switcher.tsx`
- `app/{error.tsx, accounts/error.tsx,
transactions/error.tsx, dashboard/error.tsx}` — boundaries
  de error user-facing por route segment
- `docs/architecture/ui.md` — referencia del design-system
  (REQ-UI-10)
- `docs/qa/transactions-ui.md` — checklist manual de QA
  (REQ-UI-11)
- `docs/perf/transactions-ui.md` — verificación de Lighthouse
  - budget de perf

La spec canónica vive en `openspec/specs/ui/spec.md`
después de ejecutar `sdd-archive`. La spec delta en
`openspec/changes/transactions-ui/specs/ui/spec.md` es la
fuente para la canónica.

### 4.2 Capability modificada — `transactions` (REQ-TX-15 REPLACED)

El modelo de datos, los BRs y los endpoints Hono de la
capability `transactions` quedan sin cambios. El único
delta es a nivel de spec: **REQ-TX-15 es REPLACED** (no
extendida) por un puntero delgado a
`openspec/specs/ui/spec.md` REQ-UI-1 a REQ-UI-11. El
reemplazo desacopla la superficie user-facing de esta
spec para que la evolución futura del UI (lands como
adiciones a la capability `ui`, no como revisiones
adicionales de REQ-TX-N acá).

Los endpoints Hono bajo `/api/transactions/*` quedan sin
cambios. Los dos query flags aditivos
(`include=lastActivity`, `include=accountName`) son
propiedad de la capability `ui` — ver §4.3 abajo.

### 4.3 Capability modificada — `accounts` (solo query flag aditivo)

El modelo de datos, los BRs y los endpoints Hono de la
capability `accounts` quedan sin cambios a nivel de spec
(sin delta de spec). El único cambio en runtime es la
adición del query flag `include=lastActivity` en
`GET /api/accounts`. El handler es aditivo: cuando el
flag está presente, el response gana `lastActivityAt`
por row; cuando está ausente, el response es byte-identical
al contrato actual (REQ-UI-1).

El flag aditivo vive en
`src/modules/accounts/application/actions/list-accounts.action.ts`
(o su sucesor). La implementación:

```typescript
// src/modules/accounts/application/actions/list-accounts.action.ts — adiciones

export interface ListAccountsOptions {
  readonly userId: string;
  /**
   * BR-UI-1 — cuando es true, augmenta cada row con
   * `lastActivityAt` (ISO-8601 o null).
   */
  readonly includeLastActivity?: boolean;
}

// En el handler:
if (opts.includeLastActivity) {
  const lastActivityByAccount = await loadLastActivityAt(userId);
  rows = rows.map((r) => ({
    ...r,
    lastActivityAt: lastActivityByAccount.get(r.id) ?? null,
  }));
}
```

El helper `loadLastActivityAt` es una sola query Prisma:

```typescript
async function loadLastActivityAt(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: { userId },
    _max: { transactionDate: true },
  });
  return new Map(rows.map((r) => [r.accountId, r._max.transactionDate!.toISOString()]));
}
```

La query usa el índice
`@@index([userId, transactionDate])` existente en la tabla
`Transaction` — no se necesita índice nuevo.

### 4.4 Capabilities sin cambios (BRs llevados)

- **`auth`** — el helper `auth()` de Server Component es el
  gate en cada página. Sin cambios. BR-AUTH-N se lleva
  tal cual.
- **`fx`** — la capability FX es solo write-time. La UI no
  llama a `FxRateProvider` directamente; renderiza las
  columnas snapshotteadas `convertedAmountMinor` /
  `convertedCurrency` / `fxAsOfSnapshot`. Sin cambios.
- **`reports`** — los tres endpoints de reports
  (`/api/reports/monthly`, `/api/reports/breakdown`,
  `/api/reports/accounts/:id/flow`) se consumen sin
  cambios. Los nuevos query parameters `?accountId=` y
  `?month=` en el dashboard son UI state puro (lectura
  de search params), no nueva superficie de API. Sin
  cambios en la spec de reports.
- **`errors`** — no se agregan nuevos códigos de error. La
  UI surface el `ErrorEnvelope` existente
  (`{ error: { code, message, details? } }`) de
  `src/shared/errors/app-error.ts`. El mapeo es una
  función pura en el componente de form
  (`mapApiErrorToFieldError`).

### 4.5 Flechas de dependencia cross-capability

```
auth          ──auth()──>  cada Server Component gate
fx            ──FxRateProvider──>  transactions (write-time solo)
              ──display-only snapshot──>  ui (renderiza las columnas snapshotteadas)
transactions  ──/api/transactions + flag──>  ui
accounts      ──/api/accounts + flag──>  ui
reports       ──/api/reports/*──>  ui (solo dashboard)
ui            ──consume las cuatro──>  user
ui            ──NO importa──>  src/modules/{transactions,accounts,reports,fx,auth}/
                                       (usa solo la API Hono; nunca deep imports)
```

La capability `ui` depende de las cuatro capabilities
upstream únicamente a través de la API Hono
(`serverHonoRequest`). NO importa ningún módulo profundo
bajo `src/modules/`. La flecha de dependencia apunta `ui →
{auth, accounts, transactions, reports}` vía HTTP, nunca
vía imports de TypeScript. Esto preserva la regla de
"modules-isolated" (root `AGENTS.md` §10.5) y la regla
de "domain independence" (ningún módulo de dominio conoce
del UI).

### 4.6 Archivos afectados (resumen del delta)

| Archivo                                                                                                                                                                                                                                                                     | Acción      | Descripción                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `app/_ui/tokens.css`                                                                                                                                                                                                                                                        | Nuevo       | Declaraciones de tokens CSS-first de Tailwind v4 (light + dark scope). La fuente única de styling.     |
| `app/_ui/index.ts`                                                                                                                                                                                                                                                          | Nuevo       | Barrel público (documentación; runtime usa imports path-based).                                        |
| `app/_ui/primitives/{button,input,textarea,select,checkbox,radio-group,combobox,field-error,form-field,card,card-header,card-body,card-footer,table,table-header,table-body,table-row,table-cell,badge,empty-state,spinner,skeleton,pagination,dialog,breadcrumb,link}.tsx` | Nuevo       | Primitives del design-system. Server Component por default; Client Component en `Combobox` + `Dialog`. |
| `app/_ui/primitives/*.test.tsx` (≈ 18 archivos)                                                                                                                                                                                                                             | Nuevo       | Archivo de test por primitive (render, loading/disabled, a11y).                                        |
| `app/_ui/layout/{page-header,page-container,breadcrumb-bar}.tsx`                                                                                                                                                                                                            | Nuevo       | Primitives del layout shell (PageHeader + PageContainer + BreadcrumbBar).                              |
| `app/_ui/README.md`                                                                                                                                                                                                                                                         | Nuevo       | Interno: overview developer-facing de la tabla de tokens + catálogo de primitives.                     |
| `app/accounts/page.tsx`                                                                                                                                                                                                                                                     | Modificado  | Render de producción con primitives Card + Table + EmptyState. Auth gate + data fetch sin cambios.     |
| `app/accounts/accounts-list-table.tsx`                                                                                                                                                                                                                                      | Modificado  | Tabla de producción (sort, archived toggle, columna last-activity). Tests co-localizados extendidos.   |
| `app/accounts/[id]/page.tsx`                                                                                                                                                                                                                                                | Modificado  | Render de producción con Card + CardHeader + CardBody + CardFooter.                                    |
| `app/accounts/[id]/account-detail.tsx`                                                                                                                                                                                                                                      | Modificado  | Layout Card de producción. Sin cambios de data.                                                        |
| `app/accounts/[id]/account-detail.test.tsx`                                                                                                                                                                                                                                 | Modificado  | Snapshots extendidos + tests a11y.                                                                     |
| `app/accounts/new/page.tsx`                                                                                                                                                                                                                                                 | Modificado  | Render de producción con FormField + Input + Select + Button.                                          |
| `app/accounts/new/create-account-form.tsx`                                                                                                                                                                                                                                  | Modificado  | Form de producción con validación inline + estado de carga + aria-busy. Lógica de submit sin cambios.  |
| `app/accounts/new/create-account-form.test.tsx`                                                                                                                                                                                                                             | Modificado  | Snapshots extendidos + tests a11y + tests de loading state.                                            |
| `app/accounts/error.tsx`                                                                                                                                                                                                                                                    | Nuevo       | Boundary de error a nivel de segmento (renderiza mensaje user-facing + link de retry).                 |
| `app/transactions/page.tsx`                                                                                                                                                                                                                                                 | Modificado  | Render de producción con Card + Table + Pagination + EmptyState.                                       |
| `app/transactions/accounts-list-table.tsx` (smoke; renombrado abajo)                                                                                                                                                                                                        | Renombrado  | Renombrado a `transactions-list-table.tsx` (matchea el nombre de archivo existente de la spec).        |
| `app/transactions/[id]/page.tsx`                                                                                                                                                                                                                                            | Modificado  | Render de producción con layout Card.                                                                  |
| `app/transactions/[id]/transaction-detail-forms.tsx`                                                                                                                                                                                                                        | Modificado  | Forms edit + delete de producción (Card + Dialog para delete confirm).                                 |
| `app/transactions/[id]/transaction-detail-forms.test.tsx`                                                                                                                                                                                                                   | Nuevo       | Snapshots extendidos + tests a11y para los flujos edit + delete.                                       |
| `app/transactions/new/page.tsx`                                                                                                                                                                                                                                             | Modificado  | Render de producción con FormField + Combobox (account selection).                                     |
| `app/transactions/new/create-transaction-form.tsx`                                                                                                                                                                                                                          | Modificado  | Form de producción con Combobox para account selection + validación inline + estado de carga.          |
| `app/transactions/new/create-transaction-form.test.tsx`                                                                                                                                                                                                                     | Modificado  | Snapshots extendidos + tests a11y + tests de Combobox.                                                 |
| `app/transactions/error.tsx`                                                                                                                                                                                                                                                | Nuevo       | Boundary de error a nivel de segmento.                                                                 |
| `app/dashboard/page.tsx`                                                                                                                                                                                                                                                    | Modificado  | Render de producción con ?accountId y ?month searchParams. Auth gate + fetch paralelo sin cambios.     |
| `app/dashboard/page.test.tsx`                                                                                                                                                                                                                                               | Modificado  | Snapshots extendidos (empty, populated, accountId, month).                                             |
| `app/dashboard/page.seeded.test.tsx`                                                                                                                                                                                                                                        | Modificado  | Snapshots extendidos para el happy path con datos seeded.                                              |
| `app/dashboard/error.tsx`                                                                                                                                                                                                                                                   | Nuevo       | Boundary de error a nivel de segmento.                                                                 |
| `app/_components/dashboard-account-picker.tsx`                                                                                                                                                                                                                              | Nuevo       | Client Component ('use client'). Navegación basada en Link a ?accountId=<id>.                          |
| `app/_components/dashboard-account-picker.test.tsx`                                                                                                                                                                                                                         | Nuevo       | Tests de render + accesibilidad.                                                                       |
| `app/_components/dashboard-month-switcher.tsx`                                                                                                                                                                                                                              | Nuevo       | Client Component ('use client'). Month switcher basado en Link (prev/curr/next).                       |
| `app/_components/dashboard-month-switcher.test.tsx`                                                                                                                                                                                                                         | Nuevo       | Tests de render + rollover Dec→Ene.                                                                    |
| `app/_components/dashboard-monthly-summary.tsx`                                                                                                                                                                                                                             | Modificado  | Render de producción (Card + Table + Badge).                                                           |
| `app/_components/dashboard-monthly-summary.test.tsx`                                                                                                                                                                                                                        | Modificado  | Snapshots extendidos.                                                                                  |
| `app/_components/dashboard-category-breakdown.tsx`                                                                                                                                                                                                                          | Modificado  | Render de producción (Card + Table + Badge).                                                           |
| `app/_components/dashboard-category-breakdown.test.tsx`                                                                                                                                                                                                                     | Modificado  | Snapshots extendidos.                                                                                  |
| `app/_components/dashboard-account-flow.tsx`                                                                                                                                                                                                                                | Modificado  | Render de producción (Card + Table + Bar).                                                             |
| `app/_components/dashboard-account-flow.test.tsx`                                                                                                                                                                                                                           | Modificado  | Snapshots extendidos.                                                                                  |
| `app/_components/transactions-list-table.tsx`                                                                                                                                                                                                                               | Modificado  | Tabla de producción (sort, pagination, filters). Tests co-localizados nuevos.                          |
| `app/_components/transactions-list-table.test.tsx`                                                                                                                                                                                                                          | Nuevo       | Tests de sort + pagination + filter.                                                                   |
| `app/error.tsx`                                                                                                                                                                                                                                                             | Nuevo       | Boundary de error user-facing a nivel root.                                                            |
| `app/not-found.tsx`                                                                                                                                                                                                                                                         | Nuevo       | Boundary 404 user-facing a nivel root.                                                                 |
| `app/globals.css`                                                                                                                                                                                                                                                           | Modificado  | Importa `app/_ui/tokens.css`.                                                                          |
| `app/layout.tsx`                                                                                                                                                                                                                                                            | Sin cambios | Root layout. Los tokens del design-system viven en `tokens.css`; el archivo de layout no cambia.       |
| `src/modules/accounts/application/actions/list-accounts.action.ts`                                                                                                                                                                                                          | Modificado  | Agrega flag `includeLastActivity` + helper `loadLastActivityAt`.                                       |
| `src/modules/transactions/application/actions/list-transactions.action.ts`                                                                                                                                                                                                  | Modificado  | Agrega flag `includeAccountName` + helper `loadAccountNames`.                                          |
| `docs/architecture/ui.md`                                                                                                                                                                                                                                                   | Nuevo       | Referencia del design-system (tabla de tokens + inventario de componentes).                            |
| `docs/qa/transactions-ui.md`                                                                                                                                                                                                                                                | Nuevo       | Checklist manual de QA (keyboard nav, screen reader, nota de follow-up dark-mode).                     |
| `docs/perf/transactions-ui.md`                                                                                                                                                                                                                                              | Nuevo       | Output de Lighthouse + verificación del budget de perf.                                                |
| `openspec/specs/ui/spec.md`                                                                                                                                                                                                                                                 | Nuevo       | Spec canónica (promovida por `sdd-archive`).                                                           |
| `openspec/specs/transactions/spec.md`                                                                                                                                                                                                                                       | Modificado  | REQ-TX-15 REPLACED por puntero delgado a `ui/spec.md`.                                                 |
| `Documents-es/openspec/changes/transactions-ui/design.md`                                                                                                                                                                                                                   | Nuevo       | Mirror en español de este archivo.                                                                     |
| `Documents-es/docs/architecture/ui.md`                                                                                                                                                                                                                                      | Nuevo       | Mirror en español de la referencia del design-system.                                                  |
| `Documents-es/docs/qa/transactions-ui.md`                                                                                                                                                                                                                                   | Nuevo       | Mirror en español del checklist manual de QA.                                                          |
| `Documents-es/docs/perf/transactions-ui.md`                                                                                                                                                                                                                                 | Nuevo       | Mirror en español de la verificación del budget de perf.                                               |
| `package.json`                                                                                                                                                                                                                                                              | Sin cambios | Sin nuevas dependencies.                                                                               |
| `pnpm-lock.yaml`                                                                                                                                                                                                                                                            | Sin cambios | Sin nuevas dependencies → lockfile sin cambios.                                                        |
| `prisma/schema.prisma`                                                                                                                                                                                                                                                      | Sin cambios | Sin nuevos modelos. Sin migrations.                                                                    |

El conteo total de archivos afectados es **64 archivos**
(60 nuevos + modificados + 4 artefactos de doc). El cambio
es **force-chained** en 6 PRs para mantener cada PR por
debajo del review budget de 400 líneas.

---

## 5. Decisiones de diseño

Esta sección documenta las decisiones de diseño con la
rationale completa. Cada decisión es la respuesta a una
pregunta que la spec dejó abierta; la rationale cita el
BR llevado o la alternativa rechazada.

### Decisión: primitives hand-built (no shadcn, no Radix en v1)

**Elección.** Cada primitive en `app/_ui/primitives/` es
hand-built sobre React 19 + la tabla de clases Tailwind v4
existente del proyecto. Sin nuevas top-level dependencies.

**Alternativas consideradas.**

1. **shadcn/ui** — primitives copy-in. Rechazada para v1
   porque la regla del proyecto (root `AGENTS.md` §10.5)
   prohíbe nuevas top-level dependencies. shadcn copia
   source al repo (técnicamente no es una dep, pero el
   área de superficie es comparable), y la superficie de
   diseño de v1 es suficientemente pequeña como para que
   el costo de mantenimiento de copiar sea peor que el
   costo de hand-build.
2. **Primitives Radix UI (unstyled)** — primitives de
   behavior headless. Rechazados para v1 porque Radix es
   una dep; el floor de accesibilidad (focus rings,
   atributos `aria-*`) es alcanzable con primitives
   hand-built + tests de axe-core. El valor de Radix es
   más visible en widgets complejos (Combobox, Dialog)
   donde la superficie de v1 es mínima.
3. **NextUI / MUI / Chakra** — design systems completos.
   Rechazados por la misma razón que Radix: dep + costo
   de reemplazo de tabla de tokens.

**Rationale.** La propuesta §"Alternatives considered"
item 1 rechazó shadcn/NextUI/MUI; item 2 rechazó Radix.
La superficie de v1 (Button, Input, Table, Card, etc.)
está bien dentro de lo que los primitives hand-built
pueden entregar. Un cambio futuro `ui-complex-widgets`
re-evalúa el trade-off una vez que la deuda del
design-system esté paga. La "Forecast" table de la
propuesta codifica esta restricción en el slice 1
(`ui-primitives`): "No new dependency. Every primitive is
hand-built on top of React 19, Tailwind v4, and the
project's existing class table."

### Decisión: Server Component por default; Client Component solo cuando es interactivo

**Elección.** Cada archivo en `app/_ui/` y
`app/{accounts,transactions,dashboard}/` es un Server
Component por default. La directiva `'use client'` se
permite SOLO en:

- `Combobox` (combobox buscable; estado local para el
  query de búsqueda)
- `Dialog` (confirm dialog; estado local para `isOpen`)
- El estado de carga del submit-button adentro de los
  componentes de form (`CreateAccountForm`,
  `CreateTransactionForm`, `TransactionDetailForms`) — el
  button renderiza `Spinner` + `disabled` + `aria-busy`
  mientras el Server Action está en flight; esto es BR-UI-6
  y requiere estado local.
- `DashboardAccountPicker` (Client Component; navega a
  `?accountId=<id>` en el click)
- `DashboardMonthSwitcher` (Client Component; renderiza
  `<Link>`s para previous / current / next month)

**Alternativas consideradas.**

1. **Todos Client Components** — convertir cada página y
   cada primitive a Client Component. Rechazada porque los
   Server Components son la convención existente del
   proyecto (las páginas smoke son todas Server Components)
   y el patrón de fetch paralelo del dashboard es una feature
   de Server Component (`Promise.all` en un Server
   Component, no en un `useEffect`).
2. **Híbrido con `'use client'` a nivel de página** — hacer
   cada página un Client Component. Rechazada porque el auth
   gate a nivel de página (`auth()` + `redirect()`) es una
   API de Server Component; convertir la página a Client
   Component requeriría duplicar el gate del lado servidor.

**Rationale.** Los Server Components poseen el read path
(data fetch, auth gate, render); los Client Components
poseen el estado local del form (loading state del submit
button) y el estado de navegación (los query params
`?accountId` y `?month` del dashboard). El split matchea
la convención existente del proyecto (las páginas smoke son
todas Server Components; el único Client Component en el
codebase hoy es `app/_components/ephemeral-toast.tsx`, el
toast de éxito post-submit de un form). La propuesta
§"Out of scope" item 5 ("Not a new state-management
library") prohíbe explícitamente Redux/Zustand/Jotai; el
split Server Component + Client Component es la alternativa
liviana.

### Decisión: composición vía children, no boolean props

**Elección.** `Card`, `Table`, y `FormField` usan patrones
de compound component (children + sub-componentes con
nombre). SIN props `variant` / `size` / `as` en estos
primitives.

```tsx
// Patrón de composición — RECOMENDADO
<Card>
  <CardHeader title="Account detail" badge={<Badge>Active</Badge>} />
  <CardBody>{/* content */}</CardBody>
  <CardFooter>
    <Button variant="ghost">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>

// Patrón de boolean-prop — RECHAZADO
<Card variant="detail" size="md" title="..." body={...} footerActions={...} />
```

**Alternativas consideradas.**

1. **Proliferación de boolean-prop** —
   `variant="primary|secondary|tertiary"`,
   `size="sm|md|lg"`, `as="div|section|article"` en cada
   primitive. Rechazada porque la superficie de props
   explota combinatoriamente
   (`variant × size × as × state` = 3 × 3 × 3 × 4 = 108
   combinaciones de props) y los nombres de props se
   acoplan a casos de uso específicos (ej.
   `variant="accountDetail"` no compone con otros
   contextos).
2. **Patrón render-prop** — `<Card>{({ variant }) => ...}</Card>`.
   Rechazado porque la API de children es más legible y se
   alinea con las convenciones `children`-first de
   React 19.

**Rationale.** Precedente de Vercel composition patterns
(skill `vercel-composition-patterns`). El patrón
`Card` / `CardHeader` / `CardBody` / `CardFooter` es el
fit screaming-architecture: el nombre del componente es el
intent arquitectónico. El mismo patrón se usa para
`Table` (`TableHeader` / `TableBody` / `TableRow` /
`TableCell`) y `FormField` (el prop `children` es el
control del form). La propuesta §"Slice 1" item 2
prohíbe explícitamente la proliferación de boolean-prop
`as`/`variant` en los primitives.

### Decisión: dos query flags aditivos, cero breaking change

**Elección.** Los dos query flags (`include=lastActivity`
en `GET /api/accounts`, `include=accountName` en
`GET /api/transactions`) son aditivos. Los endpoints sin
el flag DEBEN ser byte-identical al contrato actual
(REQ-UI-1, REQ-UI-2). La forma de datos gana campos
opcionales solamente.

**Alternativas consideradas.**

1. **Campos nuevos siempre presentes** — agregar
   `lastActivityAt` y `accountName` a cada response.
   Rechazada porque cambia la shape del response
   incondicionalmente y rompería la byte-compatibilidad
   para cualquier consumer que hashee el response (los
   tests smoke existentes assertean sobre la shape JSON).
2. **Endpoint nuevo** — agregar
   `GET /api/accounts?with=lastActivity` como ruta
   paralela. Rechazada porque las rutas ya existen; una
   ruta paralela duplica el auth gate, el userId scoping,
   y la cursor pagination. El flag aditivo es el cambio
   mínimo.
3. **Endpoint "include" separado** —
   `GET /api/accounts/include/last-activity`. Rechazada
   porque el query flag es el patrón REST convencional;
   un endpoint separado agrega una ruta que el generador
   de OpenAPI debe documentar.

**Rationale.** La propuesta §"Business rules" items 5-6
(BR-UI-1, BR-UI-2) codificó el flag aditivo como el
contrato. La spec lo lockea en REQ-UI-1 / REQ-UI-2. El
flag aditivo evita romper los tests smoke existentes y los
DTOs de `app/_lib/` (los campos opcionales se declaran con
`?:` para que la serialización JSON sea byte-identical
cuando el flag está ausente).

### Decisión: floor de accesibilidad WCAG 2.2 AA

**Elección.** Las violaciones axe-core `critical` +
`serious` son cero en cada página. Cada primitive
interactivo renderiza
`focus-visible:ring-2 focus-visible:ring-ui-accent` (o
token Tailwind v4 equivalente). Cada form field tiene un
`<label htmlFor="<id>">` apareado. Cada error de form
renderiza inline con `aria-describedby`. Cada `Table`
renderiza `<caption>` y `<th scope="col">`. Cada submit
button renderiza `aria-busy="true"` + `disabled` +
`Spinner` mientras el Server Action está en flight. Las
auditorías AAA (text-on-accent contrast, full keyboard
parity en drag interactions) se difieren.

**Alternativas consideradas.**

1. **WCAG 2.1 AA** — spec más vieja. Rechazada porque
   2.2 AA es el floor actual (Target Size 2.5.5 agregado
   en 2.2; Dragging 2.5.7 agregado en 2.2). La propuesta
   codifica 2.2.
2. **WCAG 2.2 AAA** — más estricto. Rechazado porque la
   superficie de v1 es web + light + mixed EN/ES; AAA
   requiere contrast ratios en text-on-accent que la tabla
   de tokens de v1 no alcanza para cada combinación. AAA
   se difiere a un cambio follow-up `ui-a11y-aaa`.
3. **Sin floor formal de accesibilidad** — code review
   informal. Rechazado porque las business rules BR-UI-3 a
   BR-UI-7 requieren un floor testeable. axe-core es el
   floor testeable.

**Rationale.** La propuesta §"Out of scope" item 5
("Accessibility audit beyond WCAG 2.2 AA") codifica
explícitamente el floor AA. La spec codifica los BRs como
REQ-UI-4 a REQ-UI-8. El verify gate corre axe-core en cada
página con datos seeded; cualquier violación `critical` o
`serious` falla el build.

### Decisión: tokens dark declarados, theme light renderizado (v1)

**Elección.** La tabla de tokens declara las CSS custom
properties de dark-mode bajo `[data-theme='dark']`. La UI
de producción de v1 NUNCA setea el atributo `data-theme`;
los tokens light son los defaults renderizados. Un
`git grep` por variantes `dark:` Tailwind en `app/_ui/`,
`app/accounts/`, `app/transactions/`, `app/dashboard/`,
`app/_components/dashboard-*.tsx` devuelve cero matches en
v1 (REQ-UI-9).

**Alternativas consideradas.**

1. **Sin tokens dark en v1** — declarar solo tokens light.
   Rechazada porque la propuesta §"Out of scope" item 1
   difiere explícitamente dark mode a un cambio follow-up
   pero requiere que la tabla de tokens esté dark-ready.
   Los tokens dark son 17 líneas de CSS; el costo es
   trivial.
2. **Dark mode en v1** — dark theme completo + toggle.
   Rechazado porque la propuesta §"Out of scope" item 1
   lo difiere explícitamente. La tabla de tokens de v1
   está dark-ready; un cambio follow-up `ui-dark-mode`
   activa el toggle y el scope CSS dark.

**Rationale.** Los tokens dark son una forward-declaration.
El costo es 17 líneas de CSS; el beneficio es que el cambio
follow-up `ui-dark-mode` es no-breaking (sin rewrite de la
tabla de tokens). El check de code-review que asegura cero
variantes `dark:` Tailwind previene un agregado stealth de
dark-mode.

---

## 6. Cambios en el composition root

La capability `ui` NO cambia el composition root. La
composición de Hono (`src/composition/build-app-deps.ts`,
`src/composition/create-hono-app.ts`) queda sin cambios. La
UI consume las rutas Hono existentes a través de
`serverHonoRequest` (un helper existente en
`app/_lib/server-hono.ts` o su sucesor). Los dos query
flags aditivos aterrizan en los handlers GET existentes bajo
`src/modules/api/`; el composition root no registra rutas
nuevas.

### 6.1 Composition root intacto

```diff
# src/composition/build-app-deps.ts — SIN CAMBIOS

  export function buildAppDeps(): HonoAppDeps {
    // ... wiring existente sin cambios ...
    // Sin nuevos fields, sin nuevas dependencies, sin nuevos registros.
    return {
      // ... fields existentes sin cambios ...
    };
  }
```

```diff
# src/composition/create-hono-app.ts — SIN CAMBIOS

  export function createHonoApp(deps: HonoAppDeps): OpenAPIHono {
    // ... wiring existente sin cambios ...
    // La UI consume las rutas existentes vía serverHonoRequest
    // del lado de Next.js; no se montan rutas Hono nuevas acá.
    return app;
  }
```

### 6.2 `app/globals.css` — import del token

El único cambio a nivel de root de Next.js es el import de
`app/_ui/tokens.css` en `app/globals.css`:

```diff
# app/globals.css — MODIFICADO

  @tailwind base;
  @tailwind components;
  @tailwind utilities;

+ @import './_ui/tokens.css';
```

El `@import` es elevado por Tailwind v4 a un único archivo
CSS en build time. Las CSS variables de tokens están
disponibles globalmente para cada Server Component y cada
Client Component.

### 6.3 Query flag aditivo en `src/modules/api/`

Los dos query flags se agregan a los handlers existentes:

```typescript
// src/modules/accounts/application/actions/list-accounts.action.ts — adiciones

export async function listAccountsAction(
  deps: ListAccountsDeps,
  input: { userId: string; includeLastActivity?: boolean },
): Promise<ActionResult<ListAccountsData>> {
  const accounts = await deps.accountRepository.list(input.userId);
  const dtos = accounts.map(toFinancialAccountDto);

  if (input.includeLastActivity) {
    const lastActivityByAccount = await loadLastActivityAt(input.userId);
    return ok({
      data: dtos.map((d) => ({
        ...d,
        lastActivityAt: lastActivityByAccount.get(d.id) ?? null,
      })),
    });
  }
  return ok({ data: dtos });
}
```

El helper `loadLastActivityAt` es una sola query Prisma que
usa el índice `@@index([userId, transactionDate])` existente
en la tabla `Transaction`. Sin índice nuevo; sin modelo
Prisma nuevo.

```typescript
// src/modules/transactions/application/actions/list-transactions.action.ts — adiciones

export async function listTransactionsAction(
  deps: ListTransactionsDeps,
  input: {
    userId: string;
    cursor?: string;
    limit?: number;
    accountId?: string;
    includeAccountName?: boolean;
  },
): Promise<ActionResult<ListTransactionsData>> {
  const page = await deps.transactionRepository.list(input.userId, {
    cursor: input.cursor,
    limit: input.limit ?? 20,
    accountId: input.accountId,
  });
  const dtos = page.items.map(toTransactionDto);

  if (input.includeAccountName) {
    const accountNames = await loadAccountNames(
      input.userId,
      dtos.map((d) => d.accountId),
    );
    return ok({
      data: dtos.map((d) => ({
        ...d,
        accountName: accountNames.get(d.accountId) ?? null,
      })),
      nextCursor: page.nextCursor,
    });
  }
  return ok({ data: dtos, nextCursor: page.nextCursor });
}
```

El helper `loadAccountNames` es un solo `findMany` de Prisma
que batchea los account IDs y devuelve un `Map<accountId,
accountName>`:

```typescript
async function loadAccountNames(
  userId: string,
  accountIds: string[],
): Promise<Map<string, string>> {
  const accounts = await prisma.financialAccount.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true, name: true },
  });
  return new Map(accounts.map((a) => [a.id, a.name]));
}
```

La query usa el índice `userId` existente en la tabla
`FinancialAccount`; el filtro `id IN (...)` se satisface
con la primary key. Sin índice nuevo.

### 6.4 Consumidores de Server Action (sin cambios)

Las Server Actions bajo
`app/_actions/transactions-server-actions.ts` quedan sin
cambios. Los componentes de form consumen las Server
Actions a través del hook `useActionState` de React 19
(el nuevo nombre para `useFormState` en React 19) en los
primitives de form Client Component. La shape de retorno
de la Server Action no cambia:
`{ ok: true, value: TransactionDTO }` o
`{ ok: false, error: ErrorEnvelope }`.

### 6.5 Surface del envelope de error (NUEVO — mínimo)

La superficie de UI introduce un pequeño helper de función
pura en `app/_ui/_shared/map-api-error.ts` que mapea el
`ErrorEnvelope` existente a un mapa de errores a nivel de
field:

```typescript
// app/_ui/_shared/map-api-error.ts

import type { ErrorEnvelope } from '@/shared/errors/app-error';

export interface FieldErrorMap {
  [fieldName: string]: string;
}

/**
 * Mapea un envelope de error de la API a un mapa de errores a nivel de field.
 *
 * El primer mensaje de error de `error.details[]` se renderiza
 * junto al field ofensor con `aria-describedby` linkeando
 * el field con el `id` del elemento de error. El `error.code`
 * determina el routing a nivel de field:
 *
 *   - `INVALID_AMOUNT`         → `amountMinor`
 *   - `FUTURE_DATE_NOT_ALLOWED` → `transactionDate`
 *   - `ACCOUNT_ARCHIVED`       → `accountId`
 *   - `VALIDATION_ERROR`       → `error.details[0].path` si está presente, sino primer field del form
 *   - otros códigos             → primer field del form (fallback top-of-form)
 */
export function mapApiErrorToFieldError(
  envelope: ErrorEnvelope,
  fieldNames: readonly string[],
): FieldErrorMap {
  // ... implementation ...
}
```

El helper es el único punto de contacto entre el envelope
de error de Hono y el form de la UI. El mapeo es testeable
independientemente de los componentes de form.

---

## 7. Superficie pública — exports de `app/_ui/`

La superficie pública es el conjunto de primitives y
componentes del layout-shell exportados desde `app/_ui/`.
Los consumers importan path-based (`import { Button } from
'../_ui/primitives/button'`); el archivo `app/_ui/index.ts`
es un barrel de documentación, no un barrel de runtime.

### 7.1 Primitives — `app/_ui/primitives/`

| Export        | Server/Client | Shape de props (firma)                                                                                            | Contrato a11y                                                                                                      |
| ------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Button`      | Server        | `ButtonProps & ButtonHTMLAttributes` (variant, isLoading, iconLeft, iconRight, más todos los attrs de `<button>`) | `focus-visible:ring-2 focus-visible:ring-ui-accent`; loading → `disabled` + `aria-busy="true"` + `<Spinner>`       |
| `Input`       | Server        | `InputProps & InputHTMLAttributes` (id requerido, más todos los attrs de `<input>`)                               | `aria-describedby` cuando se aparea con `FormField` + `FieldError`; `aria-invalid` cuando hay error                |
| `Textarea`    | Server        | `TextareaProps & TextareaHTMLAttributes` (id requerido, más todos los attrs de `<textarea>`)                      | Igual que `Input`.                                                                                                 |
| `Select`      | Server        | `SelectProps & SelectHTMLAttributes` (id requerido, `options`, más todos los attrs de `<select>`)                 | Igual que `Input`; el `<select>` nativo es el primitive semántico.                                                 |
| `Checkbox`    | Server        | `CheckboxProps & InputHTMLAttributes` (id requerido, más attrs de `<input type="checkbox">`)                      | Igual que `Input`.                                                                                                 |
| `RadioGroup`  | Server        | `RadioGroupProps` (name, value, onChange, children)                                                               | Compuesto de `<fieldset>` + `<legend>` + items `<input type="radio">`.                                             |
| `Combobox`    | Client        | `ComboboxProps` (id, value, onChange, options, placeholder, required, disabled, aria-label)                       | El `<select>` subyacente es el primitive semántico; `<input type="search">` para búsqueda visual; nav con teclado. |
| `FieldError`  | Server        | `FieldErrorProps` (id, message)                                                                                   | `role="alert"`; `aria-live="polite"`.                                                                              |
| `FormField`   | Server        | `FormFieldProps` (id, label, required, description, error, children)                                              | Renderiza `<label htmlFor={id}>`; setea `aria-describedby` + `aria-invalid` en children cuando hay error.          |
| `Card`        | Server        | `CardProps & HTMLAttributes` (aria-label, aria-labelledby)                                                        | Default `<article>`; renderiza solo children.                                                                      |
| `CardHeader`  | Server        | `CardHeaderProps & HTMLAttributes` (title, badge, actions)                                                        | `<h2>` title; badge + actions como siblings.                                                                       |
| `CardBody`    | Server        | `CardBodyProps & HTMLAttributes`                                                                                  | Slot de contenido `<div>`.                                                                                         |
| `CardFooter`  | Server        | `CardFooterProps & HTMLAttributes`                                                                                | Slot de acción `<div>`.                                                                                            |
| `Table`       | Server        | `TableProps & TableHTMLAttributes` (caption, hideCaption)                                                         | `<caption>` requerido; `<table role="table">`; renderiza solo children.                                            |
| `TableHeader` | Server        | `TableHeaderProps & HTMLAttributes` (columns)                                                                     | Renderiza `<thead><tr>` con `<th scope="col">` por columna; `aria-sort` en columnas sortables.                     |
| `TableBody`   | Server        | `TableBodyProps & HTMLAttributes`                                                                                 | Slot de contenido `<tbody>`.                                                                                       |
| `TableRow`    | Server        | `TableRowProps & HTMLAttributes`                                                                                  | Slot de contenido `<tr>`.                                                                                          |
| `TableCell`   | Server        | `TableCellProps & TdHTMLAttributes`                                                                               | Slot de contenido `<td>`.                                                                                          |
| `Badge`       | Server        | `BadgeProps & HTMLAttributes` (variant: neutral/accent/success/warning/danger, children)                          | Slot de contenido `<span>`.                                                                                        |
| `EmptyState`  | Server        | `EmptyStateProps` (title, description, illustration, cta)                                                         | `role="status"`; CTA es el primer focuseable cuando está presente.                                                 |
| `Spinner`     | Server        | `SpinnerProps` (size, label)                                                                                      | `role="status"`; `aria-label` (default: "Loading").                                                                |
| `Skeleton`    | Server        | `SkeletonProps` (width, height)                                                                                   | `aria-hidden="true"`; `aria-busy="true"` en el parent.                                                             |
| `Pagination`  | Server        | `PaginationProps` (currentPage, totalPages, baseUrl)                                                              | `<nav aria-label="Pagination">`; `<Link>`s con `aria-label`.                                                       |
| `Dialog`      | Client        | `DialogProps` (open, onClose, title, description, children)                                                       | `role="dialog"`; `aria-modal="true"`; focus trap; Escape cierra.                                                   |
| `Breadcrumb`  | Server        | `BreadcrumbProps` (items: [{label, href}])                                                                        | `<nav aria-label="Breadcrumb"><ol>` con items `<Link>`.                                                            |
| `Link`        | Server        | `LinkProps & AnchorHTMLAttributes` (href, más todos los attrs de `<a>`)                                           | Wrapper de Next.js `Link`; `focus-visible:ring-2`.                                                                 |

### 7.2 Layout shell — `app/_ui/layout/`

| Export          | Server/Client | Shape de props                                                    | Propósito                                                                                       |
| --------------- | ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PageHeader`    | Server        | `PageHeaderProps` (title, description, actions)                   | Reemplaza el `<h1>` desnudo de las páginas smoke. Renderiza title + description + actions slot. |
| `PageContainer` | Server        | `PageContainerProps` (children, maxWidth: 'sm'\|'md'\|'lg'\|'xl') | Wrapper de max-width + padding responsive (`px-4 md:px-6 lg:px-8 py-6`).                        |
| `BreadcrumbBar` | Server        | `BreadcrumbBarProps` (items)                                      | Compone el primitive `Breadcrumb`; renderiza dentro del slot de `PageHeader`.                   |
| `Sidebar`       | Server        | `SidebarProps` (children)                                         | Rail izquierdo opcional. NO se usa en v1 (exportado para el cambio follow-up `ui-sidebar`).     |
| `Topbar`        | Server        | `TopbarProps` (children)                                          | Top bar opcional. NO se usa en v1 (exportado para follow-up).                                   |

### 7.3 Cambios a nivel de página (smoke → producción)

| Página                           | Auth gate               | Data fetch                                                       | Swap de render                                                                                                             |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app/accounts/page.tsx`          | `auth()` + `redirect()` | `serverHonoRequest('/api/accounts?include=lastActivity')`        | `PageHeader` + `Card` + `Table` (con sort + archived toggle) + `EmptyState` + `Pagination`                                 |
| `app/accounts/[id]/page.tsx`     | `auth()` + `redirect()` | `serverHonoRequest('/api/accounts/:id')`                         | `PageHeader` + `Card` + `CardHeader` (name + currency badge + archived badge) + `CardBody` (key-value rows)                |
| `app/accounts/new/page.tsx`      | `auth()` + `redirect()` | N/A (Server Action para create)                                  | `PageHeader` + `Card` + `CardBody` + `CreateAccountForm` (FormField + Input + Select + Button + Spinner)                   |
| `app/transactions/page.tsx`      | `auth()` + `redirect()` | `serverHonoRequest('/api/transactions?include=accountName')`     | `PageHeader` + `Card` + `Table` (con sort + filters) + `EmptyState` + `Pagination`                                         |
| `app/transactions/[id]/page.tsx` | `auth()` + `redirect()` | `serverHonoRequest('/api/transactions/:id')`                     | `PageHeader` + `Card` + `TransactionDetailForms` (form edit + Dialog delete)                                               |
| `app/transactions/new/page.tsx`  | `auth()` + `redirect()` | N/A (Server Action para create)                                  | `PageHeader` + `Card` + `CardBody` + `CreateTransactionForm` (FormField + Combobox + Input + Button)                       |
| `app/dashboard/page.tsx`         | `auth()` + `redirect()` | `serverHonoRequest('/api/reports/monthly?month=...')` (paralelo) | `PageHeader` + `DashboardMonthSwitcher` + `Card` (summary) + `Card` (breakdown) + `Card` (flow + `DashboardAccountPicker`) |

El auth gate a nivel de página es idéntico al de las páginas
smoke: un solo `await auth()` + `if (!session?.user) redirect(...)`.
El data fetch cambia solo en el query string (los dos flags
aditivos `include=` en `/api/accounts` y `/api/transactions`).
El render layer es la única adición de calidad de producción.

### 7.4 Barrel público — `app/_ui/index.ts`

```typescript
// app/_ui/index.ts — barrel de documentación; el runtime usa imports path-based

export { Button } from './primitives/button';
export { Input } from './primitives/input';
export { Textarea } from './primitives/textarea';
export { Select } from './primitives/select';
export { Checkbox } from './primitives/checkbox';
export { RadioGroup } from './primitives/radio-group';
export { Combobox } from './primitives/combobox';
export { FieldError } from './primitives/field-error';
export { FormField } from './primitives/form-field';
export { Card, CardHeader, CardBody, CardFooter } from './primitives/card';
export { Table, TableHeader, TableBody, TableRow, TableCell } from './primitives/table';
export { Badge } from './primitives/badge';
export { EmptyState } from './primitives/empty-state';
export { Spinner } from './primitives/spinner';
export { Skeleton } from './primitives/skeleton';
export { Pagination } from './primitives/pagination';
export { Dialog } from './primitives/dialog';
export { Breadcrumb } from './primitives/breadcrumb';
export { Link } from './primitives/link';

export { PageHeader } from './layout/page-header';
export { PageContainer } from './layout/page-container';
export { BreadcrumbBar } from './layout/breadcrumb-bar';
export { Sidebar } from './layout/sidebar';
export { Topbar } from './layout/topbar';
```

El barrel NO exporta:

- `tokens.css` (importado vía `@import` en `app/globals.css`).
- Archivos de test (`*.test.tsx`).
- Helpers internos (`_shared/cx.ts`, `_shared/map-api-error.ts`).
- Los componentes de form bajo `app/{accounts,transactions}/`.
- Los Client Components del dashboard bajo `app/_components/`.

---

## 8. Mapeo de errores

La superficie de UI surfacela errores del `ErrorEnvelope`
existente en `src/shared/errors/app-error.ts`. La shape del
envelope es `{ error: { code: ErrorCode, message: string,
details?: Array<{ path: string, message: string }> } }`. La
UI NO introduce códigos de error nuevos; el enum existente
cubre cada superficie.

### 8.1 Mapeo código → field (superficie UI)

| Código de wire            | HTTP | Target a nivel de field                                              | Superficie UI                                                    |
| ------------------------- | ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | `error.details[0].path` si está presente, sino primer field del form | `FieldError` inline vía `aria-describedby`                       |
| `INVALID_AMOUNT`          | 400  | `amountMinor`                                                        | `FieldError` inline en el input de amount                        |
| `FUTURE_DATE_NOT_ALLOWED` | 400  | `transactionDate`                                                    | `FieldError` inline en el input de date                          |
| `ACCOUNT_ARCHIVED`        | 409  | `accountId`                                                          | `FieldError` inline en el Combobox de account                    |
| `NOT_FOUND`               | 404  | Top-of-form (sin field)                                              | Redirect en páginas de detail; banner inline en páginas de lista |
| `UNAUTHORIZED`            | 401  | Top-of-form                                                          | Redirect a `/auth/signin` con callbackUrl                        |
| `INTERNAL_ERROR`          | 500  | Top-of-form                                                          | El boundary de error renderiza la página de error                |
| `RATE_LIMIT_EXCEEDED`     | 429  | Top-of-form                                                          | Banner inline con hint de retry-after                            |

El mapeo está centralizado en
`app/_ui/_shared/map-api-error.ts` (ver §6.5). Cada
componente de form consume el mapper; ningún form
reimplementa el mapeo.

### 8.2 Render de error inline

Cuando la Server Action de un form devuelve
`{ ok: false, error: ErrorEnvelope }`, el Client Component
del form invoca `mapApiErrorToFieldError` y guarda el
resultado en estado local. El primitive `FormField` consume
el mensaje de error y renderiza el sibling `FieldError` con
`aria-describedby` linkeando el field al `id` del elemento
de error.

```tsx
// Patrón de form (RECOMENDADO)
<FormField id="amount" label="Amount" required error={fieldErrors.amountMinor}>
  <Input
    id="amount"
    name="amountMinor"
    type="number"
    defaultValue={...}
    aria-describedby={fieldErrors.amountMinor ? 'amount-error' : undefined}
    aria-invalid={fieldErrors.amountMinor ? 'true' : undefined}
  />
</FormField>
{fieldErrors.amountMinor && (
  <FieldError id="amount-error" message={fieldErrors.amountMinor} />
)}
```

El form NO depende solamente de un alert top-of-form
(REQ-UI-6). El resumen top-of-form puede existir como
superficie secundaria (`role="alert"` en el primer hijo del
form), pero cada error DEBE tener un render inline junto a
su field.

### 8.3 Superficies de boundaries de error

Los boundaries de error por route segment renderizan el
`error.message` del envelope de error y un link de retry:

```tsx
// app/accounts/error.tsx — boundary a nivel de segmento
'use client'; // Requerido para error.tsx (convención de Next.js App Router)

export default function AccountsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer>
      <Card>
        <CardHeader title="Algo salió mal" />
        <CardBody>
          <p>No pudimos cargar las cuentas.</p>
          <p className="text-sm text-ui-fg-muted">{error.message || 'Error desconocido'}</p>
          <Button onClick={reset}>Reintentar</Button>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
```

El boundary usa los primitives del design-system; el patrón
`Card` + `CardHeader` + `CardBody` + `Button` es el mismo
en cada segmento. El callback `reset` (Next.js App Router)
reintenta el render.

### 8.4 Resumen de error top-of-form (superficie secundaria opcional)

Cuando múltiples fields tienen errores, el form PUEDE
renderizar un resumen top-of-form como superficie secundaria.
El resumen usa `role="alert"` y `aria-live="polite"` para
que los screen readers lo anuncien en el submit. El resumen
NO es un sustituto de los errores inline; es una ayuda de
navegación para usuarios que quieran ver todos los errores
a la vez.

```tsx
// Patrón de resumen top-of-form (superficie secundaria OPCIONAL)
{
  Object.keys(fieldErrors).length > 0 && (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-ui-md border-ui-danger bg-ui-danger/10 p-4"
    >
      <p className="ui-font-semibold">Revisá los siguientes campos:</p>
      <ul className="mt-2 list-disc pl-4">
        {Object.entries(fieldErrors).map(([field, message]) => (
          <li key={field}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
```

El resumen es la superficie secundaria; los errores inline
son la superficie primaria. El verify gate asegura que
ambas superficies existan cuando hay errores presentes.

---

## 9. Manejo de estado

La capability `ui` NO introduce una librería de manejo de
estado. El modelo de estado es:

- **Estado de lectura (data)** — propiedad de los Server
  Components. La página llama a `serverHonoRequest` (o una
  Server Action) en el render; el resultado es el input de
  render de la página.
- **Estado local del form** — propiedad de los Client
  Components. Los componentes de form usan `useActionState`
  de React 19 para la máquina de estados de submit
  (idle → submitting → success/error).
- **Estado de navegación (query params)** — propiedad de los
  Client Components. El `DashboardAccountPicker` y el
  `DashboardMonthSwitcher` del dashboard usan
  `useRouter` de Next.js para pushear los nuevos query params.
- **Estado de modal (Dialog open/close)** — propiedad de los
  Client Components. El primitive `Dialog` usa `useState`
  para el estado `isOpen`.
- **Estado de búsqueda del Combobox** — propiedad de los
  Client Components. El primitive `Combobox` usa `useState`
  para el query de búsqueda.

### 9.1 Máquina de estados — submit del form

```
idle ──[submit click]──> submitting ──[response: ok]──> success ──[redirect]──> (page)
                              │
                              └──[response: error]──> error ──[field error clear]──> idle
```

El hook `useActionState` devuelve
`{ state, formAction, isPending }`. El submit button lee
`isPending` para renderizar el estado de carga (`Spinner` +
`disabled` + `aria-busy`). El form lee `state.error` para
poblar el mapa de errores a nivel de field.

### 9.2 Máquina de estados — dialog

```
closed ──[trigger click]──> open ──[Escape | Cancel | Confirm]──> closed
                                  │
                                  └──[backdrop click]──> closed
```

El primitive `Dialog` envuelve el elemento `<dialog>`
nativo. El elemento nativo maneja el focus trap y el
comportamiento de Escape-to-close; el estado de React es
el booleano `isOpen` que controla el atributo `open`.

### 9.3 Máquina de estados — query params del dashboard

```
(?accountId=null, ?month=current) ──[AccountPicker click]──> (?accountId=<id>, ?month=current)
(?accountId=<id>, ?month=current) ──[MonthSwitcher prev]──> (?accountId=<id>, ?month=prev)
(?accountId=<id>, ?month=current) ──[MonthSwitcher next]──> (?accountId=<id>, ?month=next)
```

El estado es el query string de la URL. Los Client Components
usan `useRouter().push(...)` para navegar; el Server Component
relee los search params en el siguiente render.

### 9.4 Sin Zustand / Jotai / Redux

La propuesta §"Out of scope" item 5 prohíbe explícitamente
nuevas librerías de manejo de estado. El modelo de estado
usa:

- `useActionState` de React 19 (built-in).
- `useState` de React 19 (built-in).
- `useRouter` y `useSearchParams` de Next.js (built-in).
- Server Components de Next.js para el estado de lectura
  (built-in).

No se agrega ninguna librería third-party de estado. El
verify gate asegura que `pnpm-lock.yaml` queda sin cambios
después de que el cambio mergee (root `AGENTS.md` §5.3).

---

## 10. Budget de performance

El budget de performance es la aserción **p95 page load < 2s**
en las tres páginas primarias (`/dashboard`, `/transactions`,
`/accounts`) bajo 4G simulado + Moto G4 (Lighthouse CLI).
El budget está codificado en la propuesta §"Acceptance" item
15 y se verifica en `docs/perf/transactions-ui.md` durante
el verify gate (slice 6).

### 10.1 Budget de tamaño de bundle

La capability `ui` es hand-built sobre Tailwind v4 (sin
nuevas deps de JS). El delta de tamaño de bundle está
acotado por:

- **CSS:** `app/_ui/tokens.css` (≈ 60 líneas de CSS
  variables, ≈ 1.5 KB minificado) se importa una sola vez
  en `app/globals.css`. Tailwind v4 lee las CSS variables y
  las expone como utility classes; las utility classes se
  tree-shakean a los nombres de clase reales usados en las
  páginas de v1 (la config `content` en `tailwind.config.ts`
  escanea `app/{_ui,accounts,transactions,dashboard,
_components}/`).
- **JS:** cero nuevas deps de JS. Los primitives son Server
  Components de React 19 (cero JS enviado al cliente) y un
  puñado de Client Components (`Combobox`, `Dialog`,
  `DashboardAccountPicker`, `DashboardMonthSwitcher`, el
  estado del submit-button del form). Los Client Components
  envían solo el JS necesario para su comportamiento
  interactivo.

| Asset                             | Budget de tamaño (gzip) | Notas                                               |
| --------------------------------- | ----------------------- | --------------------------------------------------- |
| `app/_ui/tokens.css`              | ≤ 1.5 KB                | Solo CSS variables.                                 |
| `Combobox` Client Component       | ≤ 3 KB                  | Hand-built; sin dep de downshift.                   |
| `Dialog` Client Component         | ≤ 2 KB                  | Envuelve `<dialog>` nativo; estado React mínimo.    |
| `DashboardAccountPicker`          | ≤ 1.5 KB                | Basado en `<Link>`; sin data fetching client-side.  |
| `DashboardMonthSwitcher`          | ≤ 1.5 KB                | Basado en `<Link>`; math de fechas en función pura. |
| Estado del submit-button del form | ≤ 1 KB                  | `useActionState` es built-in de React.              |
| Total Client Component JS         | ≤ 10 KB                 | Todos los Client Components combinados, gzip.       |

Los Server Components contribuyen cero JS al bundle del
cliente.

### 10.2 Performance de render

Los tres fetches paralelos del dashboard
(`/api/reports/monthly?month=...`,
`/api/reports/breakdown?month=...`,
`/api/reports/accounts/:id/flow?month=...`) son llamadas
`Promise.all` del lado servidor. El tiempo wall total es
`max(t1, t2, t3)` no `t1 + t2 + t3`. La página
`/transactions` fetcha `/api/transactions?include=accountName`
(una sola llamada con un `findMany` adicional de Prisma
para los nombres de accounts); el tiempo wall está acotado
por el overhead de la rama `includeAccountName`
(~ 10ms para el `findMany` con una cláusula IN pequeña).

La página `/accounts` fetcha
`/api/accounts?include=lastActivity` (una sola llamada con
un `groupBy` adicional de Prisma para la última actividad);
el tiempo wall está acotado por el overhead de la query
`groupBy` (~ 5-15ms para el scan del índice
`@@index([userId, transactionDate])`).

### 10.3 Verificación del budget de Lighthouse / Perf

El verify gate (slice 6) corre Lighthouse CLI contra
`pnpm build && pnpm start` bajo 4G simulado + Moto G4. El
output se pega en `docs/perf/transactions-ui.md`. La aserción
es **p95 page load < 2s** en `/`, `/dashboard`, y
`/transactions`.

El budget es conservador: la UI de producción de v1 envía
cero nuevas deps de JS, el bundle es < 10 KB gzipped para
todos los Client Components combinados, y los renders de
página son Server Components (sin data fetching del lado
cliente para el paint inicial).

### 10.4 Code-splitting y RSC

Next.js 16 + React 19 Server Components ya proveen
code-splitting automático a nivel de route segment. Los
Client Components se cargan on-demand cuando la página
hidrata. Los componentes de form (`CreateAccountForm`,
`CreateTransactionForm`, `TransactionDetailForms`) envían
el estado del submit-button como un pequeño Client
Component inline adentro de un form que por lo demás es
Server Component; el boundary de hidratación es solo el
button.

Los Client Components `Combobox` y `Dialog` se cargan solo
en las páginas que los usan (`/transactions/new` y
`/transactions/[id]`). Los Client Components del dashboard
(`DashboardAccountPicker`, `DashboardMonthSwitcher`) se
cargan solo en `/dashboard`. Sin hidratación global de
Client Components.

### 10.5 Sin nuevas dependencies, sin bloat de bundle

La propuesta §"Affected areas" row para `package.json` dice
**None** ("No new dependencies (BR-UI constraint)"). La row
para `pnpm-lock.yaml` dice **None** ("No new dependencies →
lockfile unchanged"). El verify gate asegura que no hay
drift de `pnpm-lock.yaml` después de que el cambio mergee
(root `AGENTS.md` §5.3 + el check de Husky pre-commit del
proyecto en `scripts/check-lockfile.sh`).

---

## 11. Estrategia de accesibilidad

La estrategia de accesibilidad es el **floor WCAG 2.2 AA**
codificado en REQ-UI-4 a REQ-UI-8 de la spec. La estrategia
se implementa en cuatro niveles:

1. **Contrato a11y a nivel de primitive** — la shape de
   props de cada primitive hace cumplir el contrato a11y a
   nivel TypeScript (el `id` es requerido para `Input`,
   `Select`, `FormField`; el `caption` es requerido para
   `Table`; el `title` es requerido para `Dialog`; etc.).
2. **Test de regresión por primitive** — cada primitive
   tiene un archivo de test que asegura el contrato a11y
   (focus ring renderizado, `aria-describedby` seteado
   cuando hay error, `aria-sort` reflejando la dirección de
   sort, etc.).
3. **Test de integración axe-core a nivel de página** — el
   verify gate (slice 5) corre axe-core en cada página con
   datos seeded. La aserción es
   `expect(await axe(container)).toHaveNoViolations()` con
   severidad `critical` o `serious` fallando el build.
4. **Checklist manual de QA** — el checklist manual de QA
   propiedad del usuario en `docs/qa/transactions-ui.md`
   cubre navegación por teclado (Tab order, focus visible,
   Enter/Space activation, Escape para cerrar dialogs) y
   screen reader run-through (VoiceOver en macOS, NVDA en
   Windows). El verify gate falla hasta que el usuario firma
   el checklist (REQ-UI-11).

### 11.1 Patrones ARIA

Los primitives usan los siguientes patrones ARIA (WAI-ARIA
Authoring Practices Guide):

| Primitive    | Patrón ARIA                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `Button`     | `<button>` con `aria-busy="true"` + `aria-label` cuando es icon-only                                                   |
| `Input`      | `<input>` con `aria-describedby` (cuando hay error) + `aria-invalid` (cuando hay error)                                |
| `Select`     | `<select>` nativo (sin ARIA extra necesario)                                                                           |
| `Combobox`   | Patrón combobox de WAI-ARIA 1.2: `<select>` (semántico) + `<input>` (visual)                                           |
| `Checkbox`   | `<input type="checkbox">` nativo (sin ARIA extra necesario)                                                            |
| `RadioGroup` | `<fieldset>` + `<legend>` + `<input type="radio">`                                                                     |
| `Dialog`     | Patrón dialog de WAI-ARIA: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby` + focus trap |
| `Table`      | `<table>` + `<caption>` + `<th scope="col">` + `aria-sort` en columnas sortables                                       |
| `Pagination` | `<nav aria-label="Pagination">` + controles `<Link>` con `aria-label`                                                  |
| `Breadcrumb` | `<nav aria-label="Breadcrumb">` + `<ol>` + items `<Link>`                                                              |
| `EmptyState` | `<div role="status">` (anuncia en navegación)                                                                          |
| `Spinner`    | `<div role="status">` + `aria-label` (default: "Loading")                                                              |
| `FieldError` | `<div role="alert">` + `aria-live="polite"` + `aria-atomic="true"`                                                     |
| `FormField`  | `<label htmlFor>` + setea `aria-describedby` + `aria-invalid` en children                                              |

### 11.2 Manejo de foco

Las reglas de manejo de foco son:

1. **Indicador de foco visible en cada primitive
   interactivo.** `focus-visible:ring-2
focus-visible:ring-ui-accent` (o
   `focus-visible:ring-ui-danger` para `Button
variant="danger"`). El tratamiento visual DEBE tener un
   contrast ratio de al menos 3:1 contra el background
   circundante (WCAG 2.4.7 Focus Visible).
2. **El Tab order sigue el orden visual.** Sin overrides de
   `tabIndex`; sin `tabIndex={0}` en elementos no
   interactivos.
3. **Link skip-to-content** en cada página (el root layout
   de Next.js App Router envía esto por convención; la UI
   de producción no modifica el root layout).
4. **Focus trap dentro de `Dialog` cuando está abierto.** El
   elemento `<dialog>` nativo maneja el focus trap; el
   estado de React controla el atributo `open`.
5. **Retorno de foco al cerrar `Dialog`.** Cuando `Dialog`
   se cierra, el foco vuelve al elemento trigger.
6. **Sin foco en `EmptyState` a menos que haya CTA
   presente.** El `EmptyState` es una región de status
   pasiva; el CTA es el primer elemento focuseable cuando
   está presente.

### 11.3 Navegación por teclado

Las reglas de navegación por teclado son:

1. **Tab** navega hacia adelante; **Shift+Tab** navega
   hacia atrás. Cada elemento interactivo es alcanzable.
2. **Enter** y **Space** activan el control enfocado.
3. **Escape** cierra `Dialog` y los dropdowns de
   `Combobox`.
4. **ArrowDown / ArrowUp** navegan options adentro de
   `Combobox` y `RadioGroup`.
5. **Home / End** saltan a la primera / última option
   adentro de `Combobox`.
6. **Tab** desde adentro de `Dialog` cicla por los
   elementos focuseables del dialog; tabular más allá del
   último elemento vuelve al primero.

El checklist manual de QA (REQ-UI-11) verifica estas reglas
de navegación por teclado en cada página. El usuario firma
el checklist antes de que el verify gate pase.

### 11.4 Soporte de screen reader

Las reglas de soporte de screen reader son:

1. **Landmarks** — cada página tiene `<header>`, `<main>`,
   `<nav>` (cuando aplica), `<footer>` (cuando aplica). El
   primitive `PageHeader` renderiza `<header>`; los
   primitives `Breadcrumb` y `Pagination` renderizan
   `<nav>`.
2. **Headings** — cada página tiene un `<h1>` (el title de
   `PageHeader`); los headings de sección usan `<h2>` (el
   title de `CardHeader`); los sub-headings usan `<h3>`.
3. **Labels de form** — cada form field tiene un `<label
htmlFor="<id>">` apareado (REQ-UI-5). Los botones
   icon-only cargan `aria-label`.
4. **Headers de Table** — cada `<th>` carga `scope="col"`
   (REQ-UI-8). Las columnas sortables cargan `aria-sort`
   reflejando la dirección de sort actual.
5. **Errores de form** — cada error tiene `role="alert"` y
   `aria-live="polite"` para que los screen readers
   anuncien el error en el submit. El `aria-describedby`
   del field linkea al `id` del error.
6. **Estado de carga** — el `aria-busy="true"` del submit
   button anuncia el estado en-flight. El `Spinner` carga
   `role="status"` + `aria-label="Loading"`.

El checklist manual de QA (REQ-UI-11) verifica estas reglas
de soporte de screen reader en VoiceOver (macOS) y NVDA
(Windows).

### 11.5 Tests de integración axe-core

Los tests de integración de axe-core viven en `tests/a11y/`.
Cada página se renderiza con datos seeded; la aserción es
`expect(await axe(container)).toHaveNoViolations()`. El
test falla en cualquier violación `critical` o `serious`.

---

## 12. Estrategia de i18n

La UI de producción de v1 envía **copia mixta EN/ES**
siguiendo la convención existente del proyecto (la copia del
dashboard es español según el cambio `reports`; el texto UI
a nivel de componente es inglés). Un cambio follow-up
`ui-i18n` introduce un message catalog.

### 12.1 Convención mixta EN/ES (v1)

La convención es:

- **Copia en español** — labels a nivel de dashboard
  (`Resumen mensual`, `Desglose por categoría`, `Flujo de
cuenta`), mensajes de error (`Algo salió mal`, `No pudimos
cargar las cuentas`), y labels de form field en el
  contexto del dashboard.
- **Copia en inglés** — texto UI a nivel de componente
  (`Cancel`, `Save`, `Edit`, `Delete`, `Loading`,
  `Previous page`, `Next page`), mensajes de error de la
  API (el `error.message` del `ErrorEnvelope` está en
  inglés según la convención existente de la API), y labels
  de form field en los contextos de `accounts` y
  `transactions`.

La convención está codificada en la §Glossary de la spec
("Mixed EN/ES copy") y se verifica en el verify gate (los
strings de traducción curados manualmente).

### 12.2 Sin message catalog en v1

La propuesta §"Out of scope" item 3 ("i18n") difiere
explícitamente un message catalog a un cambio follow-up
`ui-i18n`. La UI de producción de v1 hard-codifica los
strings en español/inglés en el source del componente. Un
check de code-review asegura que no se agregue ninguna
librería i18n nueva (el lockfile de v1 queda sin cambios).

### 12.3 Strings para traducir (inventario v1)

El inventario de strings de v1 (extraído de la tabla
"Users and situations" de la propuesta + los precedentes de
las páginas smoke):

| Contexto            | String                           | Idioma                     |
| ------------------- | -------------------------------- | -------------------------- |
| Dashboard           | `Resumen mensual`                | ES                         |
| Dashboard           | `Desglose por categoría`         | ES                         |
| Dashboard           | `Flujo de cuenta`                | ES                         |
| Dashboard           | `Algo salió mal`                 | ES                         |
| Dashboard           | `No pudimos cargar el dashboard` | ES                         |
| Dashboard           | `Sin datos`                      | ES                         |
| Dashboard           | `Registrar primera transacción`  | ES                         |
| Dashboard           | `Mes anterior`                   | ES                         |
| Dashboard           | `Mes siguiente`                  | ES                         |
| Accounts            | `Cancel`                         | EN                         |
| Accounts            | `Save`                           | EN                         |
| Accounts            | `Edit`                           | EN                         |
| Accounts            | `Delete`                         | EN                         |
| Accounts            | `Loading`                        | EN                         |
| Accounts            | `Account name`                   | EN                         |
| Accounts            | `Currency`                       | EN                         |
| Accounts            | `Casa`                           | EN                         |
| Accounts            | `Archived`                       | EN                         |
| Accounts            | `Last activity`                  | EN                         |
| Transactions        | `New transaction`                | EN                         |
| Transactions        | `Date`                           | EN                         |
| Transactions        | `Account`                        | EN                         |
| Transactions        | `Direction`                      | EN                         |
| Transactions        | `Income` / `Expense` (Badge)     | EN                         |
| Transactions        | `Native amount`                  | EN                         |
| Transactions        | `Converted amount`               | EN                         |
| Transactions        | `Rate as of`                     | EN                         |
| Transactions        | `Memo`                           | EN                         |
| Transactions        | `Category`                       | EN                         |
| Transactions        | `Delete transaction?`            | EN                         |
| Transactions        | `This action cannot be undone`   | EN                         |
| Boundaries de error | `Algo salió mal`                 | ES (root) / EN (segmentos) |
| Boundaries de error | `Reintentar` / `Retry`           | ES / EN                    |

El inventario es la semilla para el message catalog del
cambio follow-up `ui-i18n`. La UI de producción de v1
hard-codifica los strings; un cambio `ui-i18n` futuro los
extrae a un catalog con `react-intl` (o similar) en runtime.

---

## 13. Estrategia de tests

La estrategia de tests es el **ciclo de TDD estricto**
(RED → GREEN → TRIANGULATE → REFACTOR) según
`openspec/config.yaml:27-30`. El runner es `pnpm test`.
Cada slice sigue el plan de TDD per-slice codificado en §14
abajo.

### 13.1 Capas de tests

| Capa                  | Qué se testea                                                               | Tipo de test                                                |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Unit de primitive     | Render de cada primitive (primary, loading/disabled, empty state)           | Vitest + Testing Library + snapshot                         |
| A11y de primitive     | Contrato a11y de cada primitive (focus ring, atributos `aria-*`)            | Vitest + Testing Library (aserción)                         |
| Integración de página | Render de cada página con datos seeded (empty, populated, error states)     | Vitest + Testing Library + snapshot                         |
| Integración de form   | Flujo de submit de cada form (success, error, loading state)                | Vitest + Testing Library + user-event                       |
| Integración axe-core  | Accesibilidad de cada página (cero violaciones critical + serious)          | Vitest + `vitest-axe`                                       |
| Snapshot visual       | Cada primitive presentacional (Card, Badge, EmptyState, etc.)               | Vitest snapshot                                             |
| E2E happy paths       | Tres flujos (record expense, archive account, navigate to detail)           | Playwright (si se agrega runner) o Vitest + Testing Library |
| Coverage gate         | ≥ 80% en `app/_ui/`, `app/accounts/`, `app/transactions/`, `app/dashboard/` | `pnpm test:coverage`                                        |

### 13.2 Coverage gate

El coverage gate es **≥ 80%** en cada carpeta afectada
(`app/_ui/`, `app/accounts/`, `app/transactions/`,
`app/dashboard/`, `app/_components/dashboard-*.tsx`). El
gate se enforce con `pnpm test:coverage:enforced` (el
script de coverage existente del proyecto).

El verify gate (slice 5) corre el check de coverage; un
slice que falla el gate bloquea el PR. Los gaps de
coverage se flagean con un marker TODO apuntando al branch
no cubierto (la convención existente del proyecto).

### 13.3 Tests de snapshot

Los tests de snapshot se usan para:

- Primitives presentacionales estáticos (`Card`, `Badge`,
  `EmptyState`, `Skeleton`, `Breadcrumb`, `Pagination`).
- Renders de página (los archivos `page.test.tsx`
  existentes se extienden; los archivos `page.seeded.test.tsx`
  existentes se extienden).
- Componentes de form (estado empty, populated, error,
  loading).

El drift de snapshot requiere el flag explícito `--update`.
El verify gate falla ante cualquier drift de snapshot no
flaggeado.

### 13.4 Tests de integración axe-core

Los tests de integración de axe-core viven en `tests/a11y/`.
Cada página se renderiza con datos seeded; la aserción es
`expect(await axe(container)).toHaveNoViolations()`. El
test falla en cualquier violación `critical` o `serious`.

### 13.5 Tests de snapshot visual

Los tests de snapshot visual viven en `tests/visual/`. Cada
primitive presentacional se renderiza en su empty state,
loading state, error state (cuando aplica), y populated
state. Los archivos de snapshot viven en
`tests/visual/__snapshots__/`.

### 13.6 E2E happy paths

Los E2E happy paths viven en `tests/e2e/` (se agregan si
hay un runner de Playwright; de lo contrario el smoke
queda como Vitest + Testing Library). Los tres flujos son:

1. Sign in → record a USD expense contra un ARS casa →
   verificar que el dashboard refleja el monto convertido.
2. Sign in → archive an account → verificar que desaparece
   de la lista activa y aparece detrás del toggle
   `Archived`.
3. Sign in → navegar a `/accounts/X` → verificar que el
   balance widget renderiza el monto convertido del casa.

---

## 14. Plan de slices con TDD per-task markers

El orquestador pre-cacheó `chainedPrStrategy: auto-forecast`
y `reviewBudgetLines: 400`. Cada slice DEBE ser un PR
auto-contenido con start, finish, verificación y rollback
claros. Las líneas de forecast son **líneas cambiadas
(adiciones + deletions)** por slice. El ciclo de TDD por
task es **RED → GREEN → TRIANGULATE → REFACTOR**.

### 14.1 Slice 1 — `ui-primitives`

| Campo                  | Valor                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                 | `feat/ui-primitives`                                                                                                                                |
| Alcance                | `app/_ui/` (tokens.css + primitives/ + layout/) + tests co-localizados + import en `app/globals.css`                                                |
| Archivos (nuevos)      | `app/_ui/tokens.css`, `app/_ui/index.ts`, `app/_ui/README.md`, los 18 primitives + sus tests, los 5 primitives de layout + tests                    |
| Archivos (modificados) | `app/globals.css` (agrega `@import './_ui/tokens.css'`)                                                                                             |
| LoC low                | 380                                                                                                                                                 |
| LoC high               | 480                                                                                                                                                 |
| Verification gate      | `pnpm test app/_ui` exits 0; coverage ≥ 80% en `app/_ui/`; snapshots estables; sin dep nueva (`pnpm-lock.yaml` sin cambios); cero variantes `dark:` |
| Rollback               | `git revert <merge-sha>`; la carpeta `app/_ui/` queda sin uso hasta el slice 2; sin breaking change en las páginas smoke                            |
| Follow-up              | El slice 2 (`accounts-ui`) consume los primitives; sin dependencia externa del slice 1 post-merge                                                   |

**Plan de commits** (atómico, convencional; mirror del patrón
work-unit-commits):

1. `feat(ui-primitives): tokens.css with light + dark CSS scope`
   — agrega la tabla de tokens en `app/_ui/tokens.css`
   (≤ 60 líneas).
2. `feat(ui-primitives): globals.css imports tokens.css`
   — agrega la directiva `@import`.
3. `test(ui-primitives): Button renders primary variant RED`
   — escribe el primer test fallido para el design-system.
4. `feat(ui-primitives): Button primitive + test` (GREEN).
5. `feat(ui-primitives): Input primitive + test`
6. `feat(ui-primitives): Textarea primitive + test`
7. `feat(ui-primitives): Select primitive + test`
8. `feat(ui-primitives): Checkbox primitive + test`
9. `feat(ui-primitives): RadioGroup primitive + test`
10. `test(ui-primitives): Combobox Client Component RED`
    — primer test fallido para el Client Component.
11. `feat(ui-primitives): Combobox primitive + test` (GREEN).
12. `feat(ui-primitives): FieldError primitive + test`
13. `feat(ui-primitives): FormField primitive + test`
    — compone Label + control + FieldError.
14. `feat(ui-primitives): Card + CardHeader + CardBody + CardFooter primitives + test`
    — patrón de compound component.
15. `feat(ui-primitives): Table + TableHeader + TableBody + TableRow + TableCell primitives + test`
    — patrón de compound component con `caption`, `scope`, `aria-sort`.
16. `feat(ui-primitives): Badge primitive + test`
17. `feat(ui-primitives): EmptyState primitive + test`
18. `feat(ui-primitives): Spinner primitive + test`
19. `feat(ui-primitives): Skeleton primitive + test`
20. `feat(ui-primitives): Pagination primitive + test`
21. `test(ui-primitives): Dialog Client Component RED`
22. `feat(ui-primitives): Dialog primitive + test` (GREEN).
23. `feat(ui-primitives): Breadcrumb primitive + test`
24. `feat(ui-primitives): Link primitive + test`
25. `feat(ui-primitives): PageHeader + PageContainer + BreadcrumbBar layout primitives + test`
26. `feat(ui-primitives): README.md internal overview`
27. `docs(ui-primitives): design + Spanish mirror` — ya enviado
    en esta design phase; sin commit necesario.

**Ciclo de TDD para el commit #3** (el primer test de
primitive). Ver §15.1 abajo.

### 14.2 Slice 2 — `accounts-ui`

| Campo                  | Valor                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                 | `feat/ui-accounts`                                                                                                                                                                                                                      |
| Alcance                | `app/accounts/{page.tsx, [id]/page.tsx, new/page.tsx}` + `app/accounts/error.tsx` + `app/accounts/accounts-list-table.tsx` + `app/accounts/[id]/account-detail.tsx` + `app/accounts/new/create-account-form.tsx` + tests co-localizados |
| Archivos (modificados) | Todas las pages y componentes en `app/accounts/**`                                                                                                                                                                                      |
| Archivos (nuevos)      | `app/accounts/error.tsx`, tests extendidos                                                                                                                                                                                              |
| LoC low                | 240                                                                                                                                                                                                                                     |
| LoC high               | 360                                                                                                                                                                                                                                     |
| Verification gate      | `pnpm test app/accounts` exits 0; coverage ≥ 80% en `app/accounts/`; axe-core cero violaciones critical + serious; keyboard + screen-reader manual pass documentado en el QA checklist                                                  |
| Rollback               | `git revert <merge-sha>`; los renders de producción vuelven a las páginas smoke (el marker `// smoke-minimal, not production` a nivel de archivo se preserva en el historial de git)                                                    |
| Follow-up              | El slice 3 (`transactions-ui`) consume los mismos primitives; sin dependencia externa del slice 2 post-merge                                                                                                                            |

**Plan de commits**:

1. `feat(ui-accounts): error.tsx segment boundary + test`
2. `test(ui-accounts): accounts-list-table sort + archived toggle RED`
3. `feat(ui-accounts): accounts-list-table production render` (GREEN)
4. `test(ui-accounts): account-detail Card layout RED`
5. `feat(ui-accounts): account-detail production render` (GREEN)
6. `test(ui-accounts): create-account-form inline validation RED`
7. `feat(ui-accounts): create-account-form production form` (GREEN)
8. `feat(ui-accounts): accounts/page.tsx production render`
9. `feat(ui-accounts): accounts/[id]/page.tsx production render`
10. `feat(ui-accounts): accounts/new/page.tsx production render`
11. `docs(ui-accounts): design + Spanish mirror` — ya enviado.

**Ciclo de TDD para el commit #2** (el sort del
accounts-list-table). Ver §15.2 abajo.

### 14.3 Slice 3 — `transactions-ui`

| Campo                  | Valor                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                 | `feat/ui-transactions`                                                                                                                                                                                                                                                       |
| Alcance                | `app/transactions/{page.tsx, [id]/page.tsx, new/page.tsx}` + `app/transactions/error.tsx` + `app/transactions/[id]/transaction-detail-forms.tsx` + `app/transactions/new/create-transaction-form.tsx` + `app/_components/transactions-list-table.tsx` + tests co-localizados |
| Archivos (modificados) | Todas las pages y componentes en `app/transactions/**`                                                                                                                                                                                                                       |
| Archivos (nuevos)      | `app/transactions/error.tsx`, `app/transactions/[id]/transaction-detail-forms.test.tsx`, `app/_components/transactions-list-table.test.tsx`                                                                                                                                  |
| LoC low                | 320                                                                                                                                                                                                                                                                          |
| LoC high               | 460                                                                                                                                                                                                                                                                          |
| Verification gate      | `pnpm test app/transactions app/_components` exits 0; coverage ≥ 80% en `app/transactions/`; axe-core cero critical + serious; FX snapshot sin cambios en edit de memo-only (verificado por test de integración)                                                             |
| Rollback               | `git revert <merge-sha>`; los renders de producción vuelven a las páginas smoke                                                                                                                                                                                              |
| Follow-up              | El slice 4 (`dashboard-ui-refactor`) consume los mismos primitives + el nuevo Combobox para el form                                                                                                                                                                          |

**Plan de commits**:

1. `feat(ui-transactions): error.tsx segment boundary + test`
2. `test(ui-transactions): transactions-list-table sort + pagination RED`
3. `feat(ui-transactions): transactions-list-table production render` (GREEN)
4. `test(ui-transactions): transaction-detail-forms Card layout + Dialog RED`
5. `feat(ui-transactions): transaction-detail-forms production render` (GREEN)
6. `test(ui-transactions): create-transaction-form Combobox + inline validation RED`
7. `feat(ui-transactions): create-transaction-form production form` (GREEN)
8. `feat(ui-transactions): transactions/page.tsx production render`
9. `feat(ui-transactions): transactions/[id]/page.tsx production render`
10. `feat(ui-transactions): transactions/new/page.tsx production render`
11. `docs(ui-transactions): design + Spanish mirror` — ya enviado.

**Ciclo de TDD para el commit #2** (sort + pagination del
transactions-list-table). Ver §15.3 abajo.

### 14.4 Slice 4 — `dashboard-ui-refactor`

| Campo                  | Valor                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                 | `feat/ui-dashboard-refactor`                                                                                                                                                                                                                                                                                                        |
| Alcance                | `app/dashboard/page.tsx` + `app/dashboard/error.tsx` + `app/_components/dashboard-account-picker.tsx` + `app/_components/dashboard-month-switcher.tsx` + `app/_components/dashboard-monthly-summary.tsx` + `app/_components/dashboard-category-breakdown.tsx` + `app/_components/dashboard-account-flow.tsx` + tests co-localizados |
| Archivos (modificados) | Todas las pages y componentes del dashboard                                                                                                                                                                                                                                                                                         |
| Archivos (nuevos)      | `app/dashboard/error.tsx`, `app/_components/dashboard-account-picker.tsx` (+ test), `app/_components/dashboard-month-switcher.tsx` (+ test)                                                                                                                                                                                         |
| LoC low                | 220                                                                                                                                                                                                                                                                                                                                 |
| LoC high               | 340                                                                                                                                                                                                                                                                                                                                 |
| Verification gate      | `pnpm test app/dashboard app/_components` exits 0; coverage ≥ 80% en `app/dashboard/` y `app/_components/`; empty-state + account-picker + month-switcher verificados por tests de integración                                                                                                                                      |
| Rollback               | `git revert <merge-sha>`; la ruta del dashboard vuelve al render smoke                                                                                                                                                                                                                                                              |
| Follow-up              | El slice 5 (`integration-tests`) agrega axe-core + visual snapshot + tests e2e                                                                                                                                                                                                                                                      |

**Plan de commits**:

1. `feat(ui-dashboard-refactor): error.tsx segment boundary + test`
2. `test(ui-dashboard-refactor): dashboard-account-picker Client Component RED`
3. `feat(ui-dashboard-refactor): dashboard-account-picker` (GREEN)
4. `test(ui-dashboard-refactor): dashboard-month-switcher Client Component RED`
5. `feat(ui-dashboard-refactor): dashboard-month-switcher` (GREEN)
6. `test(ui-dashboard-refactor): dashboard page with ?accountId RED`
7. `feat(ui-dashboard-refactor): dashboard-monthly-summary Card render` (GREEN)
8. `feat(ui-dashboard-refactor): dashboard-category-breakdown Card render`
9. `feat(ui-dashboard-refactor): dashboard-account-flow Card render`
10. `feat(ui-dashboard-refactor): dashboard/page.tsx with ?accountId + ?month searchParams`
11. `docs(ui-dashboard-refactor): design + Spanish mirror` — ya enviado.

**Ciclo de TDD para el commit #2** (el Client Component
dashboard-account-picker). Ver §15.4 abajo.

### 14.5 Slice 5 — `integration-tests`

| Campo             | Valor                                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `feat/ui-integration-tests`                                                                                                                                                                                                                                                                                     |
| Alcance           | `tests/a11y/` + `tests/visual/` + `tests/e2e/` (si se agrega runner de Playwright)                                                                                                                                                                                                                              |
| Archivos (nuevos) | `tests/a11y/{accounts,transactions,dashboard}.test.tsx`, `tests/visual/{card,badge,empty-state,skeleton,breadcrumb,pagination,dialog,combobox,button,input,select,textarea,field-error}.test.tsx`, `tests/e2e/{record-expense,archive-account,navigate-to-detail}.test.tsx` (o `.test.ts` si no hay Playwright) |
| LoC low           | 200                                                                                                                                                                                                                                                                                                             |
| LoC high          | 320                                                                                                                                                                                                                                                                                                             |
| Verification gate | `pnpm test tests/a11y tests/visual` exits 0; axe-core cero critical + serious; visual snapshots estables; e2e happy paths verdes (si se agregó runner de Playwright)                                                                                                                                            |
| Rollback          | `git revert <merge-sha>`; los tests per-primitive + per-page existentes permanecen; la nueva suite de integración es aditiva                                                                                                                                                                                    |
| Follow-up         | El slice 6 (`docs-and-perf`) agrega la referencia del design-system + el checklist de QA + la verificación del budget de perf                                                                                                                                                                                   |

**Plan de commits**:

1. `test(integration-tests): axe-core suite scaffold`
2. `test(integration-tests): accounts page axe-core RED`
3. `feat(integration-tests): accounts page axe-core green` (GREEN)
4. `feat(integration-tests): transactions page axe-core green`
5. `feat(integration-tests): dashboard page axe-core green`
6. `test(integration-tests): visual snapshot scaffold`
7. `feat(integration-tests): card visual snapshot`
8. `feat(integration-tests): badge visual snapshot`
9. `feat(integration-tests): empty-state visual snapshot`
10. `feat(integration-tests): skeleton visual snapshot`
11. `feat(integration-tests): breadcrumb visual snapshot`
12. `feat(integration-tests): pagination visual snapshot`
13. `feat(integration-tests): dialog visual snapshot`
14. `feat(integration-tests): combobox visual snapshot`
15. `feat(integration-tests): button visual snapshot`
16. `feat(integration-tests): input visual snapshot`
17. `feat(integration-tests): select visual snapshot`
18. `feat(integration-tests): textarea visual snapshot`
19. `feat(integration-tests): field-error visual snapshot`
20. `test(integration-tests): e2e happy paths (record expense) RED`
21. `feat(integration-tests): e2e happy paths (record expense)` (GREEN)
22. `feat(integration-tests): e2e happy paths (archive account)`
23. `feat(integration-tests): e2e happy paths (navigate to detail)`

### 14.6 Slice 6 — `docs-and-perf`

| Campo                  | Valor                                                                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                 | `feat/ui-docs-and-perf`                                                                                                                                                                                                                                                                      |
| Alcance                | `docs/architecture/ui.md` + `docs/qa/transactions-ui.md` + `docs/perf/transactions-ui.md` + mirrors ES en `Documents-es/docs/{architecture,qa,perf}/` + `CHANGELOG.md` + `openspec/specs/ui/spec.md` (creada por `sdd-archive`) + `openspec/specs/transactions/spec.md` (REQ-TX-15 REPLACED) |
| Archivos (nuevos)      | `docs/architecture/ui.md` (+ mirror ES), `docs/qa/transactions-ui.md` (+ mirror ES), `docs/perf/transactions-ui.md` (+ mirror ES)                                                                                                                                                            |
| Archivos (modificados) | `CHANGELOG.md` (`## [Unreleased]` → sección Added); `openspec/specs/ui/spec.md` (creada); `openspec/specs/transactions/spec.md` (REQ-TX-15 reemplazada)                                                                                                                                      |
| LoC low                | 160                                                                                                                                                                                                                                                                                          |
| LoC high               | 260                                                                                                                                                                                                                                                                                          |
| Verification gate      | Existen `docs/architecture/ui.md` + `docs/qa/transactions-ui.md` + `docs/perf/transactions-ui.md`; Lighthouse p95 < 2s en `/`, `/dashboard`, `/transactions`; `CHANGELOG.md` `## [Unreleased]` está al día; `sdd-archive` promueve las specs delta a canónicas                               |
| Rollback               | `git revert <merge-sha>`; los artefactos de docs + perf son aditivos; no se revierte código de producción                                                                                                                                                                                    |
| Follow-up              | `sdd-archive` eleva las specs delta a canónicas; release flow (develop → main) según root `AGENTS.md` §5.5                                                                                                                                                                                   |

**Plan de commits**:

1. `docs(docs-and-perf): docs/architecture/ui.md design-system reference`
2. `docs(docs-and-perf): Documents-es/docs/architecture/ui.md mirror`
3. `docs(docs-and-perf): docs/qa/transactions-ui.md manual QA checklist`
4. `docs(docs-and-perf): Documents-es/docs/qa/transactions-ui.md mirror`
5. `docs(docs-and-perf): docs/perf/transactions-ui.md Lighthouse output`
6. `docs(docs-and-perf): Documents-es/docs/perf/transactions-ui.md mirror`
7. `docs(docs-and-perf): CHANGELOG.md [Unreleased] section`
8. `feat(docs-and-perf): sdd-archive promotes ui spec to canonical`
9. `feat(docs-and-perf): sdd-archive replaces REQ-TX-15 with ui reference`

---

## 15. Plan de TDD por slice — RED → GREEN → TRIANGULATE → REFACTOR

TDD estricto según `openspec/config.yaml:27-30`. El primer
commit test-driven de cada slice sigue el ciclo de abajo.
Los TDD markers son los sub-headers de sub-sección por task
en el plan de commits del slice (§14).

### 15.1 Slice 1 — primitive `Button`

**RED.** Escribir el test fallido primero:

```typescript
// app/_ui/primitives/button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders a primary button with the children text', () => {
    render(<Button variant="primary">Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-ui-accent');
    expect(button).toHaveClass('text-ui-accent-fg');
  });
});
```

El test falla porque `Button` no existe todavía.

**GREEN.** Implementar el mínimo:

```tsx
// app/_ui/primitives/button.tsx
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './_shared/cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  isLoading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-ui-accent text-ui-accent-fg hover:bg-ui-accent/90',
  secondary: 'bg-ui-bg-muted text-ui-fg hover:bg-ui-bg-subtle border border-ui-border',
  ghost: 'bg-transparent text-ui-fg hover:bg-ui-bg-muted',
  danger: 'bg-ui-danger text-ui-danger-fg hover:bg-ui-danger/90',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      isLoading,
      iconLeft,
      iconRight,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? 'true' : undefined}
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-ui-md px-4 py-2 ui-font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {isLoading && <Spinner aria-label="Loading" size="sm" />}
        {!isLoading && iconLeft}
        {children}
        {!isLoading && iconRight}
      </button>
    );
  },
);
Button.displayName = 'Button';
```

**TRIANGULATE.** Agregar tests para:

- La variante secondary renderiza `bg-ui-bg-muted`.
- La variante ghost renderiza `bg-transparent`.
- La variante danger renderiza `bg-ui-danger`.
- El estado de carga renderiza `Spinner` + `disabled` +
  `aria-busy="true"`.
- El estado disabled renderiza `disabled` (sin loading
  state).
- El `className` custom se appendea.

**REFACTOR.** Extraer el variant class map a una constante;
extraer el markup del loading state a un helper. Re-correr
los tests; todos verdes.

### 15.2 Slice 2 — `accounts-list-table` sort + archived toggle

**RED.** Escribir el test fallido primero:

```typescript
// app/accounts/accounts-list-table.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountsListTable } from './accounts-list-table';

describe('AccountsListTable', () => {
  it('renders one row per account sorted by name ascending by default', () => {
    const accounts = [
      { id: 'a', name: 'Banana', currency: 'ARS', casa: 'oficial', archivedAt: null, lastActivityAt: null },
      { id: 'b', name: 'Apple', currency: 'USD', casa: 'oficial', archivedAt: null, lastActivityAt: null },
    ];
    render(<AccountsListTable accounts={accounts} />);
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('Apple')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Banana')).toBeInTheDocument();
  });
});
```

El test falla porque la versión de producción de
`AccountsListTable` no existe todavía (la versión smoke es un
`<table>` escrito a mano sin sort).

**GREEN.** Implementar el mínimo:

```tsx
// app/accounts/accounts-list-table.tsx
'use client'; // Requerido para el sort handler + estado del archived toggle

import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableCell, Badge } from '../_ui/primitives/table';
import type { FinancialAccountWire } from '../_lib/account-types';

interface AccountsListTableProps {
  accounts: readonly FinancialAccountWire[];
}

type SortKey = 'name' | 'currency' | 'lastActivityAt';

export function AccountsListTable({ accounts }: AccountsListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = showArchived ? accounts : accounts.filter((a) => a.archivedAt === null);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  return (
    <Table caption="Accounts list" hideCaption>
      <TableHeader
        columns={[
          {
            key: 'name',
            label: 'Name',
            sortable: true,
            sortDirection:
              sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
            onSort: () => {
              setSortKey('name');
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            },
          },
          {
            key: 'currency',
            label: 'Currency',
            sortable: true,
            sortDirection:
              sortKey === 'currency' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
            onSort: () => {
              setSortKey('currency');
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            },
          },
          {
            key: 'lastActivityAt',
            label: 'Last activity',
            sortable: true,
            sortDirection:
              sortKey === 'lastActivityAt'
                ? sortDir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none',
            onSort: () => {
              setSortKey('lastActivityAt');
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            },
          },
          { key: 'archived', label: 'Archived' },
        ]}
      />
      <TableBody>
        {sorted.map((account) => (
          <TableRow key={account.id}>
            <TableCell>{account.name}</TableCell>
            <TableCell>{account.currency}</TableCell>
            <TableCell>
              {account.lastActivityAt ? new Date(account.lastActivityAt).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell>
              {account.archivedAt !== null && <Badge variant="neutral">Archived</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**TRIANGULATE.** Agregar tests para:

- Toggle de `Show archived` revela accounts archivados.
- Click en el sort header `Name` revierte el sort.
- Click en el sort header `Last activity` ordena por
  `lastActivityAt`.
- Lista vacía renderiza `EmptyState`.
- La columna `Last activity` muestra `—` cuando
  `lastActivityAt` es `null`.

**REFACTOR.** Extraer el comparador de sort a un helper;
extraer el toggle a un sibling `<label>` + `<input
type="checkbox">`. Re-correr los tests; todos verdes.

### 15.3 Slice 3 — `transactions-list-table` sort + pagination

**RED.** Escribir el test fallido primero:

```typescript
// app/_components/transactions-list-table.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TransactionsListTable } from './transactions-list-table';

describe('TransactionsListTable', () => {
  it('renders one row per transaction sorted by transactionDate descending by default', () => {
    const transactions = [
      { id: 'a', direction: 'EXPENSE', amountMinor: 1000, currency: 'ARS', transactionDate: '2026-06-10T00:00:00Z', accountName: 'Main ARS' },
      { id: 'b', direction: 'INCOME', amountMinor: 5000, currency: 'USD', transactionDate: '2026-06-15T00:00:00Z', accountName: 'Main USD' },
    ];
    render(<TransactionsListTable transactions={transactions} />);
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('2026-06-15')).toBeInTheDocument();
    expect(within(rows[2]).getByText('2026-06-10')).toBeInTheDocument();
  });
});
```

El test falla porque la versión de producción de
`TransactionsListTable` no existe todavía (la versión smoke
es un `<table>` escrito a mano sin sort).

**GREEN.** Implementar el mínimo:

```tsx
// app/_components/transactions-list-table.tsx
'use client';

import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableCell, Badge } from '../_ui/primitives/table';
import type { TransactionDTO } from '../_lib/transaction-types';

interface TransactionsListTableProps {
  transactions: readonly TransactionDTO[];
}

type SortKey = 'transactionDate' | 'amountMinor' | 'convertedAmountMinor';

export function TransactionsListTable({ transactions }: TransactionsListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('transactionDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...transactions].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // ... render the table with the sorted rows + sortable headers
}
```

**TRIANGULATE.** Agregar tests para:

- Click en el sort header `Date` revierte el sort.
- Click en el sort header `Native amount` ordena
  numéricamente.
- Los badges de dirección renderizan `INCOME` como
  `success` y `EXPENSE` como `danger`.
- `accountName` se renderiza cuando se usa
  `?include=accountName` (los datos del row cargan el
  campo).
- Pagination renderiza links `Previous page` / `Next page`
  cuando se provee `nextCursor`.

**REFACTOR.** Extraer el comparador de sort; extraer el
lookup de variant del badge de dirección a una constante.
Re-correr los tests; todos verdes.

### 15.4 Slice 4 — Client Component `DashboardAccountPicker`

**RED.** Escribir el test fallido primero:

```typescript
// app/_components/dashboard-account-picker.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardAccountPicker } from './dashboard-account-picker';

describe('DashboardAccountPicker', () => {
  it('renders a link per account with the account name', () => {
    const accounts = [
      { id: 'a', name: 'Main ARS' },
      { id: 'b', name: 'Main USD' },
    ];
    render(<DashboardAccountPicker accounts={accounts} currentAccountId={null} />);
    expect(screen.getByRole('link', { name: 'Main ARS' })).toHaveAttribute('href', '/dashboard?accountId=a');
    expect(screen.getByRole('link', { name: 'Main USD' })).toHaveAttribute('href', '/dashboard?accountId=b');
  });
});
```

El test falla porque `DashboardAccountPicker` no existe
todavía (el dashboard smoke no tiene account picker).

**GREEN.** Implementar el mínimo:

```tsx
// app/_components/dashboard-account-picker.tsx
'use client';

import Link from 'next/link';
import type { FinancialAccountWire } from '../_lib/account-types';

interface DashboardAccountPickerProps {
  accounts: readonly Pick<FinancialAccountWire, 'id' | 'name'>[];
  currentAccountId: string | null;
}

export function DashboardAccountPicker({
  accounts,
  currentAccountId,
}: DashboardAccountPickerProps) {
  return (
    <nav aria-label="Account picker" className="flex gap-2">
      {accounts.map((account) => (
        <Link
          key={account.id}
          href={`/dashboard?accountId=${account.id}`}
          aria-current={currentAccountId === account.id ? 'page' : undefined}
          className="rounded-ui-md px-3 py-1 ui-font-medium hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent"
        >
          {account.name}
        </Link>
      ))}
    </nav>
  );
}
```

**TRIANGULATE.** Agregar tests para:

- `aria-current="page"` se setea en el account actualmente
  seleccionado.
- Lista de accounts vacía no renderiza nada (sin nav).
- El picker es navegable por teclado (Tab + Enter activa el
  link).

**REFACTOR.** Sin refactor necesario para v1; el picker es
un thin wrapper de `<Link>`.

---

## 16. Riesgos y desviaciones

El cambio acarrea seis riesgos conocidos y tres
desviaciones de la spec que el cache del orquestador bakeó.
Cada uno se documenta con una mitigación; ninguno es un
anti-pattern §10.3.

### 16.1 Fragmentación de la tabla de tokens

**Riesgo.** La tabla de tokens en `app/_ui/tokens.css` se
fragmenta a través de los seis slices a medida que se agregan
nuevos primitives, rompiendo la afirmación de que la tabla
de tokens es la fuente única de styling.

**Mitigación.** El slice 1 (`ui-primitives`) es el ÚNICO slice
que toca `app/_ui/`. Los slices 2-5 importan de los
primitives; NO extienden la tabla de tokens ni duplican
primitives. El verify gate asegura que cada primitive usado
por la UI de producción esté declarado en `app/_ui/` (el
slice 6 documenta el inventario en
`docs/architecture/ui.md`).

**Probabilidad.** Media. **Severidad.** Media.

### 16.2 Regresión de sort + cursor pagination

**Riesgo.** El nuevo sort + cursor pagination en
`/api/transactions` regresa el contrato de API existente.

**Mitigación.** El sort es un concern puramente client-side
sobre la página `GET /api/transactions` existente; el
contrato de API no cambia (el `include=accountName` de
REQ-UI-2 es aditivo). El cursor es el campo `nextCursor`
existente. El verify gate re-corre el flujo smoke contra la
UI nueva (E2E happy path #1 del slice 5).

**Probabilidad.** Baja. **Severidad.** Alta (correctitud de
datos).

### 16.3 Combobox hand-built vs. librería

**Riesgo.** El primitive `Combobox` hand-built sobre
`<select>` + `<input>` resulta limitante para la selección
de account en el create-transaction form (búsqueda por
nombre, navegación por teclado, soporte de screen reader).

**Mitigación.** La propuesta §"Alternatives considered" item
2 eligió explícitamente hand-built sobre Radix / downshift
para v1. La superficie de v1 es mínima (selección de account
solo en el create-transaction form). Un cambio futuro
`ui-complex-widgets` introduce un primitive de combobox
vetted (Radix es el primer candidato). El verify gate asegura
que el combobox de v1 pasa axe-core con cero violaciones
critical + serious.

**Probabilidad.** Baja. **Severidad.** Baja.

### 16.4 axe-core flagea una violación que la página smoke no tenía

**Riesgo.** La suite axe-core (slice 5) flagea una violación
que las páginas smoke no tenían (el `<table>` + `<form>` de
las páginas smoke puede no haber sido auditado con axe-core).

**Mitigación.** El verify gate se setea en `critical` +
`serious` cero. `moderate` + `minor` se loggean pero no son
bloqueantes; el usuario los triage. Un checklist
`docs/qa/transactions-ui.md` captura los ítems residuales
como backlog.

**Probabilidad.** Media. **Severidad.** Media.

### 16.5 p95 < 2s no cumplido en el dashboard

**Riesgo.** Los tres fetches paralelos del dashboard
(`/api/reports/monthly`, `/api/reports/breakdown`,
`/api/reports/accounts/:id/flow`) revientan el budget p95
< 2s bajo 4G simulado + Moto G4.

**Mitigación.** Los tres fetches ya están paralelizados
(`Promise.all` existente en el dashboard). La página es un
Server Component; el fetch paralelo es del lado servidor, no
del cliente. El verify gate corre Lighthouse contra el build
de producción; si el budget falla, el orquestador parte las
tres llamadas del dashboard en dos chunks (summary +
breakdown; flow on demand) sin romper el contrato de UI.

**Probabilidad.** Media. **Severidad.** Media.

### 16.6 El owner del QA manual es el usuario

**Riesgo.** El checklist de QA manual propiedad del usuario
en `docs/qa/transactions-ui.md` no se firma a tiempo para el
verify gate.

**Mitigación.** La propuesta §"Open questions" Q4 lockea
explícitamente el owner del QA manual como el usuario; el
verify gate falla hasta que se firme el checklist
(REQ-UI-11). El checklist se estructura para ser runnable en
30-45 minutos (según el outline de
`docs/qa/transactions-ui.md`). El PR del slice 6 incluye
una sección de sign-off placeholder para que el usuario la
llene.

**Probabilidad.** Media. **Severidad.** Baja (el verify gate
falla hasta que el usuario firma; el PR es el gate).

### 16.7 BRs llevados por referencia (desviación de la spec)

**Desviación.** La spec codifica BR-UI-1 a BR-UI-9 como
nuevas business rules. El design lleva BR-TX-4, BR-ACC-12, y
BR-RPT-7 por **referencia** en lugar de inlinear su texto
(matcheando la convención del repo en
`openspec/changes/transactions/specs/transactions/spec.md`
§"Carried from other capabilities").

**Rationale.** Esto matchea la convención del repo. El
design lleva la misma convención en sus callouts de "BRs
llevados" (§4.4). Esta es una convención intencional, NO un
anti-pattern §10.3. Se flagea acá para que el reviewer no lo
flague como drift.

### 16.8 Dos query flags aditivos = dos nuevas queries server-side (desviación)

**Desviación.** La spec describe los dos query flags
aditivos (`include=lastActivity`, `include=accountName`)
como aditivos sobre los GET endpoints existentes. El design
introduce dos nuevas queries server-side (`loadLastActivityAt`
vía `prisma.transaction.groupBy`; `loadAccountNames` vía
`prisma.financialAccount.findMany`).

**Rationale.** El contrato de la spec "byte-identical sin el
flag" requiere que el handler NO ejecute la query nueva
cuando el flag está ausente (el verify gate asegura esto).
Las queries nuevas están acotadas por los índices existentes
(`@@index([userId, transactionDate])` en `Transaction`;
primary key en `FinancialAccount`). El budget de performance
está documentado en §10.

### 16.9 CardHeader renderiza `<h2>` por default (desviación)

**Desviación.** La propuesta §"Slice 1" item 2 describe
`Card` como un contenedor genérico. El design hace que
`CardHeader.title` renderice `<h2>` por default.

**Rationale.** El `<h1>` a nivel de página vive en
`PageHeader`; el `<h2>` a nivel de card vive en
`CardHeader`. La jerarquía semántica (`<h1>` título de
página → `<h2>` título de card) es el fit screaming-architecture.
Si un card necesita un `<h3>`, el caller pasa `as="h3"`
(única escape hatch de boolean-prop en los primitives del
design-system; todos los demás primitives usan composición
compuesta). El default `<h2>` de CardHeader está codificado
en §3.2.4 arriba.

### 16.10 Riesgo de TDD estricto (llevado del precedente)

**Riesgo.** El paso RED del TDD estricto es fácil de
saltarse bajo presión de tiempo. El riesgo es que la
implementación aterrice con un test non-red o con tests
escritos después del código.

**Mitigación.**

- `sdd-tasks` posee la estructura de tasks; las tasks
  documentan el test RED por commit antes de la
  implementación GREEN.
- `sdd-apply` enforce RED → GREEN → TRIANGULATE → REFACTOR
  por task según `openspec/config.yaml:27-30` y la
  referencia `~/.pi/agent/gentle-ai/support/strict-tdd.md`.
- El template de PR
  (`.github/pull_request_template.md`) requiere que el
  reviewer confirme que el commit RED aterrizó antes del
  commit GREEN.

---

## 17. Preguntas abiertas para el usuario

**Ninguna.** Las cuatro preguntas abiertas de la propuesta
(`openspec/changes/transactions-ui/proposal.md` §"Open
questions" Q1-Q4) están lockeadas en la sesión de pre-spec:

- Q1 (query flags aditivos, sin breaking change de backward
  compat) → codificado en REQ-UI-1 y REQ-UI-2.
- Q2 (Combobox hand-built, sin dep nueva) → codificado en
  §"Capability boundary" de la spec `ui`.
- Q3 (solo light theme, tokens dark declarados pero no
  usados) → codificado en REQ-UI-9.
- Q4 (owner del QA manual es el usuario) → codificado en
  REQ-UI-11.

Las tres correcciones del orquestador bakeadas en este
design son:

1. **Tokens dark declarados, theme light renderizado.** La
   tabla de tokens declara CSS custom properties de dark-mode
   bajo `[data-theme='dark']` pero la UI de producción de v1
   nunca setea ese atributo (REQ-UI-9, §3.1 arriba).
2. **Dos query flags aditivos = dos nuevas queries
   server-side.** Los flags son aditivos; las queries nuevas
   están acotadas por índices existentes (§6.3, §16.8 arriba).
3. **Cada Client Component es opt-in.** La directiva
   `'use client'` es explícita al tope de cada archivo de
   Client Component (Combobox, Dialog, el estado del
   submit-button adentro de los componentes de form, los
   componentes de estado de query-param del dashboard). El
   default es Server Component (§5 arriba).

Sin preguntas nuevas para el usuario. El design está listo
para `sdd-tasks`.

---

## 18. Referencias cruzadas

- **Propuesta**: `openspec/changes/transactions-ui/proposal.md`
  — el cambio upstream. BR-UI-1 a BR-UI-9, las cuatro
  preguntas abiertas lockeadas, el forecast de seis slices,
  las alternativas consideradas.
- **Spec (delta, ui)**:
  `openspec/changes/transactions-ui/specs/ui/spec.md` —
  REQ-UI-1 a REQ-UI-11; la spec de la capability `ui`
  promovida a canónica por `sdd-archive`.
- **Spec (delta, transactions)**:
  `openspec/changes/transactions-ui/specs/transactions/spec.md`
  — REQ-TX-15 REPLACED por referencia a `ui/spec.md`.
- **Spec (canónica, ui, post-archive)**:
  `openspec/specs/ui/spec.md` — promovida por `sdd-archive`
  (deliverable del slice 6).
- **Spec (canónica, transactions, post-archive)**:
  `openspec/specs/transactions/spec.md` — REQ-TX-15
  reemplazada por la referencia a `ui/spec.md`;
  `sdd-archive` eleva el delta.
- **Design de reports (precedente)**:
  `openspec/changes/archive/2026-06-27-reports/design.md` —
  template estructural para el artefacto de design; patrón
  de estructura del módulo; convención del composition-root;
  TDD markers por task.
- **Spec de transactions (BRs llevados)**:
  `openspec/specs/transactions/spec.md` — BR-TX-4 (userId
  scoping), BR-TX-7 (hard delete), REQ-TX-15 (reemplazada).
- **Spec de accounts (BRs llevados)**:
  `openspec/specs/accounts/spec.md` — BR-ACC-12
  (display-only FX), BR-ACC-14 a BR-ACC-19 (slice smoke).
- **Spec de reports (BRs llevados)**:
  `openspec/specs/reports/spec.md` — BR-RPT-7 (Server
  Component auth gate), los tres DTOs de reports.
- **Spec de FX (BRs llevados)**:
  `openspec/specs/fx/spec.md` — BR-FX-3 (casa resolution),
  BR-ACC-13 (stale FX).
- **Spec de auth (BR llevado)**:
  `openspec/specs/auth/spec.md` — invariante del helper
  `auth()` de Server Component, userId scoping, sin
  atribución de IA.
- **Envelope de error**:
  `src/shared/errors/app-error.ts` — la shape de wire que
  la UI surface (sin nuevos códigos de error; el enum
  existente cubre cada superficie).
- **Endpoints Hono (inputs estables)**:
  - `app/api/[...path]/route.ts:7-25` — el catch-all
    protegido que consumen el dashboard y las acciones de
    form.
  - Los dos query flags aditivos NO cambian la shape de la
    ruta de los endpoints; augmentan la shape del response
    aditivamente.
- **Composition root**: `src/composition/build-app-deps.ts`,
  `src/composition/create-hono-app.ts` — SIN CAMBIOS. La UI
  no modifica la composición de Hono.
- **Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono
  catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) +
  Zod + Vitest + Testing Library + pnpm + Tailwind v4.
- **Preflight**: interactive · `both` (Engram + OpenSpec
  files) · `auto-forecast` · review budget 400.
- **Strict TDD**: habilitado según
  `openspec/config.yaml:27-30`; runner `pnpm test`; ciclo
  RED → GREEN → TRIANGULATE → REFACTOR.
- **Autor / atribución**: `Sebastián Illa` según
  `openspec/AGENTS.md` §"Atribución de autor (metadata de
  docs)".
- **Precedentes llevados** (patrones de design, NO deps
  nuevas):
  - **Vercel composition patterns** — compound components
    sobre proliferación de boolean-prop (`Card`, `Table`,
    `FormField`).
  - **Tailwind v4 CSS-first config** — `@theme inline` +
    CSS custom properties para tokens; sin extensión de
    `tailwind.config.ts`.
  - **React 19 `useActionState`** — máquina de estados de
    submit para forms (built-in; sin dep nueva).

---

## 19. Tabla de forecast

El orquestador pre-cacheó `chainedPrStrategy: auto-forecast`
y `reviewBudgetLines: 400`. Por el guard §E review-workload,
cada slice DEBE ser un PR auto-contenido con start, finish,
verificación y rollback claros. Las líneas de forecast son
**líneas cambiadas (adiciones + deletions)** por slice.

| PR        | Slice                   | LoC low  | LoC high | Riesgo budget 400                 | Decisión necesaria antes de apply | PRs encadenados recomendados | Título de commit convencional (título de PR)                                             |
| --------- | ----------------------- | -------- | -------- | --------------------------------- | --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| #1        | `ui-primitives`         | 380      | 480      | Bajo por slice; Alto si colapsado | No                                | Sí (gatea slice 2)           | `feat(ui-primitives): tokens + 18 primitives + layout shell`                             |
| #2        | `accounts-ui`           | 240      | 360      | Bajo por slice; Alto si colapsado | No                                | Sí (gatea slice 3)           | `feat(ui-accounts): production renders for accounts pages`                               |
| #3        | `transactions-ui`       | 320      | 460      | Bajo por slice; Alto si colapsado | No                                | Sí (gatea slice 4)           | `feat(ui-transactions): production renders for transactions pages`                       |
| #4        | `dashboard-ui-refactor` | 220      | 340      | Bajo por slice; Alto si colapsado | No                                | Sí (gatea slice 5)           | `feat(ui-dashboard-refactor): production dashboard with account picker + month switcher` |
| #5        | `integration-tests`     | 200      | 320      | Bajo por slice; Alto si colapsado | No                                | Sí (gatea slice 6)           | `test(ui-integration-tests): axe-core + visual snapshots + e2e happy paths`              |
| #6        | `docs-and-perf`         | 160      | 260      | Bajo por slice; Alto si colapsado | No                                | Sí (final; gatea release)    | `docs(ui-docs-and-perf): design-system ref + QA checklist + perf budget + sdd-archive`   |
| **Total** | —                       | **1520** | **2220** | **Alto si colapsado**             | **No**                            | **Sí**                       | —                                                                                        |

**Líneas de veredicto:**

- **Decisión necesaria antes de apply: No.** Scope lockeado
  en pre-propose; las cuatro preguntas abiertas + los valores
  de preflight del orquestador son los inputs. Las tres
  correcciones del orquestador bakeadas en el design (tokens
  dark declarados, dos queries server-side nuevas, cada
  Client Component opt-in) son no-bloqueantes.
- **PRs encadenados recomendados: Sí.** Cada slice está
  sobre el budget de 400 líneas si se entrega como un solo
  PR; los budgets por slice están por debajo del límite. El
  cache `auto-forecast` del orquestador confirma
  force-chained.
- **Riesgo budget 400: Bajo por slice; Alto si colapsado.**
  El forecast total es 1520-2220 LoC en seis PRs; cada PR
  es 160-480 LoC (por debajo del budget de 400 para cinco
  de seis; el slice 1 está en el extremo alto de 480 y el
  slice 3 está en el extremo alto de 460 — ambos borderline
  pero dentro del rango aceptable del orquestador).
- **Títulos de PR por slice** están en formato conventional
  commit (tabla arriba). Los títulos matchean la convención
  de scope `feat(ui-*)` / `test(ui-*)` / `docs(ui-*)`; el
  tipo `feat(ui-*)` es el tipo convencional para "nueva
  superficie UI de producción".

---

## 20. Criterios de aceptación

El orquestador puede correr estos chequeos binarios después
de que `sdd-apply` complete:

1. `pnpm test app/_ui/` exits 0 con **≥ 80% coverage en
   `app/_ui/`** (capa de primitives del design-system).
2. `pnpm test app/accounts/` exits 0 con **≥ 80% coverage
   en `app/accounts/`** (capa UI de accounts).
3. `pnpm test app/transactions/` exits 0 con **≥ 80%
   coverage en `app/transactions/`** (capa UI de
   transactions).
4. `pnpm test app/dashboard/` + `pnpm test app/_components/`
   exit 0 con **≥ 80% coverage en `app/dashboard/` +
   `app/_components/`** (capa UI de dashboard).
5. `pnpm typecheck` exits 0 (TypeScript strict mode, sin
   `any`). El flag `strict: true` del compiler queda sin
   cambios.
6. `pnpm lint` pasa con cero warnings en el código nuevo.
7. `pnpm build` pasa con cero errores de TypeScript.
8. `pnpm test:coverage:enforced` reporta ≥ 80% en cada
   carpeta afectada (`app/_ui/`, `app/accounts/`,
   `app/transactions/`, `app/dashboard/`,
   `app/_components/`).
9. `pnpm dev` → sign in → visitar `/transactions` con 3 ARS
   - 2 USD transactions en 2 accounts. La página renderiza
     una tabla sortable y paginada con badges de dirección.
     Click en el header `Date` → las rows re-ordenan. Click
     `Next page` → el cursor avanza.
10. Visitar `/transactions/new` sin accounts. El Combobox
    renderiza un empty state `No accounts available`. Crear
    una cuenta primero → volver → el Combobox está poblado.
11. Submitir el form de create con `amountMinor = 0`. El
    error inline aparece junto al field de amount con el
    mensaje `INVALID_AMOUNT` de la API. El submit button
    queda disabled con `Spinner` + `aria-busy="true"`.
12. Visitar `/transactions/X` para una transacción USD
    contra un ARS casa. La row de card `Rate as of` renderiza
    el timestamp del snapshot como texto plano. El FX
    snapshot queda sin cambios cuando el usuario edita solo
    el memo.
13. Visitar `/dashboard` sin transactions. La ilustración de
    empty state + el CTA `Record your first transaction`
    renderizan. Click en el CTA → `/transactions/new` carga.
14. Visitar `/dashboard` con transactions. Elegir un account
    del `DashboardAccountPicker` → la flow card muestra el
    flujo diario por-account. Cambiar el mes vía el
    `DashboardMonthSwitcher` → el summary + breakdown
    actualizan.
15. Visitar `/accounts` → toggle `Show archived` → los
    accounts archivados aparecen con un badge. Toggle off →
    solo los accounts activos renderizan. La columna `Last
activity` muestra la fecha de la transacción más reciente
    (o `—` cuando no hay transactions).
16. **Keyboard nav**: tabular por `/transactions`
    end-to-end. Cada elemento interactivo es alcanzable; el
    foco es visible en cada elemento; `Enter` activa los
    sort headers; `Escape` cierra el dialog de confirm de
    delete.
17. **Screen reader run-through** (VoiceOver en macOS): cada
    página anuncia el título de página, los headings, los
    labels de form field, y los mensajes de error inline.
18. **axe-core run** en cada página con datos seeded: cero
    violaciones `critical`; cero violaciones `serious`. El
    test de integración asegura esto y falla el build ante
    cualquier violación.
19. **Tests de snapshot** pasan para cada primitive
    presentacional en su estado primary. El drift de snapshot
    requiere el flag explícito `--update`.
20. **p95 page load < 2s** en `/`, `/dashboard`, y
    `/transactions` bajo 4G simulado + Moto G4 (Lighthouse
    CLI). El output se pega en `docs/perf/transactions-ui.md`.
21. **Checklist manual de QA** en
    `docs/qa/transactions-ui.md` está completo y firmado por
    el usuario durante el verify gate.
22. `openspec/specs/ui/spec.md` existe con REQ-UI-1 a
    REQ-UI-11 (11 Requirements) después de que corre
    `sdd-archive`. `openspec/specs/transactions/spec.md` carga
    el delta de REQ-TX-15 (REQ-TX-15 REPLACED).
23. `docs/architecture/ui.md` existe con la tabla de tokens +
    inventario de componentes (REQ-UI-10).
24. El mirror `./Documents-es/openspec/changes/transactions-ui/design.md`
    existe con estructura idéntica. Sin debris de
    Chinese-character según el check de mirror de root
    `AGENTS.md` §13.3. Sin formas de IA en los headers
    `**Author**:` / `**Autor**` (según `openspec/AGENTS.md`).
25. Sin drift de `pnpm-lock.yaml` después de que el cambio
    mergee (root `AGENTS.md` §5.3). El cambio envía cero
    nuevas top-level dependencies.
26. **Sin trailer `Co-authored-by`** en cualquier commit
    (root `AGENTS.md` §4.5). **Header de Autor** en cada doc
    nuevo es `Sebastián Illa` (sin formas de IA, según
    `openspec/AGENTS.md`).
27. `git grep -E '\bdark:' app/_ui/ app/accounts/
app/transactions/ app/dashboard/
'app/_components/dashboard-*.tsx'` devuelve cero matches
    (REQ-UI-9).
