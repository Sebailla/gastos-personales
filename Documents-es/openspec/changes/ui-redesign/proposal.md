# Propuesta — `ui-redesign`

## Change ID: `ui-redesign`

## Status: `proposed`

## Authors

- Proyecto — `gastos-personales` (v0.4.1, aplicación multiusuario de finanzas personales sobre Next.js 16 / React 19 / Hono / Prisma 6 / PostgreSQL).
- Esta propuesta — fase `sdd-propose`, change `ui-redesign`.

## Summary

Reemplazar los valores por defecto ad-hoc de Tailwind y el placeholder `/` enviados por el change archivado `transactions-ui` (cerrado el 2026-06-29) por un sistema visual cohesivo y un shell de navegación: glassmorphism sobre fondos con gradiente, tema claro/oscuro completo con `prefers-color-scheme` automático + override manual, shell de navegación mobile-first (BottomTabBar en móvil, Topbar + Sidebar colapsable en desktop), i18n EN/ES, WCAG 2.2 AA con fallbacks para `prefers-reduced-transparency` y `prefers-reduced-motion`, y una landing de marketing en `/` que redirige 302 a `/dashboard` para usuarios autenticados. El slice 1 envía sólo la fundación: design tokens, fonts, tema, scaffold i18n, shell de navegación, landing, y `not-found.tsx` / `error.tsx` — para que los slices siguientes puedan migrar `signin`, `register` y el `balance-widget` sin redisenar el chasis.

## Why

La explore (`sdd/ui-redesign/explore`, 2026-06-29) inventarió lo que la UI enviada hace bien (lista de preservación) y lo que hace mal (dolores anclados por archivo al código de producción). Los bloqueadores, anclados a los outputs de `transactions-ui`:

- **`app/_ui/tokens.css`** envía 14 colores de paleta por defecto de Tailwind y ningún token de glass, parada de gradiente ni emparejamiento para dark mode. Cada superficie reimplementa su propia combinación.
- **`app/_ui/primitives/Card.tsx`** y **`app/_components/transactions/TransactionList.tsx`** renderizan colores planos sin lenguaje de profundidad, así que la voz de marca ("cálida, confiable") se lee como "demo por defecto de Tailwind".
- **`app/(public)/page.tsx`** es un placeholder no autenticado; el producto no tiene superficie de marketing y un usuario autenticado cae en la confusión de `?callbackUrl=/`.
- **`app/auth/signin/page.tsx`, `app/auth/register/page.tsx`** hardcodean strings en inglés dentro de JSX (`"Sign in"`, `"Continue with Google"`); no hay capa i18n.
- **`app/_ui/primitives/Spinner.tsx`, `Skeleton.tsx`** no tienen opt-out de `prefers-reduced-motion`.
- **`app/accounts/[id]/balance-widget/`** usa backdrop-blur sin fallback de `prefers-reduced-transparency`; debajo de WCAG 2.2 AA en dark mode con opacidad baja.
- **Sidebar** sólo vive en desktop ≥ `lg`; no hay equivalente móvil — cinco de siete páginas de producción son inutilizables por debajo de `md`.
- **`app/_ui/primitives/Button.tsx`** usa Inter desde el CDN, no `next/font/google`, así que los pesos no preloadeados bloquean LCP.
- El landing renderiza copy en inglés sin switcher de locale; el usuario primario documentado del proyecto lee español (ver `Documents-es/README.md` y el árbol de espejos en español).
- El usuario (en sesión) describió lo enviado como "esto da asco" — un fallo tonal, no de calidad de código.

La brecha tiene forma de producto, no de código: un PR de `transactions-ui` se cerró con todos los tests verdes y un emoji crítico que el maintainer preferiría no ver en la próxima sesión.

## What changes

Set de cambios visibles al usuario, agrupados por superficie. Las etiquetas "Slice 1" marcan trabajo dentro de alcance; las etiquetas "later slice" están explícitamente fuera de alcance.

### Surface 1 — Sistema visual (Slice 1)

- Tokens de glassmorphism añadidos a `app/_ui/tokens.css` (APPEND-only — los 14 colores existentes no se modifican): `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, más paradas de gradiente `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`.
- Fondos con gradiente (calmos, on-brand) para el landing y como sustrato bajo las glass cards.
- Tokens de sombra + elevación para capas (`--ui-shadow-1` … `--ui-shadow-4`).

### Surface 2 — Tema (Slice 1)

- Temas `light`, `dark` y `system` (`prefers-color-scheme`). Un `ThemeToggle` en el Topbar alterna a manual. La elección manual persiste en `localStorage` bajo `ui.theme` y pisa la preferencia del SO.
- `@custom-variant dark` más cableado de clase `.dark`; compatible con el setup existente de Tailwind v4.

### Surface 3 — Fonts (Slice 1)

- Inter Variable para display y body (`next/font/google`, `display: 'swap'`, preloadeado).
- JetBrains Mono para monoespaciado (`next/font/google`, `display: 'swap'`, subset preloadeado).
- Aplicados vía variables CSS `--font-inter`, `--font-jb-mono`; disponibles como tokens del theme Tailwind v4 (`font-sans`, `font-mono`).

### Surface 4 — Shell de navegación (Slice 1)

- `Topbar` (horizontal, arriba) — logo + marca a la izquierda; a la derecha: `LanguageSwitcher`, `ThemeToggle`, menú de usuario.
- `Sidebar` (colapsable, vertical, izquierda, desktop ≥ `lg`) — lista de secciones con resaltado de ruta activa; estado de colapso en URL (`?sidebar=collapsed`) y espejado en `localStorage`.
- `BottomTabBar` (móvil < `lg`) — hasta 5 destinos: dashboard, accounts, transactions, reports (o similar), más una affordance "more".
- Ambos shells exponen landmarks `<nav>`, son operables sólo con teclado, y tienen links de skip-to-content.

### Surface 5 — i18n (Slice 1)

- Scaffold de `next-intl` (el único newcomer de producción plausible; marcado para confirmación en spec): `messages/en.json`, `messages/es.json`, negociación de locale desde header + prefijo de URL opcional, `LanguageSwitcher` en el Topbar persiste elección en cookie.
- El Slice 1 envía catálogos de mensajes vacíos/semilla; los strings se completan a medida que cada superficie migra.

### Surface 6 — Landing en `/` (Slice 1)

- Marketing-driven para visitantes no autenticados: hero con una propuesta de valor clara, tres cards de features, CTAs duales ("Crear cuenta" / "Iniciar sesión").
- Copy en español primero (el lector primario documentado del proyecto); espejo en inglés.
- Visitantes autenticados que llegan a `/` se redirigen 302 server-side a `/dashboard`.
- Sin charts, sin demos animados, sin widgets de terceros en el slice 1.

### Surface 7 — Error + not-found (Slice 1)

- `app/not-found.tsx` y `app/error.tsx` (scope raíz) matchean el nuevo lenguaje visual: glass card, fondo con gradiente, copy en ambos locales, tags `<title>` razonables.

### Surface 8 — Migraciones futuras (later slices — OUT OF SCOPE)

- `app/auth/signin/page.tsx` — migrar a glass + tokens nuevos + copy EN/ES.
- `app/auth/register/page.tsx` — misma migración.
- `app/accounts/[id]/balance-widget/` — migrar a glass con fallback de `prefers-reduced-transparency`, auditar contraste WCAG 2.2 AA.
- Charts del dashboard — gated hasta decidir un stack de charts (chart.js, recharts, etc.).
- Rediseño de reports, página de settings, página de forgot-password, banner de cookies (base legal), analytics.

## Goals

1. Un usuario abriendo `/` con un perfil limpio entiende en cinco segundos qué es la app y cómo empezar.
2. Todo elemento interactivo en toda superficie nueva cumple WCAG 2.2 AA: contraste 4.5:1 para body text, 3:1 para texto grande y componentes UI, anillos de foco visibles, touch targets ≥ 44×44 px, alcance completo por teclado, sin estado sólo por color.
3. `prefers-reduced-transparency` colapsa el blur de glass a superficies sólidas de alta opacidad preservando el contraste.
4. `prefers-reduced-motion` desactiva las animaciones de Spinner, Skeleton y transiciones de glass.
5. La elección del `ThemeToggle` sobrevive al reload; pisa a `prefers-color-scheme`.
6. La elección del `LanguageSwitcher` sobrevive al reload; `es` es el locale por defecto para browsers que piden español; `en` para todos los demás.
7. El shell de producción — `/dashboard`, `/accounts`, `/transactions`, `/accounts/:id`, `/transactions/:id`, `/accounts/new`, `/transactions/new` — sigue funcionando sin cambios en la capa de datos de ruta; sólo difieren el chrome y los tokens.
8. Los temas light y dark renderizan idénticamente para layout; el contraste pasa en ambos para todo nuevo par texto-sobre-fondo.
9. LCP en `/` ≤ 2.0 s p95 en un perfil "Slow 4G" throttled (con Inter preloadeado; target heredado de `transactions-ui`).
10. Cero dependencias nuevas de producción más allá de `next-intl` (y sólo si la spec lo confirma — `next/font` viene con Next.js).

## Non-goals

- **Migrar** `app/auth/signin/page.tsx` — slice 2.
- **Migrar** `app/auth/register/page.tsx` — slice 2.
- **Migrar** `app/accounts/[id]/balance-widget/` — slice 3.
- **Agregar** charts al landing.
- **Agregar** charts a `/dashboard`.
- **Redisenar** la página de reports ni la de settings.
- **Agregar** una página de forgot-password (cambio aparte).
- **Agregar** un banner de cookies o analytics — cambios aparte una vez decidida la base legal.
- **Tocar** contratos de datos de ruta, lógica de negocio, o modelos Prisma.
- **Modificar** los 14 tokens de color existentes en `app/_ui/tokens.css` — los tokens de glass son APPEND-only.
- **Forzar** a los usuarios a un pick manual de tema — `system` es el default; el override manual es opt-in.
- **Enviar** traducciones para copy fuera de las superficies nuevas (signin, register, balance-widget se quedan en español/inglés como están hoy).

## User stories

1. **Como visitante nuevo**, caigo en `/`, veo una propuesta de valor clara en mi idioma (español por defecto) y encuentro "Crear cuenta" / "Iniciar sesión" en un parpadeo de pantalla — sin rebotar porque la página está en el idioma equivocado o parece un placeholder.
2. **Como usuario autenticado recurrente**, caigo en `/` después de que se vence mi sesión y el server me rebota a `/dashboard`, no a la página de marketing — así no me piden re-autenticación desde un CTA de marketing.
3. **Como usuario móvil** en un viewport de 360 px, veo un BottomTabBar con mis destinos más usados y el mismo estilo visual que en desktop — no un placeholder tipo "usá una pantalla más grande".
4. **Como usuario con `prefers-reduced-transparency: reduce`**, cada glass card cae a un fondo sólido con el mismo contraste; sigo viendo el contenido, la página no se "desvanece" en transparencia, y no tengo que deshabilitar una preferencia del sistema.
5. **Como usuario con `prefers-reduced-motion: reduce`**, no veo coreografía de spinner/skeleton; la página simplemente resuelve a su estado final, y no me piden confirmar un override de accesibilidad ad-hoc por superficie.
6. **Como usuario hispanohablante**, puedo cambiar toda la app a inglés desde el Topbar, mi elección sobrevive a un reload, y el switcher de idioma es alcanzable desde cualquier página (Topbar, no un link en el footer).

## Acceptance criteria

La fase spec endurecerá estos en escenarios REQ-UI-NN role-agnostic testeables. Esta propuesta carga la forma de alto nivel.

- **A1.** `/` renderiza el landing de marketing para visitantes no autenticados; el layout incluye un hero, exactamente tres cards de features, y exactamente dos CTAs que apuntan a `/auth/register` y `/auth/signin` respectivamente.
- **A2.** `/` redirige 302 a `/dashboard` cuando el request lleva una cookie de sesión válida; el redirect ocurre server-side, no via routing del cliente.
- **A3.** Toda ruta autenticada renderiza con el shell (Topbar + Sidebar en ≥ `lg`, Topbar + BottomTabBar en < `lg`); el shell es operable por teclado, tiene un skip-link, y expone landmarks `<nav>` distintos.
- **A4.** El tema por defecto sigue `prefers-color-scheme`. Un `ThemeToggle` en el Topbar cicla `system → light → dark`. La elección manual persiste en `localStorage` bajo `ui.theme` y pisa la preferencia del SO.
- **A5.** Cuando `prefers-reduced-transparency: reduce` está activo, todas las superficies de glass cambian el blur por un fondo sólido de alta opacidad; el ratio de contraste de cada par texto-sobre-fondo sigue cumpliendo WCAG 2.2 AA.
- **A6.** Cuando `prefers-reduced-motion: reduce` está activo, no corre ninguna animación de Spinner/Skeleton/keyframe CSS; la página resuelve a su estado final sin movimiento.
- **A7.** Inter Variable (display + body) y JetBrains Mono (mono) cargan via `next/font/google` con `display: 'swap'` y `preload: true`; no se renderiza ningún `<link>` al CDN de Google Fonts.
- **A8.** El `LanguageSwitcher` cambia el locale activo; la elección persiste; existen `messages/en.json` y `messages/es.json` y al menos los strings del landing resuelven.
- **A9.** `app/not-found.tsx` y `app/error.tsx` existen a nivel raíz, renderizan en el nuevo lenguaje visual, y el copy está localizado.
- **A10.** Los tokens de glass y dark/light se AÑADEN a `app/_ui/tokens.css`; las 14 variables de color preexistentes quedan intactas (un diff del archivo muestra sólo adiciones).
- **A11.** Cada nuevo par texto-sobre-fondo en ambos temas pasa contraste WCAG 2.2 AA; los resultados de la auditoría quedan registrados en `docs/qa/ui-redesign.md`.
- **A12.** Las páginas existentes del shell de producción (`/dashboard`, `/accounts`, `/transactions`, y sus variantes detail/new) siguen renderizando sin cambios de route-data; sólo difieren chrome y tokens.
- **A13.** No se agrega ninguna dependencia nueva de producción más allá de `next-intl` (si la spec lo confirma); `next/font` se usa como viene con Next.js.
- **A14.** LCP en `/` ≤ 2.0 s p95 en un perfil Lighthouse throttled "Slow 4G" (target heredado de `transactions-ui`).

## Product tradeoffs

- **PRs encadenados vs un PR grande.** La decisión locked es PRs encadenados. Tradeoff: el slice 1 queda revisable (< ~400 líneas cambiadas por PR, con las 18 primitives + 5 layout shells existentes tocando una superficie por PR), pero el usuario ve un producto a medio terminar por más tiempo y aceptamos que algunos estados intermedios son visualmente inconsistentes (el landing es glass, signin sigue siendo flat) hasta que el slice 2 aterrice. **Por qué gana:** la explore nombró como factores decisivos la revisabilidad, rollback parcial, y radio de explosión menor; un único PR de ~1.5k líneas reabriría la pregunta tonal "esto da asco" cada vez que un reviewer comenta. El costo es aproximadamente una semana de superficies de era mixta, que mitigamos NO tocando `signin` / `register` / `balance-widget` hasta sus slices dedicados — así su look actual (feo-pero-funcional) sostiene la línea de usabilidad.
- **`next-intl` vs i18n hand-rolled.** Agregar `next-intl` es la única dependencia material nueva. Tradeoff: otra superficie transitiva para aprender y patchear, otra cosa en el checklist de revisión de dependencias. **Por qué gana:** la historia de integración App Router + Server Components para `next-intl` es madura (RSC + streaming + ICU MessageFormat + negociación de locale basada en cookie), y rolarnos nuestro propio message-format + plural + negociación de locale + bundle tree-shakeable serían ~200 LOC de `src/i18n/` a mantener. La fase spec confirma la elección; si `next-intl` se rechaza, el fallback es `react-i18next` (más viejo pero battle-tested) o un wrapper custom fino, y la propuesta se reabre.
- **Landing en `/` vs login en `/`.** Redirigimos tráfico autenticado de `/` a `/dashboard`. Tradeoff: un landing "marketing first" hace doble función como muro de signin para bookmarks del browser que apuntaban a `/`; el redirect de `/` a `/dashboard` es un hop extra de server para el caso autenticado. **Por qué gana:** la alternativa (saltar directo a `/auth/signin` desde `/`) cuesta a cada visitante no autenticado un parpadeo de fricción; la alternativa (un query param `?` para opt-in a marketing) es demasiado leaky (deep links, píxeles de ad-tracking, y bookmarks fragmentan). Revisitamos si analytics muestran un alta tasa de revisit no autenticado.
- **`prefers-color-scheme: light+dark+auto` vs elección manual única.** Tres modos. Tradeoff: más estados de toggle para testear, más edge cases en first-load. **Por qué gana:** el requerimiento de marca es "cálida, confiable, nunca gritona"; un dark default forzado alienaría a usuarios de desktop de día, un light default forzado alienaría a usuarios móviles de noche, y un único path auto-only remueve la agencia del usuario. El ciclo de tres estados (`system → light → dark`) es el default de la industria y es lo que los power-users esperan.
- **Tokens append-only vs refactor.** Añadimos tokens de glass / gradient / shadow a `app/_ui/tokens.css` sin modificar los 14 colores existentes. Tradeoff: el archivo crece, conviven dos eras de tokens durante la ventana de migración. **Por qué gana:** todo code path que usa `--color-primary` sigue comportándose; podemos migrar una superficie a la vez y rollbackear superficie por superficie. El PR de cleanup es el último slice de la cadena, no parte del slice 1.

## Open product questions

Las decisiones locked cubren la mayor parte de la superficie de la propuesta. Quedan tres chiquitas; la fase spec puede proceder igual y la fase apply las confirma en sus PRs dedicados. Se listan para que el usuario pueda despacharlas con una línea cada una si quiere.

1. **Locale por defecto para browsers cuyo idioma no es ni español ni inglés.** Propuesta: default a inglés, aceptar el prefijo de URL `?lang=` y cookie de locale como única override. **Input mínimo que destraba:** "default English" o "default Spanish." Default `en` si no hay respuesta.
2. **Ubicación del `LanguageSwitcher` cuando el viewport es < sm (móviles muy angostos) y el Topbar ya está lleno.** Propuesta: colapsar a un único ícono que abre un popover con `Español` / `English`. **Input mínimo que destraba:** "popover" o "fila dedicada" o "link en footer." Default popover si no hay respuesta.
3. **Animación del hero del landing.** Un glow flotante breve en la ilustración del hero sólo para usuarios con `motion-ok`. Propuesta: incluir la animación gated por `prefers-reduced-motion`. **Input mínimo que destraba:** "enviar con animación" o "estática-only en slice 1." Default estática-only si no hay respuesta, para mantener el slice 1 como el slice aburrido-y-seguro.

## Out of scope (slice 1)

Lista explícita, para fijar el alcance de la secuencia de PRs encadenados:

- `app/auth/signin/page.tsx` — migración a glass + copy EN/ES (slice 2).
- `app/auth/register/page.tsx` — migración (slice 2).
- `app/accounts/[id]/balance-widget/` — migración + auditoría de `prefers-reduced-transparency` (slice 3).
- Página de forgot-password — change aparte, no parte de este slice.
- Rediseño de reports — change aparte.
- Página de settings — change aparte.
- Charts en `/dashboard` — change aparte; stack de charts aún sin elegir.
- Charts en el landing — change aparte.
- Banner de cookies / base legal — change aparte.
- Integración de analytics — change aparte.
- PR de cleanup de tokens (quitar la era pre-glass) — último slice, no slice 1.
- Copy localizado más allá del landing + theme/language toggle + not-found/error — movido incrementalmente por slice de migración de superficie.

## Risks

Riesgos de producto y negocio solamente. Los riesgos técnicos (perf de rendering, hydration, bundle bloat) pertenecen a la fase design.

- **R1 — Scope creep en el landing.** Una página de landing invita a copywriters, ilustradores y stakeholders de SEO; sin una valla, el slice 1 crece de "tokens + nav + landing" a "sitio de marketing". **Mitigación:** la lista Out of Scope de arriba; cualquier pedido nuevo se archiva bajo un nuevo SDD change, no se absorbe acá.
- **R2 — Sub-entrega de scope.** El slice 1 envía sólo la fundación, así que los usuarios autenticados ven una era visual inconsistente durante ~1-2 semanas hasta que el slice 2 aterrice. **Mitigación:** la queja "esto da asco" del maintainer se nombra en el Why de esta propuesta; enviamos el slice 1 con las partes más visibles (landing, Topbar) para que el payoff emocional llegue rápido, no en el slice 3.
- **R3 — Regresión de accesibilidad en glass en dark mode.** Las superficies de glass son notorias por resbalar contraste en dark mode (blanco de baja opacidad sobre gradiente oscuro cae debajo de 4.5:1 para body text). **Mitigación:** REQ-UI-21 exige una auditoría de contraste registrada (`docs/qa/ui-redesign.md`); `prefers-reduced-transparency` es un opt-out duro, no una "preferencia".
- **R4 — Inglés-roto en el landing para el lector primario hispanohablante.** La decisión locked es copy en español primero en `/`. Si la voz de marca se lee como Google-Translated, el tono de lanzamiento es peor que el placeholder. **Mitigación:** el copy del landing lo redacta el maintainer antes de que el slice 1 envíe (el maintainer puede rutear a un reviewer con fluidez en español); la fase spec trata el message catalog para el landing como un deliverable, no un placeholder.
- **R5 — Drift de tono de marca hacia "app demo de glass".** Glassmorphism está de moda; sin restraint la app se lee como un shot de Dribbble en vez de una herramienta de finanzas. **Mitigación:** guía de tono "cálida + profesional (nunca gritona-juguetona, nunca corporativa-fría)" es un goal; A11 enforce fondos con gradiente y sombras conservadoras; el copy del landing usa segunda persona ("Tus cuentas, tus reglas") más que selfie en primera persona.
- **R6 — Falla del contrato de persistencia entre Engram y OpenSpec.** Esta propuesta aterriza en Engram en `sdd/ui-redesign/proposal` Y en disco en `openspec/changes/ui-redesign/proposal.md` Y como espejo en español en `Documents-es/openspec/changes/ui-redesign/proposal.md`. **Mitigación:** la fase spec lee ambas fuentes en inglés y re-confirma drift antes de proceder; cualquier futura edición de `proposal.md` DEBE aterrizar ambos lados en el mismo commit (per `AGENTS.md` §5.4 y §13.3).

## Success measure

Criterio de éxito en dos niveles. El cuantitativo es un proxy de UX; el cualitativo es el feedback de tono-de-voz del maintainer que originalmente surfacó la brecha.

**Cuantitativo**

- LCP en `/` ≤ 2.0 s p95 (Lighthouse, "Slow 4G" throttled, mediana de 4 runs) — target heredado de `transactions-ui`.
- CLS en `/` ≤ 0.1.
- Suite axe-core a11y en `tests/a11y/` para las superficies nuevas `/`, `not-found` y `error`: cero violaciones `critical`, cero `serious` sobre WCAG 2.2 AA.
- `localStorage.getItem('ui.theme')` seteado dentro de 30 días para > 50% de sesiones autenticadas (adopción de override manual de tema).
- `localStorage` de locale seteado dentro de 30 días para > 60% de sesiones autenticadas (adopción de override manual de idioma).

**Cualitativo**

- El maintainer, en la próxima sesión después de que el slice 1 envíe, no escribe "esto da asco" ni ningún marcador tonal equivalente de "esto está áspero" cuando describe `/`, el Topbar, o el tema dark.
- Un visitante nuevo puede nombrar el propósito del producto en cinco segundos de caer en `/`.

## ADDED Requirements

Sentencias preliminares de requirement que `sdd-spec` endurecerá en escenarios role-agnostic bajo la capability `ui`. El numbering continúa del spec existente de la capability `ui` — REQ-UI-12 en adelante.

- **REQ-UI-12** — The `/` route renders a marketing landing for unauthenticated visitors — hero with one value proposition, exactamente tres feature cards, y dos CTAs (`Crear cuenta` → `/auth/register`, `Iniciar sesión` → `/auth/signin`) — y 302-redirects authenticated users to `/dashboard`. El redirect es server-side.
- **REQ-UI-13** — Un global navigation shell renderiza en toda ruta autenticada: `Topbar` + `Sidebar` on desktop ≥ `lg`, `Topbar` + `BottomTabBar` en viewports < `lg`. Ambos shells exponen landmarks `<nav>` distintos, son operables sólo por teclado, y persisten el estado de colapso (Sidebar) en query URL + `localStorage`. Un skip-to-content link es el primer elemento focuseable.
- **REQ-UI-14** — Dark mode se dispara por `prefers-color-scheme: dark` Y por un manual `ThemeToggle` en el Topbar ciclando `system → light → dark`. La elección manual persiste en `localStorage` bajo `ui.theme` y pisa la preferencia del SO hasta que se limpie.
- **REQ-UI-15** — Toda superficie de glass honra `@media (prefers-reduced-transparency: reduce)` reemplazando `backdrop-filter: blur(...)` por un fondo sólido de alta opacidad que preserva contraste WCAG 2.2 AA para el par texto-sobre-fondo.
- **REQ-UI-16** — Toda superficie animada honra `@media (prefers-reduced-motion: reduce)` deshabilitando los keyframes CSS de `Spinner`, `Skeleton`, transiciones de glass y animaciones del hero.
- **REQ-UI-17** — Una capa i18n envía con `messages/en.json` y `messages/es.json`; un `LanguageSwitcher` en el Topbar cambia el locale activo; la elección persiste; `es` es el locale por defecto para browsers con `Accept-Language` encabezado por `es*`.
- **REQ-UI-18** — La tipografía usa Inter Variable para display y body y JetBrains Mono para mono, ambas cargadas via `next/font/google` con `display: 'swap'` y `preload: true`; las variables CSS `--font-inter` y `--font-jb-mono` se cablean al theme de Tailwind v4 como `font-sans` y `font-mono`. No se renderiza ningún `<link>` al CDN de Google Fonts.
- **REQ-UI-19** — Los tokens de glassmorphism (`--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`) y las paradas de gradiente (`--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`) se añaden a `app/_ui/tokens.css` como tokens APPEND-only; las 14 variables de color existentes no se modifican (el diff muestra sólo adiciones).
- **REQ-UI-20** — `app/not-found.tsx` y `app/error.tsx` existen a nivel raíz, renderizan en el nuevo lenguaje visual, y el copy está localizado al locale activo con tags `<title>` razonables.
- **REQ-UI-21** — El contraste WCAG 2.2 AA se verifica para cada nuevo par texto-sobre-fondo en AMBOS temas light y dark; la auditoría (herramienta + resultados, ratio por par) se registra en `docs/qa/ui-redesign.md` y el archivo se enlaza desde la evidencia de verificación del spec.
