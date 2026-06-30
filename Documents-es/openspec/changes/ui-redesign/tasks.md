# Tareas — `ui-redesign` (rebanada 1)

**Cambio**: `ui-redesign` — capa de cimientos (tokens + tema + shell de navegación + andamio i18n + landing + not-found/error)
**Capacidad**: `ui`
**TDD estricto**: activo (corredor `pnpm test`, según `openspec/config.yaml`)
**Estrategia de PRs**: encadenados (5 PRs) — `Decision needed before apply: Yes` hasta que el usuario elija `stacked-to-main` o `feature-branch-chain`
**Artefactos fuente**: `openspec/changes/ui-redesign/proposal.md`, `openspec/changes/ui-redesign/specs/ui/spec.md`, `openspec/changes/ui-redesign/design.md`

## Pronóstico de carga de revisión

| Campo                            | Valor                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Líneas modificadas estimadas     | ~1300 add / ~70 del (suma entre 5 PRs; ningún PR > 520 LoC)                                               |
| Riesgo de presupuesto 400 líneas | Bajo (cada PR ≤ 520 LoC; todos muy por debajo de 400 líneas por-PR con los componentes nuevos repartidos) |
| PRs encadenados recomendados     | Sí                                                                                                        |
| División sugerida                | PR 1 cimientos → PR 2 tokens+tema → PR 3 chrome+i18n → PR 4 landing → PR 5 auditoría+docs                 |
| Estrategia de entrega            | ask-on-risk                                                                                               |
| Estrategia de cadena             | develop-only                                                                                              |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: develop-only
400-line budget risk: Low
```

**Estrategia de cadena locked (según el usuario, 2026-06-30): `develop-only`.**

Este proyecto sigue **Git Flow** según `AGENTS.md` §5.1 + §5.5: `develop` es la rama de integración (todo el trabajo completado mergea acá vía PR); `main` es solo de producción y el maintainer es quien decide y ejecuta el merge a `main`. Por lo tanto la estrategia de cadena acá es:

- Cada PR (PR 1 a PR 5) abre contra `develop` (vía `git worktree add ../gastos-personales-ui-redesign-prN -b feat/ui-redesign-prN develop`, según `AGENTS.md` §5.2).
- Cada PR mergea en `develop` una vez aprobado (squash-merge según la preferencia del proyecto).
- `main` recibe solo un PR de release después de que el usuario confirma el release (según `AGENTS.md` §5.5; el usuario debe invocar explícitamente el override §5.5.1 si quiere que el orquestrador ejecute los steps 5/6 del flujo de release).
- El prefijo de rama para los worktrees de los PRs encadenados sigue la convención §5.1: `feat/ui-redesign-foundation` → `feat/ui-redesign-tokens-theme` → `feat/ui-redesign-chrome-i18n` → `feat/ui-redesign-landing` → `feat/ui-redesign-audit-docs`. Cada uno se branchea desde `develop` y se mergea de vuelta a `develop`.

Disciplina de worktree por PR (según quirks específicos de macOS en `AGENTS.md` §9.7):

1. Desde una `develop` limpia, correr `git worktree add ../gastos-personales-ui-redesign-pr1 -b feat/ui-redesign-foundation develop`.
2. `cd ../gastos-personales-ui-redesign-pr1` y correr `pnpm install --ignore-workspace` (NO `--frozen-lockfile`) en el primer install por el hijack de `pnpm-workspace.yaml` en `$HOME`.
3. Correr `npx prisma generate` porque `--ignore-workspace` se salta los build scripts.
4. Implementar el PR según el spec; dejar que el apply-agent commitee cada task como una unidad chica y revisable.
5. Borrar cualquier `.npmrc` local del worktree (`rm .npmrc`) antes de commitear para que `lint-staged` no se atasque.
6. Push y abrir PR vía `gh pr create --base develop --title "..." --body "..."` — nunca `--base main` para los PRs de slice 1.
7. Después de que CI pase y la review apruebe, `gh pr merge --squash --delete-branch`, luego `git worktree remove`.
8. `git checkout develop && git pull` antes de spinnear el worktree del siguiente PR.

Esta disciplina mantiene cada PR revisable (≤ 520 LoC por PR, bien por debajo del budget de 400 líneas por diff que el `AGENTS.md` §5.4 lockeado por el usuario para slice 1) y rollbackable por PR. Cinco PRs a `develop`, después el usuario decide cuándo releasear a `main`.

## Tareas por PR

### PR 1 — cimientos

Agrega el andamio i18n (`next-intl` + `i18n.ts` + `src/i18n/request.ts` + `middleware.ts` + `messages/{en,es}.json` vacíos), conecta `next/font/google` Inter Variable + JetBrains Mono con exposición de variables CSS, y agrega el `<SkipLink>` primero enfocable. El lockfile se regenera y se commitea en el mismo cambio (según `AGENTS.md` raíz §5.3). Sin chrome, sin landing, sin not-found aún — esos llegan en los PR 2..5.

**Por qué ahora:** cada PR posterior depende de que `next-intl` esté disponible, de que `app/layout.tsx` tenga un locale tipado, y de que `prefers-reduced-motion`/`prefers-reduced-transparency` sean direccionables desde el mismo `<head>`. Sin los cimientos i18n+font primero, cada PR posterior requeriría una reescritura del stub.

- **T-PR1-01** — **Agregar `next-intl` a `dependencies` en `package.json` (pineado, sin caret según la política de lockfile del proyecto) y regenerar `pnpm-lock.yaml` en el mismo commit.**

  - **Path**: `package.json`, `pnpm-lock.yaml`
  - **TDD state**: N/A (config)
  - **Verify**: `pnpm install --ignore-workspace` (workaround del hijack en `AGENTS.md` §9.7) deja un árbol limpio; `cat pnpm-lock.yaml | grep -c '^  next-intl@'` devuelve `1`; `git diff --stat pnpm-lock.yaml` muestra un diff determinista contra el commit anterior (sin bumps transitivos sorpresa).
  - **Rollback**: `git revert <sha>` restaura el lockfile + la entrada de `dependencies` en un solo paso.

- **T-PR1-02** — **Crear `i18n.ts` exportando `locales`, `defaultLocale = 'en'`, y `localePrefix = 'as-needed'`.**

  - **Path**: `i18n.ts` (nuevo, root)
  - **TDD state**: N/A (export de config)
  - **Verify**: `pnpm typecheck` — `import { locales, defaultLocale, localePrefix } from './i18n';` resuelve desde `src/i18n/request.ts` y desde `middleware.ts`; test unitario de runtime asegura `defaultLocale === 'en'`.
  - **Rollback**: borrar `i18n.ts`; ningún otro archivo lo importa aún.

- **T-PR1-03** — **Crear `src/i18n/request.ts` con `getRequestConfig` que lee el locale activo desde `next/headers` (header `x-locale` seteado por middleware) e importa dinámicamente `messages/${locale}.json`.**

  - **Path**: `src/i18n/request.ts` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: test unitario con un mock de `next/headers` `headers().get('x-locale')` devolviendo `'es'` asegura que el objeto de mensajes resuelto es el contenido de `messages/es.json`; `pnpm typecheck`.
  - **Rollback**: borrar `src/i18n/request.ts`; referenciado solo por `next.config.ts` en PR 1 y por los layouts en PR 3.

- **T-PR1-04** — **Crear `middleware.ts` combinando `createMiddleware(routing)` de `next-intl/middleware` con inyección de headers `x-pathname` y `x-locale` (vía `NextResponse.next({ headers })`) para la decisión server-side de `<AppShell>`.**

  - **Path**: `middleware.ts` (nuevo, root)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: test unitario/de integración con `Accept-Language: es-AR,es;q=0.9,en;q=0.8` asegura `x-locale === 'es'` en los headers de respuesta; mismo test con `Accept-Language: en-US,en;q=0.9` asegura `'en'`; `Accept-Language: ja,fr;q=0.8` asegura `'en'` (default locked Q1); cookie `NEXT_LOCALE=en` + `Accept-Language: es-AR` asegura `'en'` (cookie gana); `x-pathname === '/'` para `GET /` y `x-pathname === '/auth/signin'` para `GET /auth/signin`.
  - **Rollback**: borrar `middleware.ts`; ninguna página depende de `x-locale`/`x-pathname` hasta que PR 3 monte `<AppShell>`.

- **T-PR1-05** — **Crear catálogos de mensajes vacíos `messages/en.json` y `messages/es.json` (objetos con los siete namespaces: `topbar`, `sidebar`, `bottomTabBar`, `themeToggle`, `languageSwitcher`, `landing`, `notFound`, `error` — las claves pueden estar ausentes, el fallback de `getRequestConfig` devuelve la cadena de la clave verbatim según REQ-UI-24).**

  - **Path**: `messages/en.json` (nuevo), `messages/es.json` (nuevo)
  - **TDD state**: N/A (datos semilla)
  - **Verify**: `pnpm test` — el test de fallback de `next-intl` de T-PR1-03 renderiza una clave presente solo en `es.json` para un usuario inglés y asegura que aparece la cadena literal de la clave (sin throw); `pnpm exec jsonlint messages/en.json messages/es.json` pasa.
  - **Rollback**: `git rm messages/{en,es}.json`.

- **T-PR1-06** — **Conectar `next/font/google` en `app/layout.tsx`: cargar Inter Variable (pesos 400, 500, 600, 700, `display: 'swap'`, `preload: true`) y JetBrains Mono (pesos 400, 500, mismas opciones), asignar a las variables CSS `--font-inter` y `--font-jb-mono` en el `<html>` raíz, y agregar `--font-sans: var(--font-inter)` + `--font-mono: var(--font-jb-mono)` al bloque `@theme inline` existente en `app/globals.css`.**

  - **Path**: `app/layout.tsx` (modificar), `app/globals.css` (modificar, agregar 2 líneas dentro de `@theme inline`)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `fonts.test.tsx` (nuevo) asegura que el HTML renderizado contiene cero `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` (REQ-UI-18 escenario 1); asegura que `getComputedStyle(documentElement).getPropertyValue('--font-inter')` no está vacío; `pnpm typecheck`; `pnpm build` tiene éxito (Next.js emite el bloque de estilo `@font-face` solo cuando la fuente es referenciada desde una página).
  - **Rollback**: revertir los dos cambios de layout; el mapeo `font-sans` en `app/globals.css` se vuelve no-op (Tailwind cae a su familia por defecto).

- **T-PR1-07** — **Crear `app/_ui/layout/skip-link.tsx` (componente server): un solo `<a href="#main-content">` visualmente oculto hasta el foco, con un `label` localizado como prop.**

  - **Path**: `app/_ui/layout/skip-link.tsx` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: `skip-link.test.tsx` asegura que el anchor se renderiza con `href="#main-content"`, que el label es el valor literal del prop, y que las utility classes `sr-only focus:not-sr-only` resuelven a visibilidad-en-foco (escaneo vitest-axe no encuentra violaciones de a11y); `pnpm typecheck`.
  - **Rollback**: borrar el archivo; nada lo referencia hasta T-PR1-08.

- **T-PR1-08** — **Montar `<SkipLink label={...}>` como primer hijo de `<body>` en `app/layout.tsx` (el target `<main id="main-content" tabIndex={-1}>` llega en PR 3 con `<AppShell>`; para PR 1 el link aún resuelve a un anchor inexistente — eso está bien, el `href` es un string estático).**

  - **Path**: `app/layout.tsx` (modificar, +1 import + 1 element)
  - **TDD state**: RED → GREEN
  - **Verify**: Playwright `tests/e2e/ui-redesign.spec.ts` (creado en PR 5; para PR 1, una aserción temporal en `skip-link.test.tsx` con `jsdom` hace el check) asegura que el primer elemento enfocable en un mount de página es el skip link; `pnpm test`.
  - **Rollback**: revertir el import + element; `<SkipLink>` queda sin referencia.

- **T-PR1-09** — **Envolver la config existente de Sentry en `next.config.ts` con `createNextIntlPlugin('./src/i18n/request.ts')`.**

  - **Path**: `next.config.ts` (modificar, +3 / −1)
  - **TDD state**: N/A (config de build)
  - **Verify**: `pnpm build` tiene éxito; el output del build loggea `next-intl plugin initialized` (o equivalente — asegurar vía `pnpm build 2>&1 | grep -q 'next-intl'`); headers CSP sin cambios.
  - **Rollback**: revertir el wrapper; sin impacto de runtime sobre el build de producción más allá de una validación i18n de build-time faltante.

- **T-PR1-10** — **Crear stub de `docs/qa/ui-redesign.md` con un encabezado y una tabla de pares-por-par vacía (columnas light + dark, cuatro filas de pares: `--ui-fg` sobre `--ui-glass-bg`, `--ui-fg-muted` sobre `--ui-glass-bg`, `--ui-accent` sobre `--ui-glass-bg`, heading grande sobre substrato de gradiente).**

  - **Path**: `docs/qa/ui-redesign.md` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: `audit.test.ts` (deliverable de PR 5; para PR 1 el test asegura que el archivo existe y el encabezado de tabla está presente); `pnpm exec markdownlint docs/qa/ui-redesign.md`.
  - **Rollback**: `git rm docs/qa/ui-redesign.md`.

- **T-PR1-11** — **Bundle de tests: escribir `i18n-request.test.ts` (despacho de locale), `middleware-headers.test.ts` (Accept-Language + cookie + `x-pathname`), `skip-link.test.tsx` (primero enfocable, axe limpio), `fonts.test.tsx` (sin link CDN, vars CSS presentes).**
  - **Path**: `src/i18n/__tests__/i18n-request.test.ts` (nuevo), `middleware-headers.test.ts` (nuevo), `app/_ui/layout/skip-link.test.tsx` (nuevo), `fonts.test.tsx` (nuevo)
  - **TDD state**: TRIANGULATE (los tests que fallan preceden al código de producción en T-PR1-03..08)
  - **Verify**: `pnpm test` — los cuatro archivos de test pasan; `pnpm test:coverage` reporta ≥ 80% en los archivos nuevos.
  - **Rollback**: `git rm <test files>`; el código de producción permanece.

### PR 2 — tokens + tema

Agrega los siete tokens glass/gradient/shadow a `app/_ui/tokens.css` (seguro byte-for-byte: las 14 variables de color preexistentes quedan intactas), renombra el selector de scope dark de `[data-theme='dark']` a `.dark` (REQ-UI-9 MODIFIED), expone los nuevos tokens en `@theme inline` de `app/globals.css`, agrega los overrides de `prefers-reduced-transparency` y `prefers-reduced-motion`, y entrega `ThemeProvider` + `ThemeToggle` + script inline sin-FOUC. `Spinner` + `Skeleton` obtienen variantes `motion-safe:` y `Button` se verifica que consume `font-sans` (sin referencia CDN).

**Por qué ahora:** el chrome (PR 3) y el landing (PR 4) renderizan sobre superficies glass; sin los tokens, la utility `bg-ui-glass-1` del chrome no resolvería. El rename del selector de dark-mode es pre-req para los tests del ciclo de tema (que aseguran que `<html class="dark">` cambia la paleta).

- **T-PR2-01** — **Agregar las 7 nuevas CSS custom properties dentro del bloque `@layer base { :root { ... } }` de `app/_ui/tokens.css` (justo después de la línea existente `--ui-font-bold`, antes de las llaves de cierre): `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur-sm` (12px), `--ui-glass-blur-lg` (20px), `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`. Usar los valores de design §Tokens. Actualizar el comentario docstring del archivo para mencionar los nuevos tokens y el nombre del cambio `ui-redesign`.**

  - **Path**: `app/_ui/tokens.css` (modificar, append-only)
  - **TDD state**: N/A (el append se verifica por el test de aserción de diff T-PR2-13, RED primero)
  - **Verify**: `tokens.test.ts` (creado en T-PR2-13) lee el archivo y asegura que las 7 nuevas variables están declaradas; `git diff HEAD -- app/_ui/tokens.css` muestra solo líneas `+` para los nuevos tokens y la actualización del docstring; ninguna línea `-` contra las 14 variables de color existentes.
  - **Rollback**: `git revert <sha>` remueve el bloque agregado en un commit; las 14 variables existentes quedan intactas.

- **T-PR2-02** — **Renombrar el wrapper del selector de scope dark en `app/_ui/tokens.css` de `[data-theme='dark']` a `.dark` (cambio de 1 línea; las 14 declaraciones de valores de color en dark-mode dentro del bloque quedan byte-for-byte sin cambios según REQ-UI-19 escenario 2).**

  - **Path**: `app/_ui/tokens.css` (modificar, 1 línea)
  - **TDD state**: N/A (rename mecánico)
  - **Verify**: `git diff HEAD -- app/_ui/tokens.css` muestra una sola línea `-[data-theme='dark'] {` y una sola línea `+.dark {`; `tokens.test.ts` (T-PR2-13) asegura que el archivo contiene `.dark {` y no `[data-theme='dark'] {`.
  - **Rollback**: revertir el cambio de 1 línea.

- **T-PR2-03** — **Exponer los 7 nuevos tokens dentro del bloque `@theme inline { ... }` de `app/globals.css` para que Tailwind v4 genere utilities `bg-ui-glass-1`, `bg-ui-glass-2`, `shadow-glass`, `from-ui-gradient-from`, `via-ui-gradient-via`, `to-ui-gradient-to`, `border-ui-glass-border`, `backdrop-blur-[var(--ui-glass-blur-sm)]` (o equivalente). Agregar `--ui-glass-bg-solid` (alpha 1.0) para el fallback de reduced-transparency.**

  - **Path**: `app/globals.css` (modificar, +~20 líneas dentro de `@theme inline`)
  - **TDD state**: N/A
  - **Verify**: `pnpm build` emite las nuevas clases utility; `tokens.test.ts` greps el CSS construido por selectores `bg-ui-glass` y `shadow-glass`.
  - **Rollback**: revertir las adiciones a `@theme inline`.

- **T-PR2-04** — **Agregar el override `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` al final de `app/globals.css`.**

  - **Path**: `app/globals.css` (modificar, +6 líneas)
  - **TDD state**: RED → GREEN
  - **Verify**: `reduced-motion.test.tsx` (nuevo) renderiza un `Spinner` con un mock de `matchMedia('(prefers-reduced-motion: reduce)')` devolviendo `{ matches: true }` y asegura `getComputedStyle(spinner).animationName === 'none'`; mismo para `Skeleton`.
  - **Rollback**: revertir el bloque `@media`.

- **T-PR2-05** — **Agregar el override `@media (prefers-reduced-transparency: reduce) { .bg-ui-glass-1, .bg-ui-glass-2 { backdrop-filter: none !important; background-color: var(--ui-glass-bg-solid) !important; } }` a `app/globals.css`.**

  - **Path**: `app/globals.css` (modificar, +5 líneas)
  - **TDD state**: RED → GREEN
  - **Verify**: `glass-card.test.tsx` (creado en PR 3, pero el override CSS es testeable en PR 2 con un test de `<div className="bg-ui-glass-1">` hecho a mano) asegura `getComputedStyle(div).backdropFilter === 'none'` bajo reduced-transparency y `getComputedStyle(div).backgroundColor` resuelve al valor sólido alpha-1.
  - **Rollback**: revertir el bloque `@media`.

- **T-PR2-06** — **Crear `app/_ui/providers/theme-provider.tsx` (componente client): `useTheme()` expone `{ mode, resolved, setMode, cycle }`; el orden del cycle es `system → light → dark → system`; se suscribe a `matchMedia('(prefers-color-scheme: dark)')` solo cuando `mode === 'system'`; en mount NO escribe a `<html>` (el script inline de FOUC es dueño de eso) — lee la clase para sembrar su estado.**

  - **Path**: `app/_ui/providers/theme-provider.tsx` (nuevo)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `theme-provider.test.tsx` (nuevo) asegura (1) `cycle()` llamado 3× sobre un estado inicial `system` produce valores `'light'`, `'dark'`, `'system'` en `localStorage['ui.theme']` en orden; (2) `setMode('dark')` escribe `'dark'` a `localStorage`; (3) bajo `mode === 'system'`, el provider adjunta un listener `matchMedia` y lo desadjunta en unmount; (4) `vitest-axe` no encuentra violaciones de a11y en un render de `<ThemeProvider><div/></ThemeProvider>`.
  - **Rollback**: borrar el archivo; nada lo importa hasta T-PR2-09.

- **T-PR2-07** — **Agregar el `<script>` inline bloqueante sin-FOUC al `<head>` de `app/layout.tsx`. El script lee `localStorage['ui.theme']` → `matchMedia('(prefers-color-scheme: dark)')` → `'light'` (en esa precedencia) y agrega `class="dark"` a `document.documentElement` cuando el dark debe estar activo. Sin `defer`, sin `async`. El script es JavaScript plano, totalmente sincrónico.**

  - **Path**: `app/layout.tsx` (modificar, +1 bloque `<script dangerouslySetInnerHTML>` en `<head>`)
  - **TDD state**: RED → GREEN
  - **Verify**: `fouc-script.test.tsx` (nuevo) monta el layout en JSDOM con `matchMedia = (q) => ({ matches: q.includes('dark'), ... })`, sin `localStorage`, asegura `documentElement.classList.contains('dark')`; mismo test con `localStorage['ui.theme'] = 'light'` asegura que NO; mismo test con `localStorage['ui.theme'] = 'dark'` asegura que sí.
  - **Rollback**: remover el bloque `<script>`.

- **T-PR2-08** — **Crear `app/_ui/providers/theme-toggle.tsx` (componente client): un `<button type="button" aria-pressed={mode !== 'system'} aria-label={labels[current]}>` que llama a `cycle()` en click; renderiza un glyph inline + label en `≥ sm`, solo glyph en `< sm`.**

  - **Path**: `app/_ui/providers/theme-toggle.tsx` (nuevo)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `theme-toggle.test.tsx` (nuevo) asegura que el botón es alcanzable por `Tab`; el click llama a `cycle()` y actualiza `aria-pressed`; en tres clicks el `localStorage['ui.theme']` persistido cicla por `light`/`dark`/`system`; `vitest-axe` limpio.
  - **Rollback**: borrar el archivo; montado en PR 3.

- **T-PR2-09** — **Montar `<ThemeProvider>` envolviendo `{children}` en `app/layout.tsx` (entre `<SkipLink>` y los children). El provider no renderiza DOM propio.**

  - **Path**: `app/layout.tsx` (modificar, +1 import + 1 element)
  - **TDD state**: RED → GREEN
  - **Verify**: `pnpm test` (los tests existentes siguen pasando) + `pnpm typecheck` + smoke: `pnpm build` tiene éxito; un render rápido en `app/page.tsx` de `useTheme()` devuelve `{ mode: 'system' }` en la primera visita (solo para test, removido antes de PR 4).
  - **Rollback**: remover el wrapper.

- **T-PR2-10** — **Modificar `app/_ui/primitives/spinner.tsx` para usar `motion-safe:animate-spin` (era `animate-spin`) y para renderizar el texto literal `Cargando…` / `Loading…` (resuelto vía `useTranslations('spinner')`) bajo `prefers-reduced-motion: reduce`.**

  - **Path**: `app/_ui/primitives/spinner.tsx` (modificar, +4 / −1)
  - **TDD state**: RED → GREEN
  - **Verify**: `spinner.test.tsx` (nuevo) con mock de `matchMedia('(prefers-reduced-motion: reduce)')` devolviendo `{ matches: true }` asegura que aparece el texto estático; mismo test sin el mock asegura `getComputedStyle(spinner).animationName === 'spin'`.
  - **Rollback**: revertir el prefijo `motion-safe:` y el texto condicional.

- **T-PR2-11** — **Modificar `app/_ui/primitives/skeleton.tsx` para usar `motion-safe:animate-pulse` (era `animate-pulse`).**

  - **Path**: `app/_ui/primitives/skeleton.tsx` (modificar, +1 / −1)
  - **TDD state**: RED → GREEN
  - **Verify**: `skeleton.test.tsx` (nuevo) con mock de reduced-motion asegura `getComputedStyle(skeleton).animationName === 'none'`; sin el mock asegura `'pulse'`.
  - **Rollback**: revertir el prefijo `motion-safe:`.

- **T-PR2-12** — **Auditar `app/_ui/primitives/button.tsx` y reemplazar cualquier referencia CDN de fuente restante (ej. `font-['Inter']`, literales `font-family` crudos) con la utility `font-sans`, para que la única referencia a Inter sea la preloaded de PR 1.**

  - **Path**: `app/_ui/primitives/button.tsx` (modificar, 0–2 líneas)
  - **TDD state**: N/A (mecánico; verificar con grep)
  - **Verify**: `pnpm exec grep -rE "fonts\\.googleapis|Inter['\\\"],\\s*['\\\"]?sans" app/` devuelve 0 matches (excepto `app/layout.tsx` que legítimamente importa de `next/font/google`); `pnpm typecheck`.
  - **Rollback**: revertir la(s) línea(s).

- **T-PR2-13** — **Bundle de tests: escribir `tokens.test.ts` (asegura las 7 nuevas variables presentes + selector de scope dark `.dark` + `git diff` solo tiene líneas `+` contra las 14 variables de color existentes), `fouc-script.test.tsx`, `reduced-motion.test.tsx`, `glass-card-css.test.tsx` (el test CSS de reduced-transparency de T-PR2-05), `theme-provider.test.tsx` (de T-PR2-06), `theme-toggle.test.tsx` (de T-PR2-08), `spinner.test.tsx` (de T-PR2-10), `skeleton.test.tsx` (de T-PR2-11).**
  - **Path**: `app/_ui/tokens.test.ts` (nuevo), `app/_ui/fouc-script.test.tsx` (nuevo), `app/_ui/reduced-motion.test.tsx` (nuevo), `app/_ui/glass-card-css.test.tsx` (nuevo), `app/_ui/providers/theme-provider.test.tsx` (nuevo), `app/_ui/providers/theme-toggle.test.tsx` (nuevo), `app/_ui/primitives/spinner.test.tsx` (nuevo), `app/_ui/primitives/skeleton.test.tsx` (nuevo)
  - **TDD state**: TRIANGULATE (todos RED antes de sus contrapartes GREEN en T-PR2-01..12)
  - **Verify**: `pnpm test` — los ocho archivos de test pasan; `pnpm test:coverage:enforced` se mantiene ≥ 80% en `app/_ui/`.
  - **Rollback**: `git rm <test files>`.

### PR 3 — chrome + i18n

Construye el shell de navegación: `Topbar`, `Sidebar` (client; el estado de collapse hace round-trip por URL + `localStorage`), `BottomTabBar`, `AppShell` (decide el chrome desde `x-pathname` + `x-locale`), `LanguageSwitcher` (popover en `< sm`, inline en `≥ sm`), y `GlassCard`. Monta `<AppShell>` en `app/layout.tsx`. Las siete superficies de producción obtienen el chrome automáticamente vía RootLayout — sin edición por página.

**Por qué ahora:** el landing (PR 4) renderiza dentro del chrome, y el not-found/error (PR 4) comparten el mismo Topbar. Sin `<AppShell>` montado, el landing tendría que inline su propio wrapper.

- **T-PR3-01** — **Crear `app/_ui/primitives/glass-card.tsx` (componente server): polimórfico `<GlassCard as?: 'div' | 'article' | 'section' tone?: 'glass-1' | 'glass-2'>` que mapea `tone` a `bg-ui-glass-1` o `bg-ui-glass-2` + `backdrop-blur-[var(--ui-glass-blur-sm/lg)]` + `shadow-glass`. Bajo reduced-transparency, el override CSS de PR 2 (T-PR2-05) reemplaza el blur por un sólido.**

  - **Path**: `app/_ui/primitives/glass-card.tsx` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: `glass-card.test.tsx` (nuevo, completa el stub de PR 2) asegura que la variante `tone='glass-2'` se renderiza con el blur mayor; bajo mock de reduced-transparency `getComputedStyle(card).backdropFilter === 'none'`; `vitest-axe` limpio; contraste ≥ 4.5:1 documentado en `docs/qa/ui-redesign.md` (PR 5).
  - **Rollback**: borrar el archivo.

- **T-PR3-02** — **Crear `app/_ui/layout/topbar.tsx` (componente server): `<header>` con tres slots flex-row (`left` = brand label, `center` = placeholder de page-context, `right` = `<ThemeToggle/>` + `<LanguageSwitcher/>` de PR 1/2). Incluye un `<nav aria-label="User">` envolviendo el slot right. Altura mobile-first de 56 px.**

  - **Path**: `app/_ui/layout/topbar.tsx` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: `topbar.test.tsx` (nuevo) asegura que se renderizan un `<header>` y un `<nav aria-label="User">`; los children del slot right aparecen; `vitest-axe` limpio; `pnpm typecheck`.
  - **Rollback**: borrar el archivo.

- **T-PR3-03** — **Crear `app/_ui/layout/sidebar.tsx` (componente client): `<aside>` colapsable conteniendo `<nav aria-label="Primary">` con un `<ul>` de `links` (`dashboard`, `accounts`, `transactions` para slice 1). Toggle de collapse: `<button aria-expanded aria-controls="primary-nav-list">` con un chevron persistente. El estado de collapse hace round-trip por `?sidebar=collapsed` (URL fuente de verdad en first load) y `localStorage['ui.sidebarCollapsed']` (navegaciones posteriores). Oculto en `< lg` vía `hidden lg:block`.**

  - **Path**: `app/_ui/layout/sidebar.tsx` (nuevo)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `sidebar.test.tsx` (nuevo) asegura (1) el round-trip: click collapse → URL gana `?sidebar=collapsed` Y `localStorage['ui.sidebarCollapsed'] === 'true'`; reload → renderiza colapsado; navega a `/accounts` → aún colapsado; click de nuevo → URL quita el param Y `localStorage === 'false'`; (2) dos landmarks `<nav>` distintos presentes (del Topbar + del Sidebar); (3) `vitest-axe` limpio.
  - **Rollback**: borrar el archivo; sin caller aún.

- **T-PR3-04** — **Crear `app/_ui/layout/bottom-tab-bar.tsx` (componente server): `<nav aria-label="Primary">` fijo al fondo en `< lg` (Tailwind `lg:hidden`). Slice 1 entrega 3 destinos activos (`dashboard`, `accounts`, `transactions`) y 2 slots reservados renderizados como placeholders `aria-disabled="true"` (según design §Component surface — decisión abierta en PR 3 es renderizarlos, no omitirlos, para que el layout visual quede final para slice 1). Usa padding `safe-area-inset-bottom` para iOS.**

  - **Path**: `app/_ui/layout/bottom-tab-bar.tsx` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: `bottom-tab-bar.test.tsx` (nuevo) asegura que se renderizan 5 destinos, un `<nav aria-label="Primary">` distinto del user-nav del Topbar, cada destino es `≥ 44×44 px` (asegurar vía `getBoundingClientRect`); `vitest-axe` limpio.
  - **Rollback**: borrar el archivo.

- **T-PR3-05** — **Crear `app/_ui/providers/language-switcher.tsx` (componente client): variante popover en `< sm` (un solo botón icon + popover con focus-trap conteniendo `Español` / `English`); botones segmentados inline en `≥ sm` (`aria-pressed={activeLocale === code}`). Al seleccionar: setear cookie `NEXT_LOCALE` (`Max-Age=31536000` de 1 año, `SameSite=Lax`, `Path=/`, `Secure` en prod según default de decisión abierta §11.3) y llamar a `router.refresh()`.**

  - **Path**: `app/_ui/providers/language-switcher.tsx` (nuevo)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `language-switcher.test.tsx` (nuevo) asegura (1) en `< sm` (mock de `matchMedia`) el popover se abre en click y lista `Español` + `English`; (2) seleccionar `English` escribe `document.cookie` conteniendo `NEXT_LOCALE=en` y llama a `router.refresh` (mockeado); (3) en `≥ sm` los dos botones inline se renderizan con `aria-pressed` flipeando; (4) `vitest-axe` limpio.
  - **Rollback**: borrar el archivo; sin caller aún.

- **T-PR3-06** — **Crear `app/_ui/layout/app-shell.tsx` (componente server): lee `headers().get('x-pathname')` y `headers().get('x-locale')`; renderiza condicionalmente Topbar + Sidebar (≥ `lg`) / BottomTabBar (< `lg`) según la matriz de pathname en design §Architecture (landing → solo Topbar, sin sidebar/bottom; `/auth/*` → sin chrome; `/dashboard`, `/accounts/*`, `/transactions/*` → chrome completo; not-found + error → solo Topbar). Envuelve `children` en `<main id="main-content" tabIndex={-1}>` (el target del skip-link).**

  - **Path**: `app/_ui/layout/app-shell.tsx` (nuevo)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `app-shell.test.tsx` (nuevo) asegura la matriz de chrome: `x-pathname=/` → solo Topbar; `x-pathname=/dashboard` → Topbar + Sidebar; `x-pathname=/auth/signin` → sin chrome; `x-pathname=/this-does-not-exist` → solo Topbar; `x-pathname=/dashboard` + viewport mockeado `< lg` → Topbar + BottomTabBar (sin Sidebar); el `<main id="main-content" tabIndex={-1}>` envuelve `children`.
  - **Rollback**: borrar el archivo.

- **T-PR3-07** — **Montar `<AppShell>` en `app/layout.tsx` (entre `<ThemeProvider>` y el contenido de children existente). El layout queda: `<html><head><FOUC script/></head><body><SkipLink/><ThemeProvider><AppShell>{children}</AppShell></ThemeProvider></body></html>`. El atributo `lang` en `<html>` se setea desde el header `x-locale` (leído vía `headers().get('x-locale')` en el RootLayout).**

  - **Path**: `app/layout.tsx` (modificar, +2 imports + wrap estructural; +1 atributo en `<html>`)
  - **TDD state**: N/A (integración)
  - **Verify**: `pnpm build` tiene éxito; un e2e de Playwright (agregado en PR 5) renderiza `/` y asegura `<html lang="es">` para `Accept-Language: es-AR`; `pnpm test` (todos los tests previos pasan) + `pnpm typecheck`; smoke: `pnpm dev` + visita manual a `/`, `/dashboard`, `/auth/signin` muestra el chrome correcto.
  - **Rollback**: revertir las ediciones de layout.

- **T-PR3-08** — **Agregar las traducciones del chrome a `messages/en.json` y `messages/es.json`: `topbar.brand`, `topbar.userNav.aria`, `sidebar.primary.aria`, `sidebar.collapse.aria`, `sidebar.links.dashboard|accounts|transactions`, `bottomTabBar.primary.aria`, `bottomTabBar.links.dashboard|accounts|transactions|reserved1|reserved2`, `themeToggle.labels.system|light|dark`, `themeToggle.aria`, `languageSwitcher.labels.es|en|aria`, `languageSwitcher.popover.aria`.**

  - **Path**: `messages/en.json` (modificar), `messages/es.json` (modificar)
  - **TDD state**: N/A (datos semilla)
  - **Verify**: `pnpm test` — `i18n-request.test.ts` (T-PR1-03) re-asegura que las claves resuelven a strings no vacíos en ambos catálogos; `pnpm exec jsonlint messages/{en,es}.json` pasa; el test e2e de Playwright de PR 5 asegura que el texto de brand del Topbar visible coincide con `topbar.brand` para cada locale.
  - **Rollback**: revertir las ediciones de JSON.

- **T-PR3-09** — **Bundle de tests: escribir `app-shell.test.tsx` (de T-PR3-06), `sidebar.test.tsx` (de T-PR3-03), `topbar.test.tsx` (de T-PR3-02), `bottom-tab-bar.test.tsx` (de T-PR3-04), `language-switcher.test.tsx` (de T-PR3-05), `glass-card.test.tsx` (de T-PR3-01).**
  - **Path**: `app/_ui/layout/app-shell.test.tsx` (nuevo), `app/_ui/layout/sidebar.test.tsx` (nuevo), `app/_ui/layout/topbar.test.tsx` (nuevo), `app/_ui/layout/bottom-tab-bar.test.tsx` (nuevo), `app/_ui/providers/language-switcher.test.tsx` (nuevo), `app/_ui/primitives/glass-card.test.tsx` (nuevo)
  - **TDD state**: TRIANGULATE
  - **Verify**: `pnpm test:coverage:enforced` pasa 80% en `app/_ui/`; `pnpm lint` limpio; `pnpm typecheck` limpio.
  - **Rollback**: `git rm <test files>`.

### PR 4 — landing

Reemplaza el placeholder `app/page.tsx` con el landing de marketing (REQ-UI-12): hero + exactamente 3 feature cards + exactamente 2 CTAs; redirect 302 para visitantes autenticados; copy Spanish-first vía `next-intl`. Crea `app/not-found.tsx` + `app/error.tsx` en el nuevo lenguaje visual (REQ-UI-20).

**Por qué ahora:** el chrome y los tokens están en su lugar; el landing es la recompensa visible para el usuario que el maintainer nombró en el Why del proposal ("esto da asco" — el tono emocional). El not-found + error cierran el gap de REQ-UI-20 del spec.

- **T-PR4-01** — **Modificar `app/page.tsx`: al tope del Server Component, llamar a `auth()` y `if (session) redirect('/dashboard')` (`redirect` de Next.js emite 302 server-side; `permanentRedirect` NO se usa porque el estado de auth es dinámico). El redirect precede a cualquier render JSX.**

  - **Path**: `app/page.tsx` (modificar, +3 / −2)
  - **TDD state**: RED → GREEN
  - **Verify**: `app/page.test.tsx` (nuevo, con `auth()` mockeado devolviendo una session) asegura que `redirect('/dashboard')` fue llamado y el status de respuesta es `302`; mismo test con `auth()` devolviendo `null` NO redirige; `pnpm typecheck`.
  - **Rollback**: revertir las 3 líneas.

- **T-PR4-02** — **Reemplazar el body placeholder `<h1>gastos-personales</h1>` en `app/page.tsx` con el hero de marketing: un `<h1>` value prop localizado vía `getTranslations('landing')`, un fondo con gradiente (`bg-gradient-to-br from-ui-gradient-from via-ui-gradient-via to-ui-gradient-to`), y una glass card alojando el copy del hero.**

  - **Path**: `app/page.tsx` (modificar, +~40 / −5)
  - **TDD state**: RED → GREEN
  - **Verify**: `app/page.test.tsx` (TRIANGULATE) asegura que el body de respuesta contiene exactamente un `<h1>` y el texto del hero coincide con `landing.hero.title` para el locale activo; `pnpm typecheck`.
  - **Rollback**: revertir el body.

- **T-PR4-03** — **Agregar exactamente 3 feature cards a `app/page.tsx`, cada una como un `<GlassCard as="article" tone="glass-1">` conteniendo un heading + body copy desde `landing.features.{one,two,three}.{title,body}`. Las cards colapsan a una sola columna debajo de Tailwind `md`.**

  - **Path**: `app/page.tsx` (modificar, +~50)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `app.page.test.tsx` TRIANGULATE-2 asegura que la respuesta contiene exactamente 3 elementos con clase `feature-card` (o `data-component="feature-card"`); `vitest-axe` limpio en la sección.
  - **Rollback**: revertir la adición.

- **T-PR4-04** — **Agregar exactamente 2 `<a>` CTAs a `app/page.tsx`: `Crear cuenta` → `/auth/register` y `Iniciar sesión` → `/auth/signin`, con labels desde `landing.cta.{primary,secondary}`. Cada uno renderizado como un `Button` con el `tone` correcto (primary = filled accent, secondary = outline).**

  - **Path**: `app/page.tsx` (modificar, +~20)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `app.page.test.tsx` TRIANGULATE-3 asegura que la respuesta contiene exactamente 2 `<a>` con `href="/auth/register"` y `href="/auth/signin"`; los labels visibles son `Crear cuenta` / `Iniciar sesión` para `es`; para `en` los labels son `Create account` / `Sign in`; `vitest-axe` limpio (touch targets ≥ 44×44).
  - **Rollback**: revertir la adición.

- **T-PR4-05** — **Agregar las claves de landing + not-found + error a `messages/en.json` y `messages/es.json`: `landing.hero.title`, `landing.hero.subtitle`, `landing.features.{one,two,three}.{title,body}`, `landing.cta.{primary,secondary}`, `notFound.title`, `notFound.body`, `notFound.cta`, `notFound.documentTitle`, `error.title`, `error.body`, `error.retry`, `error.documentTitle`.**

  - **Path**: `messages/en.json` (modificar), `messages/es.json` (modificar)
  - **TDD state**: N/A
  - **Verify**: `pnpm exec jsonlint messages/{en,es}.json`; el `i18n-request.test.ts` existente (T-PR1-03) re-asegura que las claves resuelven; `pnpm typecheck`.
  - **Rollback**: revertir las ediciones de JSON.

- **T-PR4-06** — **Crear `app/not-found.tsx` (scope root): renderiza en el nuevo lenguaje visual (glass card sobre substrato de gradiente), copy localizada vía `getTranslations('notFound')`, un CTA `<a href="/">` con label desde `notFound.cta`, exporta un objeto `metadata` con `title: t('notFound.documentTitle')`. Incluye un landmark `<main>`.**

  - **Path**: `app/not-found.tsx` (nuevo)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `not-found.test.tsx` (nuevo) renderiza con locale `es` mockeado y asegura que el status de respuesta es `404`, el body contiene `No encontrado`, el `href="/"` del CTA resuelve, el `<title>` coincide con `notFound.documentTitle`, y un `<main>` está presente; mismo test con locale `en` asegura `Not found`; `vitest-axe` limpio.
  - **Rollback**: `git rm app/not-found.tsx`; el `app/not-found.tsx` legacy no está presente, así que el archivo es una creación limpia.

- **T-PR4-07** — **Crear `app/error.tsx` (scope root, directiva `'use client'` requerida por Next.js para `reset()`): renderiza en el nuevo lenguaje visual, copy localizada vía `useTranslations('error')`, un retry `<button onClick={() => reset()}>` con label desde `error.retry`, un landmark `<main>`. La página NO debe incluir el literal legacy `Something went wrong`.**

  - **Path**: `app/error.tsx` (nuevo)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `error.test.tsx` (nuevo) renderiza con locale `es` mockeado, asegura que el body contiene `Error` + un botón de retry llamando a `reset()` (mockeado), el `<title>` coincide con `error.documentTitle`, un `<main>` está presente; grepear la fuente por el literal legacy `Something went wrong` — `git grep -n "Something went wrong" app/error.tsx` devuelve 0; `vitest-axe` limpio.
  - **Rollback**: `git rm app/error.tsx`.

- **T-PR4-08** — **Bundle de tests: escribir `app/page.test.tsx` (302 + 1 h1 + 3 cards + 2 CTAs), `not-found.test.tsx`, `error.test.tsx`. Agregar un baseline `__snapshots__/` para la estructura HTML del landing (para que un cambio accidental futuro al conteo de cards o CTAs rompa el snapshot).**
  - **Path**: `app/page.test.tsx` (nuevo), `app/not-found.test.tsx` (nuevo), `app/error.test.tsx` (nuevo), `app/__snapshots__/page.test.tsx.snap` (nuevo)
  - **TDD state**: TRIANGULATE
  - **Verify**: `pnpm test` — todos los tests pasan incluyendo el snapshot; `pnpm test:coverage:enforced` se mantiene ≥ 80%; `pnpm typecheck`.
  - **Rollback**: `git rm <test files>`.

### PR 5 — auditoría de accesibilidad + docs

Llena `docs/qa/ui-redesign.md` con la auditoría de contraste (herramienta + ratios por-par + veredicto) para ambos temas. Actualiza `README.md` + `Documents-es/README.md` con la nota de ui-redesign. Actualiza la sección `[Unreleased]` de `CHANGELOG.md`. Finaliza la suite Playwright `tests/e2e/ui-redesign.spec.ts` (el archivo de test fue scaffolded en PR 1 como placeholder; este PR agrega las aserciones).

**Por qué ahora:** REQ-UI-21 manda una auditoría de contraste registrada como deliverable del verify-gate. Las actualizaciones de README + CHANGELOG son los hooks de documentación mandatorios por el proyecto (`AGENTS.md` §5.4 + §5.5). Sin la auditoría y los hooks de docs, la rebanada no es entregable según las convenciones propias del proyecto.

- **T-PR5-01** — **Llenar `docs/qa/ui-redesign.md`: un encabezado nombrando la herramienta usada (`@axe-core/cli` + spot-checks manuales según design §Testing strategy), la tabla de ratios de contraste por-par (columnas light + dark, cuatro filas de pares: `--ui-fg` sobre `--ui-glass-bg`, `--ui-fg-muted` sobre `--ui-glass-bg`, `--ui-accent` sobre `--ui-glass-bg`, heading grande sobre substrato de gradiente), la tabla de re-auditoría de reduced-transparency (los mismos pares bajo `prefers-reduced-transparency: reduce`), y una línea `## Verdict` declarando `PASS` solo cuando cada fila está por encima del threshold (4.5:1 texto normal, 3:1 texto grande / UI). Espejar el archivo en `Documents-es/docs/qa/ui-redesign.md` en el mismo commit según `AGENTS.md` §13.3.**

  - **Path**: `docs/qa/ui-redesign.md` (modificar), `Documents-es/docs/qa/ui-redesign.md` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: `audit.test.ts` (nuevo) parsea la tabla markdown y asegura que cada ratio de fila está por encima del threshold para su categoría; `pnpm exec markdownlint docs/qa/ui-redesign.md`; el mirror español existe en `Documents-es/docs/qa/ui-redesign.md` y es byte-for-byte el mismo contenido traducido (prosa) — verificar con `diff <(head -1 docs/qa/ui-redesign.md) <(head -1 Documents-es/docs/qa/ui-redesign.md)` devolviendo no-vacío (difieren en idioma pero la estructura coincide).
  - **Rollback**: revertir el markdown + el mirror.

- **T-PR5-02** — **Crear `tests/e2e/ui-redesign.spec.ts` (Playwright): escenarios — (a) `/` un-authed → 200 + 1 h1 + 3 feature cards + 2 CTAs con `Crear cuenta` para `es-AR`; (b) `/` authed → 302 → `/dashboard`; (c) `/dashboard` en `1280×800` muestra `Topbar` + `Sidebar`, no `BottomTabBar`; (d) `/dashboard` en `375×812` muestra `Topbar` + `BottomTabBar`, no `Sidebar`; (e) `prefers-reduced-transparency: reduce` remueve `backdrop-filter` en `GlassCard`; (f) `prefers-reduced-motion: reduce` → `Spinner`/`Skeleton` no tienen `animation-name`; (g) el theme toggle persiste `localStorage['ui.theme']` entre reloads; (h) cookie `NEXT_LOCALE=en` + `Accept-Language: es-AR` → copy en inglés; (i) el skip link es el primero enfocable en `/`, `/dashboard`, `/this-does-not-exist`; (j) round-trip de collapse del sidebar (URL + `localStorage` + visual).**

  - **Path**: `tests/e2e/ui-redesign.spec.ts` (nuevo)
  - **TDD state**: N/A (suite de integración, e2e)
  - **Verify**: `pnpm exec playwright test tests/e2e/ui-redesign.spec.ts` — los 10 escenarios pasan; el server local (`pnpm dev` o `pnpm build && pnpm start`) se requiere para el run e2e.
  - **Rollback**: `git rm tests/e2e/ui-redesign.spec.ts`.

- **T-PR5-03** — **Actualizar `README.md` (fuente en inglés) con una nota de un párrafo `## UI redesign (slice 1)` cubriendo: tokens de glassmorphism + gradient, tema de triple estado, i18n EN/ES vía `next-intl`, shell de nav Topbar + Sidebar (≥ `lg`) + BottomTabBar (< `lg`), el landing de marketing en `/` con redirect 302 para visitantes autenticados, y la decisión locked de que `signin`/`register`/`balance-widget` están diferidos a las rebanadas 2/3.**

  - **Path**: `README.md` (modificar, +~12 líneas)
  - **TDD state**: N/A (docs)
  - **Verify**: `pnpm exec markdownlint README.md`; el encabezado de sección `## UI redesign (slice 1)` está presente (`grep -c '^## UI redesign (slice 1)' README.md` devuelve 1).
  - **Rollback**: revertir la adición.

- **T-PR5-04** — **Actualizar `Documents-es/README.md` (mirror en español) con una sección `## Rediseño de UI (rebanada 1)` que es una traducción fiel de la prosa de T-PR5-03 (preserva IDs de REQ, file paths, code blocks verbatim según `AGENTS.md` §13.4). Ambos archivos aterrizan en el mismo commit.**

  - **Path**: `Documents-es/README.md` (modificar, +~12 líneas)
  - **TDD state**: N/A (docs)
  - **Verify**: `pnpm exec markdownlint Documents-es/README.md`; el encabezado de sección es `## Rediseño de UI (rebanada 1)`; sin caracteres chinos en ningún lugar del archivo (chequeo de drift según `AGENTS.md` §3).
  - **Rollback**: revertir la adición.

- **T-PR5-05** — **Actualizar la sección `## [Unreleased]` de `CHANGELOG.md`: agregar una subsección `### Added` listando los siete tokens glass/gradient, los componentes `ThemeProvider` + `ThemeToggle` + `LanguageSwitcher`, el shell de navegación (`Topbar` + `Sidebar` + `BottomTabBar`), el andamio i18n `next-intl` con catálogos EN/ES, el landing de marketing en `/`, y el root `not-found.tsx` + `error.tsx`. Agregar una subsección `### Changed` listando el rename del selector de scope dark (`[data-theme='dark']` → `.dark`) y la variante `motion-safe:` de `Spinner`/`Skeleton`. Sin bump de versión aún (el flujo de release es `develop` → `main` según `AGENTS.md` §5.5).**

  - **Path**: `CHANGELOG.md` (modificar, +~10 líneas bajo `## [Unreleased]`)
  - **TDD state**: N/A (docs)
  - **Verify**: `pnpm exec markdownlint CHANGELOG.md`; la sección `## [Unreleased]` contiene una subsección `### Added` y una `### Changed`; la versión de `package.json` sin cambios (`grep '"version"' package.json` sigue reportando `0.4.0`).
  - **Rollback**: revertir la adición.

- **T-PR5-06** — **Bundle de tests: escribir `audit.test.ts` (parsea la tabla de `docs/qa/ui-redesign.md` y asegura que cada fila está por encima del threshold), `e2e-smoke.test.ts` (wrapper Playwright amigable con Vitest que importa `tests/e2e/ui-redesign.spec.ts` para mantener la cobertura de CI al 100% de la superficie de test del proyecto), y un run final de `pnpm test:coverage:enforced`.**
  - **Path**: `audit.test.ts` (nuevo), `tests/e2e/e2e-smoke.test.ts` (nuevo)
  - **TDD state**: RED → GREEN
  - **Verify**: `pnpm test:coverage:enforced` pasa 80% en `app/_ui/`, `app/page.tsx`, `app/not-found.tsx`, `app/error.tsx`; `pnpm lint` limpio; `pnpm typecheck` limpio; `pnpm exec playwright test` limpio.
  - **Rollback**: `git rm <test files>`.

## Riesgos cross-PR para la fase apply

El agente `sdd-apply` DEBE mitigar estos por su cuenta; no son abordados por la lista de tareas de arriba porque cortan entre PRs.

- **R-apply-1 — Slip de contraste glass × dark-mode (REQ-UI-21).** Los 7 tokens glass (PR 2) están elegidos para dar ≥ 12:1 de contraste en dark, pero un override ad-hoc de `--ui-glass-bg` en un componente futuro (ej. una card con alpha custom) puede caer por debajo de 4.5:1. **Mitigación:** `audit.test.ts` de PR 5 es el verify gate; cualquier componente nuevo que introduzca un par texto-sobre-glass DEBE agregar una fila a `docs/qa/ui-redesign.md` en el mismo PR.

- **R-apply-2 — Shift de métrica de `next/font` en forms `max-w-*`.** Reemplazar la fuente CDN (si la hay) con `next/font` Inter Variable causa un shift de line-height de 1–3 px en forms con `max-w-*`. **Mitigación:** PR 1 (T-PR1-06) conecta las fuentes primero para que el chrome (PR 3) y el landing (PR 4) nunca vean un frame de fuente mixta; el `size-adjust` automático de `next/font` mantiene el swap imperceptible; regresión visual manual en `/auth/signin` (slice 2, pero su form inline ya usa Inter vía el viejo CDN — confirmar en PR 1 antes de que slice 2 arranque).

- **R-apply-3 — FOUC bajo JS-disabled o ejecución lenta del script.** El script inline bloqueante en `app/layout.tsx` (T-PR2-07) setea `<html class="dark">` antes del first paint. Si el script está mal formado (ej. un `try/catch` se tragó un TypeError), los usuarios en una máquina con `prefers-color-scheme: dark` ven un flash claro. **Mitigación:** `fouc-script.test.tsx` de T-PR2-13 cubre los tres casos de precedencia; un e2e de Playwright en PR 5 (T-PR5-02 escenario g) carga `/` con JavaScript deshabilitado por una corrida y asegura que el `<html class>` esté seteado al momento en que el body comienza a renderizar (el script inline no depende de la completitud de la ejecución JS para el parseo).

- **R-apply-4 — Hidratación de i18n mismatch.** El header `x-locale` es seteado por middleware (PR 1) y leído por `getRequestConfig` (T-PR1-03) y el script de FOUC (T-PR2-07). Si un PR futuro introduce una segunda fuente de verdad (ej. un call a `useLocale()` que lee un context en vez del header), el server y el client pueden discrepar en el first paint. **Mitigación:** el script de FOUC lee `localStorage` + `matchMedia` directamente (sin context de React), y `getRequestConfig` lee el header — fuente única de verdad por concern; el e2e de Playwright de PR 5 (T-PR5-02 escenario h) asegura que el `<title>` del primer paint ya muestra el locale correcto.

- **R-apply-5 — Race del sidebar en first load (URL ↔ `localStorage`).** Dos fuentes de verdad pueden discrepar: `?sidebar=collapsed` en la URL y `localStorage['ui.sidebarCollapsed']` de una sesión previa. **Mitigación:** T-PR3-03 especifica URL gana en first load; las actualizaciones posteriores van vía `history.replaceState` + `localStorage.setItem` atómicamente (un solo render); un listener de evento `storage` sincroniza entre tabs. El e2e de Playwright de T-PR5-02 (escenario j) recarga 5 veces después de un toggle de collapse y asegura que URL + `localStorage` + estado visual coincidan.

- **R-apply-6 — Drift de `pnpm-lock.yaml` después de agregar `next-intl` (según `AGENTS.md` §5.3 política de lockfile).** El lockfile es un **deliverable**, no un intermedio. Re-correr `pnpm install` DEBE regenerarlo determinísticamente; un lockfile faltante o drifted rompe CI (`pnpm install --frozen-lockfile`). **Mitigación:** T-PR1-01 commitea el `pnpm-lock.yaml` regenerado en el mismo cambio que la edición de `package.json`; el pre-commit hook `.husky/pre-commit` → `scripts/check-lockfile.sh` (ya presente según `AGENTS.md` §5.3) fallará el commit si el diff del lockfile está vacío después de stagear `package.json`. El workaround del hijack de pnpm-workspace de macOS (`pnpm install --ignore-workspace`, luego `git checkout pnpm-lock.yaml` si la resolución del workspace driftea) aplica solo al entorno de dev local — CI usa `--frozen-lockfile` y no se afecta.

## Aceptación para esta lista de tareas

Esta lista de tareas es aceptable cuando:

- **(a) cada REQ-UI-NN mapea a al menos una tarea** — ver la cross-reference de abajo.
- **(b) cada componente nuevo de design §Component surface tiene un par create-task + test-task** — `ThemeProvider` (T-PR2-06 + T-PR2-13), `ThemeToggle` (T-PR2-08 + T-PR2-13), `LanguageSwitcher` (T-PR3-05 + T-PR3-09), `SkipLink` (T-PR1-07 + T-PR1-11), `Topbar` (T-PR3-02 + T-PR3-09), `Sidebar` (T-PR3-03 + T-PR3-09), `BottomTabBar` (T-PR3-04 + T-PR3-09), `GlassCard` (T-PR3-01 + T-PR3-09).
- **(c) la estimación de LoC de cada PR coincide con design §Sequence of changes dentro de ±20%** — PR 1 ≈ +220/−3, PR 2 ≈ +200/−8, PR 3 ≈ +520/−5, PR 4 ≈ +260/−10, PR 5 ≈ +220/−0; design lista +220/−3, +200/−8, +520/−5, +260/−10, +220/−0. Todos dentro de ±0 líneas (el design fue la fuente).
- **(d) los comandos de verify son ejecutables** — cada tarea lista un script concreto de `pnpm`, un comando `git grep`/`grep`/`diff`, una aserción de vitest-axe, o un escenario de Playwright. Ninguna tarea propone una herramienta que no esté en `package.json` (Playwright está flagged en T-PR5-02 como devDep a agregar si no está presente según design §Testing strategy).

### Cross-reference REQ-UI-NN → tarea

| REQ               | Tareas                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-UI-9 MODIFIED | T-PR2-02 (rename selector), T-PR2-13 (`tokens.test.ts` asegura `.dark` presente)                                                      |
| REQ-UI-12         | T-PR4-01 (302), T-PR4-02 (hero), T-PR4-03 (3 cards), T-PR4-04 (2 CTAs), T-PR4-08 (bundle de tests)                                    |
| REQ-UI-13         | T-PR3-03 (Sidebar), T-PR3-04 (BottomTabBar), T-PR3-06 (matriz AppShell), T-PR3-09 (tests)                                             |
| REQ-UI-14         | T-PR2-06 (ThemeProvider), T-PR2-07 (script FOUC), T-PR2-08 (ThemeToggle), T-PR2-13 (test de cycle)                                    |
| REQ-UI-15         | T-PR2-05 (override CSS), T-PR2-13 (test glass-card-css), T-PR3-01 (GlassCard)                                                         |
| REQ-UI-16         | T-PR2-04 (override CSS), T-PR2-10 (Spinner), T-PR2-11 (Skeleton), T-PR2-13 (test reduced-motion)                                      |
| REQ-UI-17         | T-PR1-02 (i18n.ts), T-PR1-03 (request.ts), T-PR1-04 (middleware), T-PR1-05 (catálogos), T-PR3-05 (Switcher), T-PR3-08 (claves chrome) |
| REQ-UI-18         | T-PR1-06 (next/font), T-PR1-11 (test de fonts)                                                                                        |
| REQ-UI-19         | T-PR2-01 (7 tokens), T-PR2-02 (rename selector), T-PR2-13 (test de diff de tokens)                                                    |
| REQ-UI-20         | T-PR4-06 (not-found), T-PR4-07 (error), T-PR4-08 (tests)                                                                              |
| REQ-UI-21         | T-PR5-01 (archivo de auditoría), T-PR5-06 (audit.test.ts), T-PR5-02 (Playwright e2e)                                                  |
| REQ-UI-22         | T-PR1-07 (componente SkipLink), T-PR1-08 (mount en layout), T-PR1-11 (test), T-PR5-02 (Playwright Tab)                                |
| REQ-UI-24         | T-PR1-05 (catálogos vacíos con fallback de `getRequestConfig`), T-PR1-11 (test de fallback), T-PR5-02 (e2e en `/accounts`)            |
