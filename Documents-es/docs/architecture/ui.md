# Sistema de diseño — capability `ui`

**Autor**: Sebastián Illa
**Capability**: `ui`
**Cambio fuente**: `transactions-ui`
**Estado**: implementado · **Promovido**: 2026-06-29 (sdd-archive, slice 6 de `transactions-ui`)
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4

> Referencia canónica del sistema de diseño v1. Operationaliza
> REQ-UI-10 de `openspec/specs/ui/spec.md`. Este documento es la
> **referencia pública** (la versión interna para developers vive
> en `app/_ui/README.md` y es más corta; este archivo es el
> catálogo exhaustivo que enforce la verify gate).
>
> El sistema de diseño v1 está **construido a mano** sobre Tailwind
> v4 + React 19, **sin nuevas dependencias top-level** (sin shadcn,
> sin NextUI, sin MUI, sin Chakra, sin Radix en v1; ver
> `openspec/changes/transactions-ui/design.md` §"Decision: hand-built
> primitives"). Los primitives son funciones puras que consumen
> tokens de `app/_ui/tokens.css`.
>
> La composición es vía children + compound components, NO
> proliferación de boolean props (sin props `variant` / `size` / `as`
> en los primitives; ver `design.md` §"Decision: composition via
> children"). Las variantes viven en el `Button` o `Badge` interno
> cuando se necesitan.

---

## 1. Tabla de tokens

La tabla de tokens es la **única fuente de estilos**. Vive en
`app/_ui/tokens.css` y declara cada CSS custom property bajo
`@layer base`. Tailwind v4 las lee mediante la directiva
`@theme inline` en `app/globals.css` y las expone como utility
classes (`bg-ui-bg`, `text-ui-fg`, `rounded-ui-md`, etc.).

### 1.1 Tema claro (renderizado en v1)

| Grupo      | CSS custom property        | Valor                  | Utility class             | Rol semántico                                                       |
| ---------- | -------------------------- | ---------------------- | ------------------------- | ------------------------------------------------------------------- |
| Espaciado  | `--ui-space-1`             | `0.25rem` (4px)        | `p-ui-space-1`, `m-…`     | Gap mínimo (icono inline a label)                                   |
| Espaciado  | `--ui-space-2`             | `0.5rem`  (8px)        | `p-ui-space-2`, `m-…`     | Padding por defecto del control de formulario (vertical + horizontal) |
| Espaciado  | `--ui-space-3`             | `0.75rem` (12px)       | `p-ui-space-3`, `m-…`     | Padding de celdas / body de Card                                    |
| Espaciado  | `--ui-space-4`             | `1rem`    (16px)       | `p-ui-space-4`, `m-…`     | Padding horizontal del botón / body de Card                         |
| Espaciado  | `--ui-space-5`             | `1.25rem` (20px)       | `p-ui-space-5`, `m-…`     | Gap de sección                                                      |
| Espaciado  | `--ui-space-6`             | `1.5rem`  (24px)       | `p-ui-space-6`, `m-…`     | Padding horizontal del page-container (mobile)                      |
| Espaciado  | `--ui-space-7`             | `2rem`    (32px)       | `p-ui-space-7`, `m-…`     | Gap vertical del stack de Cards                                    |
| Espaciado  | `--ui-space-8`             | `2.5rem`  (40px)       | `p-ui-space-8`, `m-…`     | Padding vertical de EmptyState                                      |
| Colores    | `--ui-bg`                  | `#ffffff`              | `bg-ui-bg`                | Fondo de página                                                     |
| Colores    | `--ui-bg-muted`            | `#f9fafb`              | `bg-ui-bg-muted`          | Header de Card / header de tabla / estado disabled                   |
| Colores    | `--ui-bg-subtle`           | `#f3f4f6`              | `bg-ui-bg-subtle`         | Shimmer del Skeleton / hover del botón ghost                       |
| Colores    | `--ui-fg`                  | `#111827`              | `text-ui-fg`              | Texto del cuerpo por defecto                                        |
| Colores    | `--ui-fg-muted`            | `#6b7280`              | `text-ui-fg-muted`        | Texto secundario (descripciones, placeholders)                      |
| Colores    | `--ui-border`              | `#e5e7eb`              | `border-ui-border`        | Borde por defecto (cards, inputs, filas de tabla)                   |
| Colores    | `--ui-accent`              | `#2563eb`              | `bg-ui-accent`            | CTA primario (botón primary, link focused, página actual)           |
| Colores    | `--ui-accent-fg`           | `#ffffff`              | `text-ui-accent-fg`       | Texto sobre fondos `--ui-accent`                                    |
| Colores    | `--ui-danger`              | `#dc2626`              | `bg-ui-danger`            | Acción destructiva (delete, archive)                               |
| Colores    | `--ui-danger-fg`           | `#ffffff`              | `text-ui-danger-fg`       | Texto sobre fondos `--ui-danger`; texto de error de campo           |
| Colores    | `--ui-success`             | `#16a34a`              | `bg-ui-success`           | Badge de dirección positiva (INCOME), toasts de éxito               |
| Colores    | `--ui-success-fg`          | `#ffffff`              | `text-ui-success-fg`      | Texto sobre fondos `--ui-success`                                   |
| Colores    | `--ui-warning`             | `#d97706`              | `bg-ui-warning`           | Superficie de warning (p. ej. cuenta archivada)                     |
| Colores    | `--ui-warning-fg`          | `#ffffff`              | `text-ui-warning-fg`      | Texto sobre fondos `--ui-warning`                                   |
| Radio      | `--ui-rounded-sm`          | `0.25rem`              | `rounded-ui-sm`           | Chips inline, skeleton                                              |
| Radio      | `--ui-rounded-md`          | `0.5rem`               | `rounded-ui-md`           | Inputs, botones, controles de paginación                            |
| Radio      | `--ui-rounded-lg`          | `0.75rem`              | `rounded-ui-lg`           | Card, dialog                                                        |
| Radio      | `--ui-rounded-full`        | `9999px`               | `rounded-ui-full`         | Badge (forma de píldora)                                            |
| Elevación  | `--ui-shadow-sm`           | `0 1px 2px 0 rgb(0 0 0 / 0.05)`       | `shadow-ui-shadow-sm`  | Elevación en reposo de Card                                         |
| Elevación  | `--ui-shadow-md`           | `0 4px 6px -1px rgb(0 0 0 / 0.1)`     | `shadow-ui-shadow-md`  | Popover (uso futuro)                                                |
| Elevación  | `--ui-shadow-lg`           | `0 10px 15px -3px rgb(0 0 0 / 0.1)`   | `shadow-ui-shadow-lg`  | Overlay con backdrop del dialog                                     |
| Tipografía | `--ui-text-xs`             | `0.75rem`              | `text-ui-text-xs`         | Texto helper, celdas de tabla                                       |
| Tipografía | `--ui-text-sm`             | `0.875rem`             | `text-ui-text-sm`         | Labels de formulario, breadcrumb, texto de botón                    |
| Tipografía | `--ui-text-base`           | `1rem`                 | `text-ui-text-base`       | Cuerpo por defecto / valor de input                                 |
| Tipografía | `--ui-text-lg`             | `1.125rem`             | `text-ui-text-lg`         | Título del header de Card                                           |
| Tipografía | `--ui-text-xl`             | `1.25rem`              | `text-ui-text-xl`         | (Reservado; no consumido en v1)                                     |
| Tipografía | `--ui-text-2xl`            | `1.5rem`               | `text-ui-text-2xl`        | (Reservado; no consumido en v1)                                     |
| Tipografía | `--ui-text-3xl`            | `1.875rem`             | `text-ui-text-3xl`        | `<h1>` del PageHeader                                               |
| Tipografía | `--ui-font-normal`         | `400`                  | `font-ui-font-normal`     | Peso del cuerpo por defecto                                         |
| Tipografía | `--ui-font-medium`         | `500`                  | `font-ui-font-medium`     | Labels de formulario, texto de botón                                |
| Tipografía | `--ui-font-semibold`       | `600`                  | `font-ui-font-semibold`   | Título del header de Card                                           |
| Tipografía | `--ui-font-bold`           | `700`                  | `font-ui-font-bold`       | `<h1>` del PageHeader                                               |

### 1.2 Tema oscuro (declarado, NO renderizado en v1)

Los valores de token del tema oscuro se declaran bajo
`[data-theme='dark']` en `app/_ui/tokens.css` para **compatibilidad
futura no-breaking** — un cambio follow-up `ui-dark-mode` los
activa seteando `data-theme="dark"` en el document root. v1 NO
debe renderizar los tokens oscuros (REQ-UI-9 / BR-UI-8). Un
check de code-review asserta que no hay variantes Tailwind `dark:`
en `app/_ui/`, `app/accounts/`, `app/transactions/`,
`app/dashboard/`, o `app/_components/dashboard-*.tsx`.

La tabla de valores del tema oscuro espeja la estructura del tema
claro (mismos nombres de propiedad, valores hex del tema oscuro).
Ver `app/_ui/tokens.css` líneas 74-89 para los valores
autoritativos.

---

## 2. Inventario de primitive components

Dieciocho primitives se entregan en v1. Cada fila de abajo es un
contrato: **qué hace**, **la forma de sus props**, y **su contrato
de a11y**. Los primitives se importan por path
(`../_ui/primitives/<name>`), NO mediante `app/_ui/index.ts`; el
barrel existe solo para documentación (design §2.3).

| # | Primitive                  | Ruta de archivo                                       | Forma del componente                                                                                                                                                                                                                                                                  | Contrato de a11y                                                                                                                                                                                                                                |
| - | -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `Button`                   | `app/_ui/primitives/button.tsx`                        | `Button({ variant?: 'primary' \| 'secondary' \| 'ghost' \| 'danger', isLoading?: boolean, ...ButtonHTMLAttributes })`. Renderiza `<button type="button">`; `isLoading` alterna `disabled`, `aria-busy`, y un icono `<Spinner>`. Default `type="button"` (NO submit).                        | `focus-visible:ring-2 focus-visible:ring-ui-accent` (REQ-UI-4); `aria-busy="true"` durante loading (REQ-UI-7); `disabled` durante loading.                                                                                                       |
| 2 | `Input`                    | `app/_ui/primitives/input.tsx`                         | `Input({ id: string, ...InputHTMLAttributes })`. `id` es REQUERIDO en tiempo de compilación. Forward de todos los attrs nativos de `<input>` + `className` override.                                                                                                                  | Se empareja con `<label htmlFor>` mediante la prop `id` (REQ-UI-5); `aria-invalid="true"` se propaga desde `FormField` (REQ-UI-6); `focus-visible:ring-2`.                                                                                       |
| 3 | `Textarea`                 | `app/_ui/primitives/textarea.tsx`                      | `Textarea({ id: string, rows?: number = 4, ...TextareaHTMLAttributes })`. Mismo contrato que `Input`.                                                                                                                                                                                  | Igual que `Input` (REQ-UI-5, REQ-UI-6).                                                                                                                                                                                                          |
| 4 | `Select`                   | `app/_ui/primitives/select.tsx`                        | `Select({ id: string, options: ReadonlyArray<{ value, label, disabled? }>, ...SelectHTMLAttributes })`. `<select>` nativo; `children` se omite (usar `options`).                                                                                                                        | El `<select>` nativo es el primitive de a11y para screen readers (no se necesita ARIA extra más allá del pairing con `FormField`). `focus-visible:ring-2`.                                                                                        |
| 5 | `Checkbox`                 | `app/_ui/primitives/checkbox.tsx`                      | `Checkbox({ id: string, ...InputHTMLAttributes })`. `<input type="checkbox">` nativo.                                                                                                                                                                                                   | Input nativo; `FormField` provee el pairing `<label htmlFor>` (REQ-UI-5).                                                                                                                                                                        |
| 6 | `RadioGroup`               | `app/_ui/primitives/radio-group.tsx`                   | `RadioGroup({ name, legend, value, onChange, items: ReadonlyArray<{ value, label, disabled? }>, className? })`. Compone `<fieldset>` + `<legend>` + items `<input type="radio">`; cada item es un `<label>` envolviendo su input.                                                      | `<fieldset>` + `<legend>` dan al grupo un único accessible name (REQ-UI-5). Teclado: navegación nativa de radios.                                                                                                                               |
| 7 | `Combobox`                 | `app/_ui/primitives/combobox.tsx` (Client Component)   | `Combobox({ id, value, onChange, options, placeholder?, required?, disabled?, 'aria-label'? })`. Patrón WAI-ARIA 1.2 combobox: `<select>` nativo (semántico, usado para selección) + `<input type="search">` (visual, usado para query). Client Component (`'use client'`).            | `<select>` es el primitive semántico para screen readers; `<input>` lleva `role="searchbox"`, `aria-controls`, `aria-autocomplete="list"`. Teclado: el select nativo maneja Arrow / Enter; `Escape` limpia la query. SIN nuevas dependencias.   |
| 8 | `FieldError`               | `app/_ui/primitives/field-error.tsx`                   | `FieldError({ id: string, message: string, className? })`. Renderiza `<div role="alert" aria-live="polite" aria-atomic="true">` con el mensaje.                                                                                                                                        | `role="alert"` + `aria-live="polite"` hacen que los screen readers anuncien el error cuando aparece (REQ-UI-6). El `id` es al que apunta `aria-describedby` del campo.                                                                          |
| 9 | `FormField`                | `app/_ui/primitives/form-field.tsx`                    | `FormField({ id, label, required?, description?, error?, children })`. Compone `<label htmlFor>` + child + `FieldError`. Cuando hay `error`, clona al child con `aria-describedby` apuntando al id de `FieldError` y `aria-invalid="true"` (REQ-UI-6).                            | Enforce del pairing label / control vía TypeScript (`id` fluye a ambos); clona `aria-describedby` y `aria-invalid` en el child sin que el child tenga que saberlo. Marcador de requerido renderizado como `<span aria-hidden="true">*</span>`. |
| 10 | `Card` (compuesto)         | `app/_ui/primitives/card.tsx`                          | `Card({ 'aria-label'?, 'aria-labelledby'?, ...HTMLAttributes })` + `CardHeader({ title, badge?, actions? })` + `CardBody({ children })` + `CardFooter({ children })`. `Card` renderiza `<article>`; `CardHeader` renderiza `<header>` con `<h2>{title}</h2>`; `CardBody` y `CardFooter` son slots de contenido. | `Card` es una región semántica (los screen readers la listan como landmark cuando se setea `aria-label`). El `<h2>` de `CardHeader` mantiene la jerarquía de headings consistente.                                                              |
| 11 | `Table` (compuesto)        | `app/_ui/primitives/table.tsx`                         | `Table({ caption: string, hideCaption?, ...TableHTMLAttributes })` + `TableHeader({ columns: ReadonlyArray<{ key, label, sortable?, sortDirection?, onSort? }> })` + `TableBody` + `TableRow` + `TableCell`. `caption` es REQUERIDO.                                                  | `<caption>` siempre presente (visible o `sr-only` vía `hideCaption`); cada `<th>` tiene `scope="col"`; las columnas sortables renderizan `aria-sort` reflejando la dirección actual + un `<button>` dentro del `<th>` para activación por teclado (REQ-UI-8). |
| 12 | `Badge`                    | `app/_ui/primitives/badge.tsx`                         | `Badge({ variant?: 'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger', children })` + helper `directionVariant('INCOME' \| 'EXPENSE')`.                                                                                                                                        | Span decorativo; sin rol interactivo. El color NO es el único carrier de significado (el contenido textual es el significado; el color lo refuerza).                                                                                                 |
| 13 | `EmptyState`               | `app/_ui/primitives/empty-state.tsx`                   | `EmptyState({ title, description?, illustration?, cta?, className? })`. Renderiza `<div role="status">` con title + description + illustration opcional + CTA opcional.                                                                                                                 | `role="status"` hace que los screen readers anuncien el empty state al navegar; el CTA es el primer elemento focuseable cuando está presente (flujo de teclado natural).                                                                          |
| 14 | `Spinner`                  | `app/_ui/primitives/spinner.tsx`                       | `Spinner({ 'aria-label'?: string = 'Loading', size?: number = 20 })`. SVG inline con `animate-spin` solo CSS; sin loop JS.                                                                                                                                                            | `<span role="status" aria-label="Loading">` para que los screen readers anuncien el estado de loading.                                                                                                                                          |
| 15 | `Skeleton`                 | `app/_ui/primitives/skeleton.tsx`                      | `Skeleton({ width?: number \| string = '100%', height?: number \| string = 16, className? })`.                                                                                                                                                                                          | `aria-hidden="true"` para que los screen readers salten el shimmer de loading (un Skeleton es decorativo; la live region arriba del Skeleton carga el estado).                                                                                  |
| 16 | `Pagination`               | `app/_ui/primitives/pagination.tsx`                    | `Pagination({ currentPage: number, totalPages: number, baseUrl: string, queryKey?: string = 'page' })`. `<nav aria-label="Pagination">` server-rendered con controles `<Link>` (Previous, page N, Next).                                                                              | `<nav aria-label="Pagination">` es un landmark de navegación; cada `<Link>` lleva `aria-label="Page N"` / `"Previous page"` / `"Next page"`; la página actual tiene `aria-current="page"`.                                                        |
| 17 | `Dialog` (Client)          | `app/_ui/primitives/dialog.tsx` (Client Component)     | `Dialog({ open: boolean, onClose: () => void, title: string, description?: string, children })`. Envuelve un `<div role="dialog" aria-modal="true">` custom (no usa el `<dialog>` nativo — el sistema de diseño controla el backdrop). Client Component (`'use client'`).            | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (title) + `aria-describedby` (description). Focus trap (Tab cycla dentro); `Escape` cierra; click en backdrop cierra; focus vuelve al trigger al cerrar.                              |
| 18 | `Breadcrumb`               | `app/_ui/primitives/breadcrumb.tsx`                    | `Breadcrumb({ items: ReadonlyArray<{ label, href? }> })`. Renderiza `<nav aria-label="Breadcrumb"><ol>` con items `<Link>`; el último item (sin `href`) es la página actual y lleva `aria-current="page"`.                                                                            | `<nav aria-label="Breadcrumb">` es un landmark de navegación; el último item tiene `aria-current="page"`; el separador `/` es `aria-hidden`.                                                                                                      |
| 19 | `Link`                     | `app/_ui/primitives/link.tsx`                          | `Link({ href, className?, ...ComponentProps<typeof NextLink> })`. Wrapper fino de Next.js `Link`.                                                                                                                                                                                      | `focus-visible:ring-2 focus-visible:ring-ui-accent` (REQ-UI-4). Toda la semántica estándar de `<a>` (click-derecho "abrir en nueva pestaña", click-central, lista de links en screen reader) preservada por `next/link`.                          |

### 2.1 Nota sobre compound vs single-export

Los primitives `Card` y `Table` son **compuestos**: un único
archivo exporta el padre más sus sub-components (`Card`/
`CardHeader`/`CardBody`/`CardFooter`; `Table`/`TableHeader`/
`TableBody`/`TableRow`/`TableCell`). La composición ocurre en el
call site:

```tsx
<Card aria-label="Resumen mensual">
  <CardHeader title="Resumen mensual" badge={<Badge>ARS</Badge>} />
  <CardBody>{/* filas key-value */}</CardBody>
  <CardFooter><Button variant="ghost">Cancelar</Button></CardFooter>
</Card>
```

Este es el **patrón de composición de Vercel** (ver
`docs/composition-notes.md` precedente si está presente; si no, ver
`design.md` §"Decision: composition via children"). Sin props
`variant` / `size` / `as` en los padres compuestos; las variantes
viven en el `Button` o `Badge` interno cuando se necesitan.

---

## 3. Inventario del layout shell

Cinco primitives de layout shell envuelven los renders a nivel de
página.

| # | Primitive       | Ruta de archivo                              | Forma del componente                                                                                                                                       | Rol de a11y / semántica                                                                                          |
| - | --------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1 | `PageHeader`    | `app/_ui/layout/page-header.tsx`              | `PageHeader({ title: string, description?, actions?, className? })`. Renderiza `<header>` con `<h1>{title}</h1>` + `<p>` + slot de acciones.            | `<header>` es un landmark banner; `<h1>` es el heading de página (uno por página; `CardHeader` usa `<h2>`).       |
| 2 | `PageContainer` | `app/_ui/layout/page-container.tsx`           | `PageContainer({ children, className? })`. Renderiza `<main>` con max-width 6xl + padding horizontal responsive (`px-ui-space-4` → `lg:px-ui-space-8`).    | `<main>` es el landmark de contenido principal (uno por página).                                                  |
| 3 | `BreadcrumbBar` | `app/_ui/layout/breadcrumb-bar.tsx`           | `BreadcrumbBar({ items: ReadonlyArray<{ label, href? }> })`. Compone el primitive `Breadcrumb` (sin lógica nueva).                                          | Igual que `Breadcrumb` — landmark `<nav aria-label="Breadcrumb">`.                                                |
| 4 | `Sidebar`       | `app/_ui/layout/sidebar.tsx`                  | `Sidebar({ children?, className? })`. Renderiza `<aside className="flex flex-col gap-ui-space-4">`.                                                         | `<aside>` es un landmark complementary. **NO consumido en v1** — exportado para el cambio follow-up `ui-sidebar`. |
| 5 | `Topbar`        | `app/_ui/layout/topbar.tsx`                   | `Topbar({ children?, className? })`. Renderiza `<header className="flex items-center justify-between border-b border-ui-border bg-ui-bg px-ui-space-4 py-ui-space-3">`. | `<header>` landmark banner. **NO consumido en v1** — exportado para el cambio follow-up `ui-topbar`.            |

### 3.1 Patrón de composición

Cada página de producción compone el layout shell así (verificado
en `app/accounts/page.tsx`, `app/transactions/page.tsx`,
`app/dashboard/page.tsx`, y las rutas create / detail):

```tsx
<PageContainer>
  <BreadcrumbBar items={[{ label: 'Inicio', href: '/' }, { label: 'Cuentas' }]} />
  <PageHeader
    title="Cuentas"
    description="Administrá tus cuentas y su snapshot de actividad."
    actions={<Button variant="primary" onClick={openNew}>Nueva cuenta</Button>}
  />
  {/* page body — Cards + Tables + EmptyState */}
</PageContainer>
```

`Sidebar` y `Topbar` se exportan sin uso en v1 por diseño — su
inclusión en el inventario es una forward-declaration para que los
cambios follow-up `ui-sidebar` y `ui-topbar` no requieran un nuevo
primitive.

---

## 4. Contratos transversales

Estos contratos aplican a través de todos los primitives, no solo a
los listados en §2 / §3.

### 4.1 Indicador de foco visible (REQ-UI-4)

Todo primitive interactivo renderiza
`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2`.
El tratamiento visual tiene un ratio de contraste de al menos 3:1
contra el fondo circundante (WCAG 2.4.7 Focus Visible). El caso
`Button variant="danger"` mantiene el color danger vía el background
de la variante, pero el ring de foco queda en `--ui-accent` por
consistencia (un ring color danger desaparecería sobre el fondo
danger).

### 4.2 Pairing de label / campo de formulario (REQ-UI-5)

Todo campo de formulario (`Input`, `Textarea`, `Select`,
`Checkbox`, `RadioGroup`, `Combobox`) se empareja con un `<label
htmlFor="<id>">` o un `aria-label` (para botones icon-only). El
primitive `FormField` es el **mecanismo de enforcement** — el
pairing se logra fluyendo la prop `id` del form field tanto al
`<label>` como al control. Los botones icon-only (p. ej.
`Pagination` "Previous page") llevan un `aria-label` que describe
la acción.

### 4.3 Errores inline de formulario con aria-describedby (REQ-UI-6)

Los errores de formulario se renderizan junto al campo ofensor, NO
arriba del formulario. El primitive `FormField` inyecta
`aria-describedby` (apuntando al `id` del elemento `FieldError`) y
`aria-invalid` en el control child cuando hay prop `error`. El
primitive `FieldError` usa `role="alert"` + `aria-live="polite"`
para que los screen readers anuncien el error cuando aparece.

### 4.4 Estado de loading del botón submit (REQ-UI-7)

El botón submit de cada formulario usa el primitive `Button` con
`isLoading={pending}` (el flag `pending` del `useActionState` de
React 19). Durante loading, el botón renderiza `disabled` +
`aria-busy="true"` + un icono `<Spinner>`. Los double-clicks se
debouncean (el `useActionState` de React 19 garantiza que la
action corre exactamente una vez por ventana de submission).

### 4.5 Table caption + scope + aria-sort (REQ-UI-8)

Todo primitive `Table` renderiza `<caption>` (visible o `sr-only`
vía `hideCaption`). Todo `<th>` tiene `scope="col"`. Las columnas
sortables renderizan `aria-sort` reflejando la dirección de sort
actual (`ascending` / `descending` / `none`) y un `<button>` dentro
del `<th>` para activación por teclado.

### 4.6 Sin variantes dark en producción (REQ-UI-9)

v1 entrega un único tema claro. La tabla de tokens declara
CSS custom properties de modo oscuro bajo `[data-theme='dark']`
para compatibilidad futura, pero no aparecen variantes Tailwind
`dark:` en `app/_ui/`, `app/accounts/`, `app/transactions/`,
`app/dashboard/`, o `app/_components/dashboard-*.tsx`. La verify
gate corre
`git grep -E '\bdark:' app/_ui/ app/accounts/ app/transactions/ app/dashboard/ app/_components/dashboard-*.tsx`
y asserta cero matches.

### 4.7 Imports path-based (sin barrel en runtime)

Los imports en runtime son **path-based**, no barrel-based:

```ts
import { Button } from '../_ui/primitives/button';
import { Card, CardHeader, CardBody } from '../_ui/primitives/card';
```

`app/_ui/index.ts` existe para documentación (re-exporta los 18
primitives + 5 layout-shell primitives) pero NO se usa en runtime.
Por design §2.3, el barrel es una superficie de documentación que
hace fácil grepear la superficie pública; los imports path-based
mantienen honesto al bundle analyzer y evitan re-exports
circulares.

---

## 5. Versionado y follow-up

El sistema de diseño está en **v1**. Cambios aditivos futuros:

| Cambio follow-up        | Qué agrega                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ui-dark-mode`          | Activa los tokens del tema oscuro; agrega un theme toggle al `PageHeader`.                                                   |
| `ui-i18n`               | Reemplaza los strings hard-coded de mezcla EN/ES con un message catalog; introduce el hook `useT(key)`.                      |
| `ui-charts`             | Agrega un primitive `Chart` compuesto; posiblemente introduce un primitive SVG de chart minimal o `recharts`.               |
| `ui-sidebar` / `ui-topbar` | Consume los primitives `Sidebar` + `Topbar` en las páginas de producción (reemplazando el layout full-width actual).     |

La tabla de tokens es la única superficie estable — cada cambio
follow-up o activa un token sin uso o agrega nuevos tokens bajo la
misma convención de naming (`--ui-*`).

---

## 6. Referencias

- `openspec/specs/ui/spec.md` — la spec canónica que operationaliza
  este documento. REQ-UI-1 a REQ-UI-11 están codificados allí.
- `openspec/changes/transactions-ui/design.md` §3.1 (tabla de
  tokens), §3.2 (contratos de props de primitives), §7.1 (lista de
  primitives), §7.2 (lista de layout shell), §11 (estrategia de
  a11y), §16.5 (mitigación de perf).
- `app/_ui/README.md` — la versión interna para developers (más
  corta, en el repo).
- `app/_ui/tokens.css` — la source of truth de la tabla de tokens.
- `app/_ui/index.ts` — el barrel público (documentación; los
  imports en runtime son path-based).
- `docs/qa/transactions-ui.md` — el checklist manual de QA que
  codifica REQ-UI-11.
- `docs/perf/transactions-ui.md` — el artefacto de verificación
  del budget de perf de Lighthouse.
- `AGENTS.md` raíz §13 — la política de mirror de docs en dos
  idiomas.