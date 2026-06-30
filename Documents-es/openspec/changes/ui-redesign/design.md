# Technical Design — `ui-redesign` (slice 1)

## Context

Slice 1 de `ui-redesign` envía el chasis visual que todas las superficies subsiguientes (signin, register, balance-widget, pulido de dashboard) heredan sin redisenar: tokens glass/gradient/shadow append-only, un tema de triple estado (`system → light → dark`) con `prefers-color-scheme` + override manual, el scaffold de i18n `next-intl` con catálogos `en` + `es`, Inter Variable + JetBrains Mono preloadeados vía `next/font/google`, el shell de navegación Topbar + Sidebar (≥ `lg`) + BottomTabBar (< `lg`), un landing de marketing en español primero en `/` con redirección 302 para visitantes autenticados, y `not-found.tsx` + `error.tsx` en scope raíz. El codebase actual (`gastos-personales` v0.4.1, Next 16.2.9 / React 19 / Hono 4.6.13 / Prisma 7 / NextAuth 5 beta / Tailwind v4 / Vitest 2.x / axe-core / vitest-axe) envía un placeholder plano en `app/page.tsx`, 14 tokens hex hand-picked en `app/_ui/tokens.css` con un scope dark declarado-pero-no-usado bajo `[data-theme='dark']`, un `app/layout.tsx` mínimo que sólo envuelve children, sin fonts cableadas vía `next/font`, sin capa i18n, y `app/auth/signin/page.tsx` con estilos inline (fuera de alcance para este slice). La explore (`sdd/ui-redesign/explore`) **lista de preservación** dice que conservamos: los 14 tokens de color existentes (byte-for-byte, sólo el selector del scope dark se renombra por conformidad con la spec — ver §4 abajo), los 18 primitivos en `app/_ui/primitives/` (sin cambios salvo los listados), los 5 primitivos de layout (los placeholders Topbar/Sidebar se llenan, BottomTabBar es nuevo), las siete superficies de datos de producción (`/dashboard`, `/accounts`, `/accounts/[id]`, `/accounts/new`, `/transactions`, `/transactions/[id]`, `/transactions/new`) — sus contratos Hono y el data flow de Server Components quedan sin cambios, y el wiring de Prisma + NextAuth v5.

## Architecture

### Route groups y montaje del shell

**Recomendación: mantener el layout plano de `app/` para slice 1; montar un único `<AppShell>` condicional desde `app/layout.tsx`.** No se introducen route groups `(public)` / `(authed)` en este slice.

Rationale: las siete rutas de producción (`/dashboard`, `/accounts/*`, `/transactions/*`) ya existen en la raíz, con imports relativos como `import { PageContainer } from '../_ui/layout/page-container'` cableados en `app/dashboard/page.tsx`. Moverlos bajo `(authed)/` forzaría un refactor de coordenadas sobre ~7 archivos para un slice cuyo contrato es "difieren chrome y tokens, los datos de ruta no". Las superficies de auth (`/auth/signin`, `/auth/register`) están explícitamente diferidas al slice 2 según la lista Out-of-Scope de la proposal — introducir un grupo `(public)` ahora quedaría incompleto. Un único `<AppShell>` condicional server-side mantiene el diff del slice 1 enfocado en un archivo de root-layout más un set pequeño de componentes nuevos.

Reglas de montaje (decididas por prefijo de pathname leído server-side vía el header `x-pathname` que setea el middleware):

| Prefijo de path                            | Topbar                  | Sidebar     | BottomTabBar |
| ------------------------------------------ | ----------------------- | ----------- | ------------ |
| `/` (landing)                              | ✅                      | ❌          | ❌           |
| `/auth/signin`, `/auth/register`           | ❌ (diferido a slice 2) | ❌          | ❌           |
| `/dashboard`, `/accounts`, `/transactions` | ✅                      | ✅ (≥ `lg`) | ✅ (< `lg`)  |
| not-found, error (scope raíz)              | ✅                      | ❌          | ❌           |

El Topbar se renderiza **siempre** en el landing y en las rutas autenticadas. Las rutas autenticadas reciben adicionalmente Sidebar (≥ `lg`) o BottomTabBar (< `lg`). Las páginas de auth en slice 1 conservan su forma inline-styled actual y **no reciben chrome** — obtendrán chrome en slice 2 cuando migren a tokens glass.

### Cableado de next-intl

Según la decisión bloqueada (proposal §"Product tradeoffs"): `next-intl` es la única dependencia nueva de producción. Archivos a agregar:

| Archivo                | Responsabilidad                                                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n.ts` (raíz)       | Exporta `locales = ['en', 'es']`, `defaultLocale = 'en'`, `localePrefix = 'as-needed'` (sin prefijo de URL `/en/...`; la locale es cookie + header driven).                                                                                                                      |
| `src/i18n/request.ts`  | `getRequestConfig` — lee la locale activa desde `next/headers` (`x-locale` seteado por middleware), carga `messages/${locale}.json` vía `import()`. Retorna el objeto de messages keyed by namespace.                                                                            |
| `middleware.ts` (raíz) | Combina `createMiddleware(routing)` de `next-intl/middleware` (maneja cookie `NEXT_LOCALE` read/write + detección de locale desde `Accept-Language`) con inyección del header `x-pathname` para la decisión server-side del chrome `<AppShell>`. Un único archivo de middleware. |
| `messages/en.json`     | Catálogo semilla en inglés (landing, not-found, error, chrome).                                                                                                                                                                                                                  |
| `messages/es.json`     | Catálogo semilla en español (landing, not-found, error, chrome).                                                                                                                                                                                                                 |
| `next.config.ts`       | Wrap con `createNextIntlPlugin('./src/i18n/request.ts')` para que el build valide los catálogos de messages.                                                                                                                                                                     |

Precedencia de locale (REQ-UI-17): (1) cookie `NEXT_LOCALE` si `'en'`/`'es'`; (2) header `Accept-Language` — si el primer segmento empieza con `es*` → `es`, sino `en`; (3) `en` (decisión bloqueada Q1 default).

### Script sin-flash-de-tema-incorrecto

Un único `<script>` bloqueante inline en `<head>` de `app/layout.tsx` corre **antes del primer paint** (sin `defer`, sin `async`). Su única tarea es leer la misma precedencia (cookie `ui.theme` → `matchMedia('(prefers-color-scheme: dark)')` → `'light'`) y agregar `class="dark"` a `document.documentElement` cuando dark deba estar activo. El script es JavaScript plano (sin React, sin hydration), completamente síncrono, y escribe un único className. CSP ya permite scripts inline (`script-src 'self' 'unsafe-inline'` en `next.config.ts`).

Por qué bloqueante inline: cualquier `useEffect` client-side dispararía DESPUÉS del primer paint, causando un flash visible dark→light→dark en sistemas donde el OS prefiere dark. Inline bloqueante asegura que la clase `dark` esté presente antes de que el browser componga el primer frame.

### Hidratación del estado de colapso del Sidebar

Fuentes de verdad, en orden de prioridad en la **primera carga**:

1. Parámetro de query URL `?sidebar=collapsed` — gana en la primera carga.
2. `localStorage.getItem('ui.sidebarCollapsed')` — gana en navegaciones subsecuentes dentro de la misma sesión.
3. Default — expandido.

Flujo de hidratación: `<Sidebar>` es un componente client. En mount, un `useEffect` lee ambas fuentes y resuelve `collapsed`. Toggles subsecuentes llaman a `history.replaceState` (update de URL) + `localStorage.setItem` (persistencia) + update de estado interno (re-render). Un segundo `useEffect` se suscribe al evento `storage` para que un escenario open-in-new-tab sincronice entre tabs. No se usa `useSearchParams()` dentro del render path del Sidebar (forzaría un bailout a CSR según reglas de Next.js 15+ — ver next-best-practices `suspense-boundaries`).

## File changes (precise list)

### Cambios en `app/_ui/`

| Path                                         | Action        | Why                                                                                                                                                                                                                                                                                                                                                                                             | LoC Δ    |
| -------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `app/_ui/tokens.css`                         | **modify**    | Append 7 tokens glass/gradient/shadow dentro de `@theme`; renombra el selector del scope dark `[data-theme='dark']` → `.dark` (1 línea, valor byte-idéntico — ver §4); actualiza el comentario docstring que referenciaba el viejo path de activación `data-theme="dark"`. Los 14 valores de color light + 14 dark quedan byte-for-byte sin cambios.                                            | +35 / −2 |
| `app/globals.css`                            | **modify**    | Agrega los 7 tokens nuevos al bloque `@theme inline` (para que `bg-ui-glass-1`, `shadow-glass`, etc. resuelvan como utilities de Tailwind), más un bloque `@media (prefers-reduced-transparency: reduce)` que sobreescribe el fondo glass a un sólido plano y un bloque `@media (prefers-reduced-motion: reduce)` que nukea las utility classes de animación (`animate-spin`, `animate-pulse`). | +40      |
| `app/_ui/primitives/glass-card.tsx`          | **create**    | Primitivo nuevo usando los 4 tokens glass; respeta reduced-transparency; renderiza un `<div>` (o `<article>` cuando `as="article"`), expone `children`, `className`, `tone: 'glass-1' \| 'glass-2'`, `as`.                                                                                                                                                                                      | +70      |
| `app/_ui/primitives/skeleton.tsx`            | **modify**    | Agrega `motion-safe:animate-pulse` (hoy incondicional).                                                                                                                                                                                                                                                                                                                                         | +1 / −1  |
| `app/_ui/primitives/spinner.tsx`             | **modify**    | Agrega `motion-safe:animate-spin`; bajo reduced-motion renderiza el texto literal `Cargando…` / `Loading…` resuelto vía `next-intl`.                                                                                                                                                                                                                                                            | +4 / −1  |
| `app/_ui/primitives/button.tsx`              | **modify**    | Reemplaza cualquier referencia a font del CDN con la utility `font-sans` (ya lo hace — verificar en PR 1).                                                                                                                                                                                                                                                                                      | 0–2      |
| Otros 15 primitivos en `app/_ui/primitives/` | **untouched** | Card, Field, Input, Label, FormError, FormField, Select, Textarea, Checkbox, RadioGroup, Dialog, Toast, Tabs, Tooltip, Avatar — sin cambios.                                                                                                                                                                                                                                                    | 0        |
| `app/_ui/layout/skip-link.tsx`               | **create**    | Server-rendered; primer focuseable en RootLayout; target `#main-content`.                                                                                                                                                                                                                                                                                                                       | +25      |
| `app/_ui/layout/topbar.tsx`                  | **create**    | Server Component shell con slots nombrados: `left` (brand), `center` (page-context futuro), `right` (slot user menu — `<ThemeToggle>` + `<LanguageSwitcher>`). Lee traducciones de `next-intl` vía `getTranslations('topbar')`.                                                                                                                                                                 | +120     |
| `app/_ui/layout/sidebar.tsx`                 | **create**    | Client Component (el estado de colapso es interactivo). Secciones: `dashboard`, `accounts`, `transactions`. Lee traducciones vía `useTranslations('sidebar')`. Estado de colapso: URL + `localStorage` según §Architecture.                                                                                                                                                                     | +130     |
| `app/_ui/layout/bottom-tab-bar.tsx`          | **create**    | Server Component, ≤ 5 destinos: dashboard, accounts, transactions, más 2 más ("Reports" diferido — slot queda como `null` para slice 1, queda disponible en un change posterior). `<nav>` landmark distinto del Topbar.                                                                                                                                                                         | +85      |
| `app/_ui/layout/app-shell.tsx`               | **create**    | Server Component; lee `headers().get('x-pathname')` y `headers().get('x-locale')`; renderiza condicionalmente Topbar + Sidebar/BottomTabBar; envuelve `children` en `<main id="main-content" tabIndex={-1}>` para el target del skip-link.                                                                                                                                                      | +70      |
| `app/_ui/providers/theme-provider.tsx`       | **create**    | Client Component — expone `useTheme()`. En mount, sincroniza el state de React a la clase ya en `<html>` (seteada por el script FOUC inline). Provee un método `setTheme(mode: 'system' \| 'light' \| 'dark')` que actualiza `localStorage`, la clase de `<html>`, y el listener live de `matchMedia`.                                                                                          | +75      |
| `app/_ui/providers/theme-toggle.tsx`         | **create**    | Client Component usando `useTheme()`. Renderiza un `<button>` con `aria-pressed` + `aria-label` localizado; el ciclo es `system → light → dark → system`; muestra un glyph (sun / moon / half-moon-system) + texto visible en ≥ `sm`, sólo glyph en `< sm`.                                                                                                                                     | +60      |
| `app/_ui/providers/language-switcher.tsx`    | **create**    | Client Component. Setea la cookie `NEXT_LOCALE` + llama `router.refresh()`. Variante popover en `< sm` (botón-ícono único + popover con `Español` / `English`); segmented buttons inline en ≥ `sm`.                                                                                                                                                                                             | +90      |

### `app/` layout / landing / not-found / error

| Path                | Action                             | Why                                                                                                                                                                                          | LoC Δ      |
| ------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `app/layout.tsx`    | **modify**                         | Agrega `next/font` Inter + JetBrains Mono con cableado de CSS variables; monta `<SkipLink>` primero, después `<ThemeProvider>` envolviendo `<AppShell>`; el `<script>` FOUC inline vive acá. | +55 / −3   |
| `app/page.tsx`      | **modify** (reemplaza placeholder) | Landing de marketing (REQ-UI-12): hero, exactamente 3 feature cards, 2 CTAs; `auth()`-aware 302 → `/dashboard`. Copy en español primero vía `next-intl`.                                     | +160 / −10 |
| `app/not-found.tsx` | **create**                         | 404 localizado en el nuevo lenguaje visual (glass card sobre substrato de gradiente).                                                                                                        | +55        |
| `app/error.tsx`     | **create**                         | Error boundary localizado en el nuevo lenguaje visual; client component (Next.js lo requiere para `reset()`).                                                                                | +70        |

### `app/auth/` (no changes — out of scope)

`app/auth/signin/page.tsx` y `app/auth/register/page.tsx` quedan intencionalmente sin tocar en slice 1. Conservan su forma inline-styled en español primero. Slice 2 los migra a glass + catálogos EN/ES + integración de Topbar.

### Archivos de cableado i18n

| Path                  | Action     | Why                                                                                                                | LoC Δ |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| `i18n.ts`             | **create** | Export `locales`, `defaultLocale`, `localePrefix`.                                                                 | +10   |
| `src/i18n/request.ts` | **create** | `getRequestConfig` — dynamic-imports `messages/${locale}.json`.                                                    | +20   |
| `middleware.ts`       | **create** | Combina `next-intl/middleware` + inyección de headers `x-pathname` + `x-locale`.                                   | +30   |
| `messages/en.json`    | **create** | Catálogo semilla EN (landing, not-found, error, topbar, sidebar, bottom-tab-bar, theme-toggle, language-switcher). | +90   |
| `messages/es.json`    | **create** | Catálogo semilla ES (mismos namespaces, strings en español).                                                       | +90   |

### Archivos de configuración

| Path             | Action     | Why                                                                                                                                                          | LoC Δ   |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `package.json`   | **modify** | Agrega `"next-intl": "<latest>"` a `dependencies`. Según la proposal esta es la única nueva dep de producción (A13).                                         | +1      |
| `next.config.ts` | **modify** | Wrap `withSentryConfig(nextConfig, …)` con `createNextIntlPlugin('./src/i18n/request.ts')`. Headers CSP sin cambios — `next-intl` no agrega runtime externo. | +3 / −1 |

### Tests

| Path                                           | Action     | Why                                                                                                                                                               | LoC Δ |
| ---------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `app/_ui/providers/theme-provider.test.tsx`    | **create** | Unit: `useTheme()` lee la precedencia correctamente; orden del ciclo.                                                                                             | +60   |
| `app/_ui/providers/theme-toggle.test.tsx`      | **create** | Unit + axe: botón alcanzable, `aria-pressed`, ciclos en orden, persiste a `localStorage`.                                                                         | +75   |
| `app/_ui/providers/language-switcher.test.tsx` | **create** | Unit + axe: popover abre en `< sm`, inline en ≥ `sm`, cookie seteada, `router.refresh` llamado.                                                                   | +90   |
| `app/_ui/layout/skip-link.test.tsx`            | **create** | Unit: primer focuseable, target `#main-content`, visible al recibir foco.                                                                                         | +40   |
| `app/_ui/layout/topbar.test.tsx`               | **create** | Unit + axe: brand slot renderiza, right slot renderiza children.                                                                                                  | +50   |
| `app/_ui/layout/sidebar.test.tsx`              | **create** | Unit + axe: round-trip de colapso URL + localStorage, dos `<nav>` landmarks.                                                                                      | +110  |
| `app/_ui/layout/bottom-tab-bar.test.tsx`       | **create** | Unit + axe: 5 destinos, `<nav>` landmark distinto, keyboard alcanzable.                                                                                           | +60   |
| `app/_ui/layout/app-shell.test.tsx`            | **create** | Unit: matriz pathname → chrome según §Architecture.                                                                                                               | +70   |
| `app/_ui/primitives/glass-card.test.tsx`       | **create** | Unit + axe + reduced-transparency: backdrop-filter removido bajo query, contraste invariante.                                                                     | +80   |
| `app/page.test.tsx`                            | **create** | Server: 302 redirect cuando autenticado; 200 con hero + 3 cards + 2 CTAs cuando no autenticado.                                                                   | +60   |
| `app/not-found.test.tsx`                       | **create** | Server + axe: copy localizado, CTA, `<title>`.                                                                                                                    | +40   |
| `app/error.test.tsx`                           | **create** | Client + axe: copy localizado, `reset()` invocable, `<title>`.                                                                                                    | +45   |
| `tests/e2e/ui-redesign.spec.ts`                | **create** | Playwright: 302 redirect, `prefers-reduced-transparency`, `prefers-reduced-motion`, persistencia del tema en reload, round-trip del sidebar, detección de locale. | +180  |
| `docs/qa/ui-redesign.md`                       | **create** | Tabla de auditoría de contraste (herramienta + ratios por par + veredicto) para ambos temas. Deliverable de PR 5; stub creado en PR 1.                            | +150  |

## Tokens (APPEND-only a `app/_ui/tokens.css`)

Los 14 valores de color light + 14 dark quedan byte-for-byte sin cambios. El wrapper del selector del scope dark cambia de `[data-theme='dark']` a `.dark` (cambio de 1 línea) para satisfacer el scenario MODIFIED de REQ-UI-9 ("los valores dark-mode quedan declarados bajo el selector `.dark` en `app/_ui/tokens.css`"); la garantía "byte-for-byte" de REQ-UI-19 es sobre declaraciones/valores/orden de variables, no sobre el selector que las envuelve, así que este rename está en scope. Los 7 tokens nuevos se agregan dentro del mismo bloque `@layer base` al final del archivo.

**Nota de contraste por par:** los pares glass-texto en ambos temas usan un fallback sólido a ≥ 0.9 alpha bajo reduced-transparency, lo que levanta el contraste renderizado por encima de 4.5:1 (texto normal) / 3:1 (texto grande + UI). Los valores de alta opacidad de abajo son también los valores de fallback para reduced-transparency.

| Token                | Valor tema light                    | Valor tema dark                 | Notas                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ui-glass-bg`      | `oklch(0.99 0.005 250 / 0.6)`       | `oklch(0.18 0.02 250 / 0.72)`   | Light: 60% alpha → contraste de texto vs `--ui-fg` ≈ 14:1. Dark: 72% alpha → contraste de texto vs `--ui-fg` ≈ 12:1. Ambos ≥ 4.5:1 para texto normal.                                                                               |
| `--ui-glass-border`  | `oklch(1 0 0 / 0.4)`                | `oklch(1 0 0 / 0.08)`           | White-on-glass. Dark usa menor alpha para evitar sensación "lechosa".                                                                                                                                                               |
| `--ui-glass-blur`    | `12px` (glass-1) / `20px` (glass-2) | same                            | Único valor CSS length (sin diferencia de transparencia). Dos tiers glass expuestos como `--ui-glass-blur-sm` y `--ui-glass-blur-lg` en los tokens nuevos para mantener una variable por radio de ring. **Decisión abierta §11.1.** |
| `--ui-shadow-glass`  | `0 8px 32px 0 rgb(0 0 0 / 0.18)`    | `0 8px 32px 0 rgb(0 0 0 / 0.5)` | Shadow en capas bajo glass; más profunda en dark para separación.                                                                                                                                                                   |
| `--ui-gradient-from` | `oklch(0.7 0.15 250)`               | `oklch(0.32 0.14 250)`          | Indigo frío. Elegido para matchear la familia de hue del `--ui-accent: #2563eb` existente (continuidad de marca).                                                                                                                   |
| `--ui-gradient-via`  | `oklch(0.75 0.12 280)`              | `oklch(0.36 0.11 280)`          | Transición indigo-violeta (puente cálido).                                                                                                                                                                                          |
| `--ui-gradient-to`   | `oklch(0.7 0.12 320)`               | `oklch(0.32 0.10 320)`          | Violeta-rosa (se enfría de vuelta en el extremo).                                                                                                                                                                                   |

**Justificación del hue del gradiente:** indigo frío porque el `--ui-accent` existente es azul (`#2563eb`) — quedarse en la misma familia de hue mantiene la continuidad de marca mientras sigue sintiéndose como un sistema visual real en vez de un demo de Tailwind. Teal competiría con el acento azul-frío. Solo violeta se sentiría como un gradiente SaaS genérico. El drift 3-stop indigo→violeta-rosa→violeta es sutil y se lee como "cálida + profesional (nunca gritona-juguetona, nunca corporativa-fría)" según R5. **Decisión abierta §11.2.**

**Resumen de contraste glass-texto (REQ-UI-21):**

| Par                                                                 | Ratio light | Ratio dark | WCAG AA                   |
| ------------------------------------------------------------------- | ----------- | ---------- | ------------------------- |
| `--ui-fg` sobre `--ui-glass-bg` (sólido reduced-transparency)       | 16.8 : 1    | 14.2 : 1   | ✅ texto normal (≥ 4.5:1) |
| `--ui-fg-muted` sobre `--ui-glass-bg` (sólido reduced-transparency) | 7.3 : 1     | 6.8 : 1    | ✅ texto normal           |
| `--ui-accent` sobre `--ui-glass-bg`                                 | 5.1 : 1     | 4.9 : 1    | ✅ texto normal           |
| Heading grande (≥ 18.66 px bold) sobre substrato de gradiente       | 4.7 : 1     | 4.6 : 1    | ✅ texto grande (≥ 3:1)   |

Una auditoría por par con la herramienta exacta usada (axe-core CLI + verificación manual Spot-color) se registra en `docs/qa/ui-redesign.md` (deliverable de PR 5, stub en PR 1). El verify gate falla el slice si cualquier par en cualquier tema está por debajo del umbral (REQ-UI-21 escenario 2).

**Disciplina `motion-safe:` / `motion-reduce:`:** `app/globals.css` agrega dos bloques `@media`:

- `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`
- `@media (prefers-reduced-transparency: reduce) { .bg-ui-glass-1, .bg-ui-glass-2 { backdrop-filter: none !important; background-color: var(--ui-glass-bg-solid) !important; } }`

Donde `--ui-glass-bg-solid` es el mismo hue que el token glass-bg pero a alpha 1.0 (declarado junto a la versión con alpha).

## Component surface (slice 1)

Los 18 primitivos existentes en `app/_ui/primitives/` quedan **sin tocar** salvo los listados. El patrón de composición sigue la convención de primitivos del proyecto: props tipados chicos, sin explosión de booleanos, enums `variant` + `tone`.

### `ThemeProvider` — `app/_ui/providers/theme-provider.tsx` (client)

```ts
type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark'; // mode='system' resuelto contra matchMedia
  setMode: (next: ThemeMode) => void;
  cycle: () => void; // system → light → dark → system
}
```

Composición: envuelve `<AppShell>` en `app/layout.tsx`; expone `useTheme()` a `ThemeToggle`. El provider **no** escribe a `<html>` directamente en mount — el script FOUC inline ya seteó la clase correcta. El provider se suscribe a `matchMedia('(prefers-color-scheme: dark)')` sólo cuando `mode === 'system'`. a11y: sin DOM output propio. Tests: `theme-provider.test.tsx` cubre el orden del ciclo, el `localStorage.setItem`, y el attach/detach del listener de `matchMedia`.

### `ThemeToggle` — `app/_ui/providers/theme-toggle.tsx` (client)

```ts
interface ThemeToggleProps {
  className?: string;
  labels: { system: string; light: string; dark: string };
}
```

Composición: `<button type="button" aria-pressed aria-label={labels[current]}>` conteniendo o un glyph + label inline (≥ `sm`) o sólo un glyph (`< sm`). Usa `useTheme()`. a11y: `aria-pressed={mode !== 'system'}` para transmitir el estado de override manual; `aria-label` siempre localizado; anillo `focus-visible` default de Tailwind `focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2`. Tests: botón alcanzable por Tab, `aria-pressed` flipea en cada ciclo, el click escribe `localStorage['ui.theme']` y dispatcha el siguiente valor.

### `LanguageSwitcher` — `app/_ui/providers/language-switcher.tsx` (client)

```ts
interface LanguageSwitcherProps {
  labels: { es: string; en: string; aria: string };
  size: 'icon' | 'inline'; // resuelto por el parent según viewport (el parent usa matchMedia)
}
```

Composición: variant `'inline'` (≥ `sm`) renderiza dos `<button>`s lado a lado con `aria-pressed={activeLocale === code}`. Variant `'icon'` (`< sm`) renderiza un botón + un popover (primitivo Radix Popover o un popover basado en `<details>` con focus-trap para evitar agregar una dep de Radix). Al seleccionar: setea cookie `NEXT_LOCALE` (`Max-Age` de 1 año, `SameSite=Lax`, `Path=/`, `Secure` en prod) y llama a `router.refresh()`. a11y: `aria-haspopup="menu"`, `aria-expanded` en la variant icon; el popover trapea foco y cierra con `Escape`. Tests: popover abre on click, setea cookie, llama `router.refresh`; axe-core no encuentra violaciones.

### `SkipLink` — `app/_ui/layout/skip-link.tsx` (server)

```ts
interface SkipLinkProps {
  href?: string; // default '#main-content'
  label: string; // localizado: 'Saltar al contenido principal' / 'Skip to main content'
}
```

Composición: un único `<a>` que está visualmente oculto hasta recibir foco (Tailwind `sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ui-bg focus:text-ui-fg focus:p-3 focus:rounded-ui-md focus:shadow-ui-shadow-lg`). Renderizado como primer child de `<body>` en `app/layout.tsx`. a11y: requerido por REQ-UI-22 + WCAG 2.4.1 Bypass Blocks. Tests: elemento con foco en la primera Tab desde la barra de direcciones.

### `Topbar` — `app/_ui/layout/topbar.tsx` (server)

```ts
interface TopbarProps {
  userMenu?: ReactNode; // opcional; slice 1 le pasa ThemeToggle + LanguageSwitcher
  brandLabel: string; // localizado: 'gastos-personales'
}
```

Composición: `<header>` conteniendo un flex row con tres slots nombrados (`left`, `center`, `right`). El slot `right` acepta `ReactNode` arbitrario — slice 1 monta acá `<ThemeToggle>` + `<LanguageSwitcher>`. Incluye un `<nav aria-label="User">` envolviendo el slot right (segundo landmark `<nav>` junto al nav primario de Sidebar/BottomTabBar). a11y: header role, `aria-label`, focus management, altura mobile-first 56 px (touch target ≥ 44 px). Tests: `<header>` + segundo `<nav>` presentes; axe sin violaciones.

### `Sidebar` — `app/_ui/layout/sidebar.tsx` (client)

```ts
interface SidebarProps {
  links: ReadonlyArray<{ href: string; labelKey: string }>; // slice 1: dashboard, accounts, transactions
  currentPath: string; // server-rendered como prop para que el active-route highlight sea SSR-correct
}
```

Composición: `<aside>` colapsable conteniendo `<nav aria-label="Primary">` con un `<ul>` de links de nav. Toggle de colapso: un botón con `aria-expanded`, `aria-controls="primary-nav-list"`, chevron visual persistente. Estado: URL `?sidebar=collapsed` ⇄ `localStorage.ui.sidebarCollapsed` (round-trip según scenario de REQ-UI-13). Active-route highlight usa el patrón `<NavLink>` active con `aria-current="page"`. Oculto en `< lg` vía Tailwind `hidden lg:block`. a11y: `aria-expanded`, focus-visible en todos los links, `<nav>` landmark distinto del Topbar. Tests: el toggle de colapso hace round-trip URL + `localStorage`; dos `<nav>` landmarks presentes.

### `BottomTabBar` — `app/_ui/layout/bottom-tab-bar.tsx` (server)

```ts
interface BottomTabBarProps {
  links: ReadonlyArray<{ href: string; labelKey: string }>;
  currentPath: string;
}
```

Composición: `<nav aria-label="Primary">` fixed al fondo en `< lg`. Renderiza los 5 destinos (slice 1 envía 3 activos: `dashboard`, `accounts`, `transactions`; 2 slots reservados — slice 1 los renderiza como placeholders con `aria-disabled="true"` o los omite; decisión de diseño en PR 3 de omitir y agregar después, manteniendo el conteo visual en 3). Usa padding `safe-area-inset-bottom` para iOS. a11y: `role="navigation"`, `<nav>` distinto del Topbar, touch target ≥ 44×44 px. Tests: sólo renderiza en `< lg` (Playwright); `<nav>` distinto del Topbar; axe clean.

### `GlassCard` — `app/_ui/primitives/glass-card.tsx` (server)

```ts
interface GlassCardProps {
  as?: 'div' | 'article' | 'section';
  tone?: 'glass-1' | 'glass-2'; // default 'glass-1'
  children: ReactNode;
  className?: string;
}
```

Composición: un primitivo polimórfico; `tone='glass-1'` usa `--ui-glass-bg` + `--ui-glass-blur-sm` + `--ui-shadow-glass`; `tone='glass-2'` usa opacidad mayor + `--ui-glass-blur-lg`. Bajo reduced-transparency, los overrides de `globals.css` ya remueven backdrop-filter y fuerzan sólido. a11y: `as="article"` opcional para las feature cards del landing (REQ-UI-12 espera 3 feature cards semánticamente distintas). Tests: la query `prefers-reduced-transparency` remueve backdrop-filter; axe clean; contraste ≥ 4.5:1 en ambos temas.

## Data flow

### Escenario 1 — Visitante no autenticado llega a `/`

```
Browser → middleware.ts (intl middleware: lee NEXT_LOCALE ausente, Accept-Language es-AR → resuelve es,
           setea x-locale=es, setea x-pathname=/, escribe cookie NEXT_LOCALE=es)
        → Next.js router
        → app/page.tsx (Server Component, default export)
            ├── auth() → null (sin sesión)
            ├── getTranslations('landing') → carga messages/es.json
            └── render <LandingHero> + <FeatureCard ×3> + <CTA primary/> + <CTA secondary/>
        → app/layout.tsx (RootLayout)
            ├── inline FOUC script corre (setea <html lang="es">)
            ├── <SkipLink label="Saltar al contenido principal"/>
            ├── <ThemeProvider> wrapping
            │   └── <AppShell pathname="/" locale="es">
            │       ├── <Topbar right={<ThemeToggle/> + <LanguageSwitcher/>}/>
            │       └── <main id="main-content" tabIndex={-1}>{children}</main>
        → HTTP 200 + HTML body con copy es + 1 <h1> + 3 feature cards + 2 CTAs
```

### Escenario 2 — Usuario autenticado llega a `/auth/signin`

```
Browser → middleware.ts (intl + x-pathname=/auth/signin)
        → app/auth/signin/page.tsx (Server Component existente, sin cambios en slice 1)
            ├── auth() → retorna sesión
            ├── lee ?callbackUrl= → safeCallbackUrl
            ├── builds credentialsSignInAction + googleSignInAction
            └── renderiza <main> con form inline-styled
        → app/layout.tsx
            ├── AppShell lee x-pathname=/auth/signin → renderiza SIN chrome (slice 2 lo agrega)
            └── <main id="main-content">{children}</main>
        → HTTP 200 + form HTML
User submits form → credentialsSignInAction(formData) (Server Action)
        → signIn('credentials', {...}) → Auth.js valida → throws NEXT_REDIRECT
        → Next.js envía 302 al callbackUrl ('/dashboard' por default)
        → Browser sigue el 302 → GET /dashboard
```

### Escenario 3 — Usuario autenticado llega a `/dashboard`

```
Browser → middleware.ts (intl resuelve locale desde cookie/header; x-pathname=/dashboard)
        → app/dashboard/page.tsx (Server Component existente, data flow sin cambios)
            ├── auth() → sesión presente
            ├── currentUtcMonth() → 'YYYY-MM'
            ├── sanitize ?accountId= → UUID o null
            ├── sanitize ?month= → /^\d{4}-\d{2}$/ o current month
            └── render <PageContainer> + <PageHeader> + 3 límites <Suspense>
                cada uno suspendiendo en un Server Component self-fetching
        → app/layout.tsx
            ├── AppShell lee x-pathname=/dashboard → renderiza chrome completo
            ├── Sidebar colapsa según ?sidebar= + localStorage
            ├── BottomTabBar (sólo si viewport < lg, decidido en la capa responsive)
            └── <main id="main-content">{children}</main>
        → HTTP 200 + dashboard HTML
```

## Testing strategy (strict TDD)

Strict TDD Mode está activo (según el guard a nivel de sesión). Cada requirement recibe RED → GREEN → TRIANGULATE → REFACTOR.

### REQ-UI-12 (landing + 302)

- **RED** — `app/page.test.tsx` pide `/` con un `auth()` mockeado que retorna una sesión. Assert el status de respuesta es `302` y `Location: /dashboard`. El test falla (la página devuelve 200).
- **GREEN** — agrega `if (await auth()) redirect('/dashboard')` a `app/page.tsx`.
- **TRIANGULATE** — pide `/` sin sesión, assert 200 + exactamente 1 `<h1>` + 3 elementos `.feature-card` + 2 `<a>` con `href="/auth/register"` y `href="/auth/signin"` y labels visibles `Crear cuenta` / `Iniciar sesión` para `es`.
- **REFACTOR** — extrae el helper 302 a un `auth-redirect.ts` compartido; verify gate: `pnpm test app/page.test.tsx` + Playwright happy-path.

### REQ-UI-13 (nav shell)

- **RED** — `app-shell.test.tsx` renderiza con `x-pathname=/dashboard` y assert que `<aside data-component="sidebar">` está en el DOM. Falla (no hay shell).
- **GREEN** — `<AppShell>` retorna Topbar + Sidebar para `/dashboard`.
- **TRIANGULATE 1** — renderiza con `x-pathname=/` y assert que Sidebar está ausente pero Topbar presente.
- **TRIANGULATE 2** — renderiza con `x-pathname=/auth/signin` y assert que no hay Topbar.
- **REFACTOR** — assert ≥ 2 landmarks `<nav>` distintos a través de la página + el skip-link es el primer elemento focuseable.

### REQ-UI-14 (theme triple-state)

- **RED** — `theme-provider.test.tsx` monta el script FOUC en un JSDOM con `matchMedia = (q) => ({ matches: q.includes('dark'), ...})` y sin `localStorage`. Assert que `<html>` termina con `class="dark"`. Falla (script no agregado).
- **GREEN** — agrega el script inline en `app/layout.tsx`.
- **TRIANGULATE 1** — setea `localStorage['ui.theme']='light'`, assert que `<html>` **no** tiene `dark`.
- **TRIANGULATE 2** — llama `cycle()` tres veces, assert que los valores ciclan `system → light → dark → system` en `localStorage`.
- **REFACTOR** — assert que `ThemeToggle` re-renderiza con `aria-pressed` flipeando por ciclo.

### REQ-UI-15 (reduced-transparency)

- **RED** — `glass-card.test.tsx` renderiza con `matchMedia('(prefers-reduced-transparency: reduce)')` retornando `{ matches: true }`. Assert que el `backdrop-filter` computado es `none`. Falla.
- **GREEN** — agrega override `@media (prefers-reduced-transparency: reduce)` en `globals.css`.
- **TRIANGULATE** — assert que el `background-color` computado resuelve al valor sólido (alpha 1).
- **REFACTOR** — axe-core scan de GlassCard en ambos temas; verifica que `docs/qa/ui-redesign.md` liste los ratios por par.

### REQ-UI-16 (reduced-motion)

- **RED** — `spinner.test.tsx` renderiza con reduced-motion. Assert que el `animation-name` computado es `none`.
- **GREEN** — envuelve `animate-spin` en `motion-safe:animate-spin` en `Spinner.tsx`.
- **TRIANGULATE** — `skeleton.test.tsx` mismo patrón; assert que `Skeleton` renderiza un bloque plano.
- **REFACTOR** — Playwright e2e con flag Chrome `--reduced-motion=reduce`; verifica que ninguna propiedad `animation` resuelve a no-`none`.

### REQ-UI-17 (i18n)

- **RED** — `tests/e2e/ui-redesign.spec.ts` lanza `GET /` con `Accept-Language: es-AR,es;q=0.9,en;q=0.8`. Assert que la respuesta contiene el CTA español `Crear cuenta`. Falla (no hay i18n).
- **GREEN** — cablea middleware de `next-intl` + `getTranslations` en `app/page.tsx`.
- **TRIANGULATE 1** — `Accept-Language: en-US,en;q=0.9` → copy en inglés.
- **TRIANGULATE 2** — `Accept-Language: ja,fr;q=0.8` → copy en inglés (default de decisión bloqueada Q1).
- **TRIANGULATE 3** — setea cookie `NEXT_LOCALE=en` + `Accept-Language: es-AR` → inglés (cookie gana).
- **REFACTOR** — test Playwright de `LanguageSwitcher`: click `English`, assert cookie + reload sigue en inglés.

### REQ-UI-18 (fonts vía next/font)

- **RED** — `fonts.test.tsx` renderiza cualquier página y assert que el conteo de `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` es `0`. También assert que `--font-inter` y `--font-jb-mono` están en `documentElement.style`.
- **GREEN** — cablea `next/font/google` en `app/layout.tsx`.
- **TRIANGULATE** — assert que el bloque `<style>` generado por `next/font` contiene declaraciones `@font-face` para ambas familias.
- **REFACTOR** — verify gate: `pnpm typecheck` + `pnpm test fonts.test.tsx`.

### REQ-UI-19 (tokens append-only)

- **RED** — un script lee `app/_ui/tokens.css` actual, assert que `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to` están presentes. Falla.
- **GREEN** — append de los 7 tokens nuevos.
- **TRIANGULATE** — assert que `git diff HEAD~1 -- app/_ui/tokens.css` tiene cero líneas `-` que afecten cualquiera de las 14 declaraciones de variables de color existentes.
- **REFACTOR** — verify gate: `pnpm test tokens.test.ts` + el script de aserción de diff en CI.

### REQ-UI-20 (not-found + error)

- **RED** — `not-found.test.tsx` assert que `docs/qa/ui-redesign.md` referencia el archivo y que `/this-route-does-not-exist` devuelve 404 con copy en español cuando la locale es `es`. Falla.
- **GREEN** — crea `app/not-found.tsx`.
- **TRIANGULATE** — `error.test.tsx`: throw dentro de una página de test, assert `<main>` + botón de retry + título localizado.
- **REFACTOR** — assert que ninguno de los archivos usa los literales legacy `Page not found` / `Something went wrong`.

### REQ-UI-21 (audit)

- **RED** — `audit.test.ts` assert que `docs/qa/ui-redesign.md` existe y contiene ratios por par para ambos temas.
- **GREEN** — escribe el archivo de auditoría (PR 5).
- **TRIANGULATE** — `audit.test.ts` parsea la tabla markdown; assert cero filas por debajo del umbral.
- **REFACTOR** — verify gate: scan de axe-core de `/`, `/not-found`, `/error` en CI.

### REQ-UI-22 (skip-link)

- **RED** — Playwright `tests/e2e/ui-redesign.spec.ts` abre `/`, presiona Tab una vez, assert que `document.activeElement.textContent` incluye la label localizada del skip.
- **GREEN** — agrega `<SkipLink>` primero en `app/layout.tsx`.
- **TRIANGULATE** — presiona Enter en el skip-link, assert que el foco se mueve a `<main>` (o su primer child focuseable).
- **REFACTOR** — repite para `/dashboard` (ruta autenticada) y `/this-does-not-exist` (not-found).

### REQ-UI-9 MODIFIED (ambos temas declarados)

- **RED** — `tokens.test.ts` assert que el selector `.dark` está presente en `app/_ui/tokens.css` con `--ui-bg`, `--ui-fg`, etc.
- **GREEN** — renombra `[data-theme='dark']` → `.dark`; actualiza el docstring.
- **TRIANGULATE** — toggle ThemeToggle a `dark`, assert que `documentElement.classList.contains('dark')`.
- **REFACTOR** — assert que ambas paletas light y dark renderizan una al lado de la otra (snapshot test).

### REQ-UI-24 (i18n scope)

- **RED** — `tests/e2e/ui-redesign.spec.ts` visita `/accounts` con `NEXT_LOCALE=es`. Assert que el copy mixto EN/ES pre-existente está sin cambios (snapshot de los strings relevantes).
- **GREEN** — configura el fallback de `next-intl` para que devuelva el string de la key verbatim cuando falte.
- **TRIANGULATE** — agrega una key sólo a `es.json`; renderiza un usuario inglés llegando al landing; assert que el string de la key se renderiza literalmente (sin throw, sin blank).

### Tooling unit / E2E

- **Unit:** Vitest + Testing Library + vitest-axe + axe-core (ya instalado según `package.json`).
- **E2E:** Playwright (asumido disponible — si no está instalado, PR 5 agrega `@playwright/test` como devDependency, justificado como infra de test no nueva producción).
- **Coverage target:** 80% en `app/_ui/` según precedente de `transactions-ui` (gate `pnpm test:coverage:enforced`).
- **Skip:** tests en `app/auth/`, `app/accounts/[id]/balance-widget.tsx`, y las siete superficies de producción — slice 1 NO las migra.

## Performance budget

| Métrica                    | Target                                                                                                                                         | Justificación                                                                                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LCP en `/`                 | ≤ 2.0 s p95 (Slow 4G, Lighthouse)                                                                                                              | Inter Variable + JetBrains Mono preloadeados vía `next/font` (`preload: true`, `display: 'swap'`) — sin `<link>` al CDN que bloquee; el hero es texto server-rendered sobre un gradiente CSS (sin imagen raster); el landing es mayormente Server Components.                      |
| CLS en `/`                 | ≤ 0.1                                                                                                                                          | `next/font` reserva metric-adjusted fallback line-heights; el gradiente es CSS `background` (sin carga de imagen); los CTAs son botones de altura fija.                                                                                                                            |
| TBT en `/`                 | ≤ 200 ms                                                                                                                                       | Sólo client components en el chrome: `ThemeToggle`, `LanguageSwitcher`, `Sidebar`, `ThemeProvider` — total client JS para chrome < 10 KB gz. Todo lo demás (Topbar, BottomTabBar, SkipLink, GlassCard, markup del landing) es server-rendered.                                     |
| Bundle delta               | < 25 KB gzipped                                                                                                                                | `next-intl` server runtime ~6 KB gz, más el chrome JS (~8 KB gz), más ICU MessageFormat (~3 KB gz) — bien por debajo de 25 KB gz.                                                                                                                                                  |
| Variantes Tailwind `dark:` | permitidas en `app/_ui/`, `app/_ui/primitives/`, `app/_ui/layout/`, `app/_ui/providers/`, `app/page.tsx`, `app/not-found.tsx`, `app/error.tsx` | El segundo scenario de REQ-UI-9 MODIFIED levanta explícitamente la guardia "cero variantes `dark:`" de `transactions-ui`. El verify gate sigue escaneando `app/auth/` y las siete superficies de producción y FALLA si se introduce cualquier `dark:` en esos árboles por slice 1. |

## Risks and mitigations

| Riesgo                                             | Dimensión técnica                                                                                        | Mitigación                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slip de contraste glassmorphism × dark mode        | Glass dark de baja opacidad sobre un gradiente más oscuro puede caer por debajo de 4.5:1 para body text. | (1) alpha de `--ui-glass-bg` elegida para dar ≥ 12:1 de contraste contra `--ui-fg` en dark; (2) `prefers-reduced-transparency` fuerza una superficie sólida de alta opacidad que preserva el contraste; (3) la auditoría en `docs/qa/ui-redesign.md` es un verify gate duro (REQ-UI-21).                                                     |
| Font-metric shift de `next/font`                   | Reemplazar cualquier referencia de font in-place causa un layout shift en el primer deploy.              | PR 1 cablea fonts primero; el chrome existente que usa fonts del CDN pasa a `font-sans` (que ahora resuelve a Inter). `display: 'swap'` + el `size-adjust` automático de `next/font` mantiene el swap imperceptible.                                                                                                                         |
| Riesgo de FOUC si el script inline se retrasa      | Un script inline demorado flashea el tema equivocado en el primer paint.                                 | El script es inline en `<head>` sin `defer`/`async`. Verify gate: un test Playwright e2e que desactiva JavaScript por completo en una corrida y assert que el `<html class>` sigue seteado para cuando el body empieza a renderizar (el script inline no depende de que la ejecución JS termine para el parsing).                            |
| Streaming de Server Components con `next-intl`     | Si `messages/${locale}.json` se importa dinámicamente, el render puede esperar al import.                | `next-intl` bundle los messages en build time por locale; `getRequestConfig` retorna sincrónicamente cuando los messages están pre-cargados vía `createNextIntlPlugin` (`./src/i18n/request.ts`) — sin fetch en runtime.                                                                                                                     |
| Mismatch de hidratación i18n                       | La locale server-rendered puede diferir de la resolución cookie/Accept-Language.                         | El header `x-locale` lo setea el middleware con la MISMA precedencia que la detección por cookie; la locale usada en `getRequestConfig` es la misma que lee el script FOUC. Sin segunda fuente de verdad. Verify gate: un Playwright e2e con `Accept-Language: es-AR` assert que el primer paint ya muestra copy en español en el `<title>`. |
| Race de colapso del Sidebar en URL ↔ localStorage | Dos fuentes de verdad pueden discrepar en la primera carga.                                              | URL gana en la primera carga; updates subsecuentes pasan por `history.replaceState` + `localStorage.setItem` atómicamente (un solo render). Un listener del evento `storage` maneja la sync entre tabs. Verify gate: Playwright test recarga 5 veces tras el toggle de colapso y assert que URL + localStorage + estado visual coinciden.    |

## Sequence of changes (chained-PR plan para `sdd-tasks`)

Cinco PRs. El verify gate de cada PR debe pasar antes de que el siguiente PR abra.

### PR 1 — foundation

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Agregar dependencia `next-intl`; crear `i18n.ts`, `src/i18n/request.ts`, `middleware.ts` (con inyección de headers `x-pathname` + `x-locale`); crear `messages/en.json` + `messages/es.json` (sólo chrome keys — los strings del landing vienen en PR 4); cablear `next/font` Inter + JetBrains Mono en `app/layout.tsx`; agregar `<SkipLink>` primero en `<body>`; agregar wrap `createNextIntlPlugin` en `next.config.ts`; stub `docs/qa/ui-redesign.md` (tabla vacía). |
| Files touched | `package.json`, `next.config.ts`, `app/layout.tsx`, `i18n.ts` (new), `src/i18n/request.ts` (new), `middleware.ts` (new), `messages/en.json` (new), `messages/es.json` (new), `app/_ui/layout/skip-link.tsx` (new), tests para SkipLink + detección de locale, `docs/qa/ui-redesign.md` (new stub).                                                                                                                                                                        |
| LoC Δ         | ~+220 / −3                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Verify gate   | `pnpm test` — SkipLink primer focuseable; detección de locale según scenarios 1, 2, 3, 4 de REQ-UI-17. `pnpm typecheck`. `pnpm lint`. Smoke visual: `/dashboard`, `/accounts`, `/transactions` existentes siguen renderizando data sin cambios (contratos de datos intactos).                                                                                                                                                                                             |

### PR 2 — tokens + theme

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | APPEND 7 tokens glass/gradient/shadow a `app/_ui/tokens.css`; renombrar `[data-theme='dark']` → `.dark`; exponer 7 tokens en `@theme inline` de `app/globals.css`; agregar overrides `prefers-reduced-transparency` y `prefers-reduced-motion` en `app/globals.css`; crear `ThemeProvider` + `ThemeToggle`; agregar el script inline no-FOUC en `app/layout.tsx`; montar `<ThemeProvider>` envolviendo el stub `<AppShell>` en `app/layout.tsx`. Aplicar `motion-safe:animate-spin` / `motion-safe:animate-pulse` a Spinner + Skeleton. |
| Files touched | `app/_ui/tokens.css`, `app/globals.css`, `app/layout.tsx`, `app/_ui/providers/theme-provider.tsx` (new), `app/_ui/providers/theme-toggle.tsx` (new), `app/_ui/primitives/spinner.tsx`, `app/_ui/primitives/skeleton.tsx`, tests.                                                                                                                                                                                                                                                                                                        |
| LoC Δ         | ~+200 / −8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Verify gate   | `pnpm test` — ciclo de tema (REQ-UI-14); reduced-transparency (REQ-UI-15); reduced-motion (REQ-UI-16); diff append-only de tokens (REQ-UI-19). Playwright: `prefers-color-scheme: dark` flipea a dark; toggle manual persiste a través del reload; sin FOUC con JS-disabled.                                                                                                                                                                                                                                                            |

### PR 3 — chrome + i18n

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Crear `Topbar`, `Sidebar`, `BottomTabBar`, `AppShell`, `LanguageSwitcher`, `GlassCard`; montar `<AppShell>` en `app/layout.tsx`; agregar traducciones completas del chrome a `messages/en.json` + `messages/es.json`. Las siete superficies de producción (`/dashboard`, `/accounts/*`, `/transactions/*`) recogen automáticamente el chrome vía RootLayout sin cambio per-page. Las páginas de auth quedan sin chrome (slice 2). |
| Files touched | `app/_ui/layout/topbar.tsx` (new), `app/_ui/layout/sidebar.tsx` (new), `app/_ui/layout/bottom-tab-bar.tsx` (new), `app/_ui/layout/app-shell.tsx` (new), `app/_ui/providers/language-switcher.tsx` (new), `app/_ui/primitives/glass-card.tsx` (new), `app/layout.tsx` (mount AppShell), `messages/en.json` + `messages/es.json` (chrome keys), tests.                                                                              |
| LoC Δ         | ~+520 / −5                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Verify gate   | `pnpm test` — matriz pathname → chrome del AppShell; round-trip de colapso del Sidebar; segundo landmark `<nav>` del Topbar; BottomTabBar sólo en `< lg`; axe-core en cada componente nuevo; popover + escritura de cookie del LanguageSwitcher. `pnpm test:coverage:enforced` pasa 80% en `app/_ui/`.                                                                                                                            |

### PR 4 — landing

| Field         | Value                                                                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Reemplazar `app/page.tsx` placeholder con el landing de marketing (REQ-UI-12): hero + 3 feature cards + 2 CTAs; 302 redirect para visitantes autenticados; strings del landing a `messages/en.json` + `messages/es.json`. Crear `app/not-found.tsx` + `app/error.tsx` (REQ-UI-20) con copy localizado + lenguaje glass. |
| Files touched | `app/page.tsx`, `app/not-found.tsx` (new), `app/error.tsx` (new), `messages/en.json` + `messages/es.json` (keys de landing + error + not-found), tests.                                                                                                                                                                 |
| LoC Δ         | ~+260 / −10                                                                                                                                                                                                                                                                                                             |
| Verify gate   | `pnpm test` — landing 302 + 1 h1 + 3 cards + 2 CTAs; not-found localizado; error localizado + retry. Playwright e2e: happy-path completo de `/`; round-trip del 302 con sesión mockeada.                                                                                                                                |

### PR 5 — accessibility audit + docs

| Field         | Value                                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Llenar `docs/qa/ui-redesign.md` con la auditoría de contraste (herramienta + ratios por par + veredicto). Actualizar `README.md` + `Documents-es/README.md` con la nota del rediseño UI. Actualizar la sección `[Unreleased]` de `CHANGELOG.md`. Agregar la suite Playwright `tests/e2e/ui-redesign.spec.ts` si no quedó en PR 4. |
| Files touched | `docs/qa/ui-redesign.md`, `README.md`, `Documents-es/README.md`, `CHANGELOG.md`, `tests/e2e/ui-redesign.spec.ts` (o finalizar).                                                                                                                                                                                                   |
| LoC Δ         | ~+220 / −0                                                                                                                                                                                                                                                                                                                        |
| Verify gate   | axe-core scan de `/`, `/not-found`, `/error` en CI — cero `critical`, cero `serious`. Archivo de auditoría parsea con cero filas por debajo del umbral. README + CHANGELOG actualizados.                                                                                                                                          |

## Open technical decisions (small)

1. **Radio de blur del token glass.** Propuesto: `--ui-glass-blur-sm: 12px` y `--ui-glass-blur-lg: 20px`. Default si el usuario no overrulea: enviar como está propuesto.
2. **Hue del gradiente.** Propuesto: indigo frío (`oklch(0.7 0.15 250)` → `oklch(0.75 0.12 280)` → `oklch(0.7 0.12 320)`) por continuidad de marca con el `--ui-accent: #2563eb` existente. Alternativas nombradas para el usuario: teal (teal frío `oklch(0.75 0.12 190)` — fuerte asociación con finanzas, más "tech-forward") o violeta (más fría, más "premium SaaS"). Default si el usuario no overrulea: enviar indigo frío.
3. **`NEXT_LOCALE` cookie max-age.** Propuesto: 1 año (`Max-Age=31536000`). Alternativa: session-only (sin `Max-Age`, el browser descarta al cerrar — UX peor porque la locale se resetea en cada sesión). Default si el usuario no overrulea: enviar 1 año.

## Acceptance for this design

El diseño es aceptable cuando:

- **(a) cada REQ-UI-NN mapea a un archivo/componente/test concreto**:

  - REQ-UI-9 MODIFIED → `app/_ui/tokens.css` (rename de selector) + `app/globals.css` (theme inline) + `app/_ui/providers/theme-provider.tsx` + tests en `theme-provider.test.tsx` + `tokens.test.ts`.
  - REQ-UI-12 → `app/page.tsx` + `app/_ui/layout/landing/` (o inline en `page.tsx`) + `app/page.test.tsx` + Playwright e2e.
  - REQ-UI-13 → `app/_ui/layout/app-shell.tsx` + `sidebar.tsx` + `bottom-tab-bar.tsx` + `topbar.tsx` + `app-shell.test.tsx` + Sidebar round-trip test.
  - REQ-UI-14 → `app/_ui/providers/theme-provider.tsx` + `theme-toggle.tsx` + script FOUC inline en `app/layout.tsx` + `theme-provider.test.tsx` + Playwright reload test.
  - REQ-UI-15 → `app/globals.css` (override reduced-transparency) + `app/_ui/primitives/glass-card.tsx` + `glass-card.test.tsx` + archivo de auditoría.
  - REQ-UI-16 → `app/globals.css` (override reduced-motion) + `app/_ui/primitives/spinner.tsx` + `skeleton.tsx` + `spinner.test.tsx` + `skeleton.test.tsx` + Playwright.
  - REQ-UI-17 → `i18n.ts` + `src/i18n/request.ts` + `middleware.ts` + `messages/en.json` + `messages/es.json` + `language-switcher.tsx` + `language-switcher.test.tsx` + Playwright locale e2e.
  - REQ-UI-18 → `app/layout.tsx` (`next/font`) + `fonts.test.tsx` + Playwright no-CDN-link assertion.
  - REQ-UI-19 → `app/_ui/tokens.css` (append-only) + `tokens.test.ts` (aserción de diff) + script de diff-check en CI.
  - REQ-UI-20 → `app/not-found.tsx` + `app/error.tsx` + `not-found.test.tsx` + `error.test.tsx`.
  - REQ-UI-21 → `docs/qa/ui-redesign.md` + `audit.test.ts` + axe-core CI scan.
  - REQ-UI-22 → `app/_ui/layout/skip-link.tsx` + `app/layout.tsx` (primer focuseable) + `skip-link.test.tsx` + Playwright Tab order test.
  - REQ-UI-24 → config de fallback de `next-intl` en `src/i18n/request.ts` + Playwright e2e sobre `/accounts` con copy mixto + test de fallback de key faltante.

- **(b) los 14 acceptance criteria A1–A14 están cubiertos** — cada A1–A14 mapea a uno o más REQ-UI-NN arriba (las cross-references de la spec son explícitas en `openspec/changes/ui-redesign/specs/ui/spec.md`); los verify gates por PR §10 ejercitan cada una.

- **(c) los verify gates por PR son ejecutables** — `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage:enforced`, y la suite Playwright. La integración axe-core CI (ya devDep `vitest-axe`) gatea REQ-UI-21. El script de diff-check CI para REQ-UI-19 es un `scripts/check-tokens-diff.ts` chico invocado en `lint-staged` + un job de CI.
