# Delta para ui

**Cambio**: `ui-redesign` (slice 1 — fundación)
**Capacidad**: `ui`
**Agrega requisitos**: REQ-UI-12, REQ-UI-13, REQ-UI-14, REQ-UI-15, REQ-UI-16, REQ-UI-17, REQ-UI-18, REQ-UI-19, REQ-UI-20, REQ-UI-21, REQ-UI-22, REQ-UI-24 (REQ-UI-23 se fusiona en REQ-UI-20 según lo indicado)
**Modifica requisitos**: REQ-UI-9
**Elimina requisitos**: ninguno
**Propuesta fuente**: `openspec/changes/ui-redesign/proposal.md`
**Exploración fuente**: `sdd/ui-redesign/explore` (Engram)

Este delta endurece el slice 1 del cambio ui-redesign: la capa de fundación que entrega los design tokens, el tema de tres estados, las fuentes, el shell de navegación, el scaffold de i18n, el landing de marketing en `/`, y las superficies raíz de error y not-found. Los slices 2 y 3 (migraciones de auth, migración de balance-widget) se rastrean en sus propios cambios.

Las decisiones bloqueadas (estilo visual = glassmorphism sobre gradiente; tema de tres estados; fuentes = Inter Variable + JetBrains Mono; i18n = `next-intl` con `messages/en.json` + `messages/es.json`; shell de navegación mobile-first con BottomTabBar por debajo de `lg`; alcance del landing; tokens append-only; y las tres preguntas abiertas resueltas por defecto Q1 = default `en`, Q2 = popover en `<sm`, Q3 = hero estático en slice 1) son restricciones aquí, no temas abiertos. Los slices 2/3 heredan la fundación sin replantearla.

## ADDED Requirements

### Requirement: landing de marketing en `/` con redirección consciente de auth (REQ-UI-12)

La ruta `/` MUST renderizar un landing de marketing para visitantes no autenticados y MUST emitir una redirección 302 a `/dashboard` para los visitantes que presenten una cookie de sesión válida de Auth.js v5. El landing MUST contener exactamente: un bloque hero (un único `<h1>` con la propuesta de valor), exactamente tres tarjetas de funcionalidad en una sola fila (que colapsan a una columna por debajo de Tailwind `md`), y exactamente dos enlaces de call-to-action etiquetados `Crear cuenta` (que enlaza a `/auth/register`) e `Iniciar sesión` (que enlaza a `/auth/signin`). La redirección 302 MUST ser emitida por el route handler o Server Component antes de que se streamee cualquier cuerpo HTML; el routing del lado cliente MUST NOT usarse para la redirección.

(Trazas: A1, A2; Goal 1, User Story 1, User Story 2.)

#### Scenario: visitante no autenticado ve el landing de marketing

- GIVEN: una petición `GET /` sin cookie de sesión de Auth.js v5
- WHEN: la petición llega al route handler de `app/page.tsx`
- THEN: el status de la respuesta es `200`
- AND: el cuerpo de la respuesta contiene un único elemento `<h1>`
- AND: el cuerpo de la respuesta contiene exactamente tres tarjetas de funcionalidad semánticamente distintas
- AND: el cuerpo de la respuesta contiene exactamente dos elementos `<a>` cuyo `href` resuelve a `/auth/register` y `/auth/signin` respectivamente
- AND: las etiquetas visibles de los CTA leen `Crear cuenta` e `Iniciar sesión` para la locale activa `es`

#### Scenario: visitante autenticado es redirigido con 302 a `/dashboard`

- GIVEN: una petición `GET /` que lleva una cookie de sesión válida de Auth.js v5
- WHEN: la petición llega al route handler de `app/page.tsx`
- THEN: el status de la respuesta es `302` (o `307` según el default de Next.js)
- AND: el header `Location` de la respuesta es `/dashboard`
- AND: no se streamEA ningún cuerpo HTML (la redirección precede al render)

#### Scenario: visitante con cookie expirada o no verificable sigue viendo el landing

- GIVEN: una petición `GET /` que lleva una cookie de sesión que Auth.js v5 no puede verificar (expirada, manipulada, o firmada con un secret obsoleto)
- WHEN: la petición llega al route handler de `app/page.tsx`
- THEN: el status de la respuesta es `200`
- AND: el cuerpo del landing se renderiza igual que para un visitante no autenticado
- AND: no se realiza ninguna redirección a `/auth/signin` desde `/` mismo

### Requirement: shell de navegación con Topbar, Sidebar, BottomTabBar y skip-link (REQ-UI-13)

La aplicación MUST renderizar un shell de navegación en cada segmento de ruta autenticada. En viewports con `min-width: 1024px` (Tailwind `lg`) el shell consiste en un `Topbar` (horizontal, superior) y un `Sidebar` (vertical, izquierdo, colapsable). En viewports con `width < 1024px` el shell consiste en un `Topbar` (horizontal, superior) y un `BottomTabBar` (fijo, inferior). El estado de colapso del `Sidebar` MUST reflejarse en la URL como el parámetro de query `?sidebar=collapsed` y MUST espejarse en `localStorage` bajo la clave `ui.sidebarCollapsed`; la URL es la fuente de verdad en la primera carga, `localStorage` es la fuente de verdad en navegaciones subsecuentes dentro de la misma sesión del origen. Un enlace skip-to-content MUST ser el primer elemento focuseable en el orden de tabulación del documento (ver también REQ-UI-22). El shell MUST exponer al menos dos landmarks `<nav>` distintos: la navegación primaria (Sidebar o BottomTabBar) y la navegación de usuario (menú de usuario del Topbar, controles de idioma, controles de tema). Las siete superficies de producción existentes — `/dashboard`, `/accounts`, `/accounts/[id]`, `/accounts/new`, `/transactions`, `/transactions/[id]`, `/transactions/new` — MUST continuar renderizando sus contratos de datos existentes sin cambios (A12); solo difieren el chrome y los tokens.

(Trazas: A3, A12; Goal 2, User Story 3.)

#### Scenario: desktop ≥ lg renderiza Topbar + Sidebar

- GIVEN: un viewport de `1280×800` (Tailwind `lg` y superior)
- WHEN: un usuario autenticado navega a `/dashboard`
- THEN: el DOM renderizado contiene un elemento `Topbar` y un elemento `Sidebar`
- AND: el elemento `BottomTabBar` NOT se renderiza
- AND: al menos un elemento `<nav>` está presente en el `Sidebar`
- AND: al menos un elemento `<nav>` está presente en el `Topbar`

#### Scenario: mobile < lg renderiza Topbar + BottomTabBar

- GIVEN: un viewport de `375×812` (Tailwind base)
- WHEN: un usuario autenticado navega a `/dashboard`
- THEN: el DOM renderizado contiene un elemento `Topbar` y un elemento `BottomTabBar`
- AND: el elemento `Sidebar` NOT se renderiza
- AND: el `BottomTabBar` expone hasta cinco destinos más un affordance de "más"

#### Scenario: el colapso del Sidebar hace round-trip por URL y localStorage

- GIVEN: un usuario autenticado en `/dashboard` con el Sidebar expandido
- WHEN: el usuario activa el toggle de colapso del sidebar
- THEN: la URL se vuelve `/dashboard?sidebar=collapsed`
- AND: `localStorage.getItem('ui.sidebarCollapsed')` retorna `'true'`
- WHEN: el usuario recarga la página
- THEN: el Sidebar se renderiza colapsado
- WHEN: el usuario navega a `/accounts` (sin query param) con el estado colapsado aún en `localStorage`
- THEN: el Sidebar se renderiza colapsado
- WHEN: el usuario activa el toggle de colapso de nuevo para expandir
- THEN: la URL elimina el parámetro de query `?sidebar=collapsed`
- AND: `localStorage.getItem('ui.sidebarCollapsed')` retorna `'false'`

#### Scenario: los contratos de datos de producción quedan sin cambios

- GIVEN: el codebase del slice 1
- WHEN: las siete superficies de producción se renderizan
- THEN: cada superficie consume los endpoints Hono existentes (`GET /api/accounts`, `GET /api/transactions`, etc.) con la misma forma de petición que antes de ui-redesign
- AND: las formas de respuesta de esos endpoints quedan sin cambios
- AND: solo difieren del era `transactions-ui` el chrome (`Topbar`, `Sidebar`, `BottomTabBar`) y los tokens (`app/_ui/tokens.css`)

### Requirement: tema de tres estados con override manual (REQ-UI-14)

La aplicación MUST soportar tres modos de tema: `system`, `light` y `dark`. El modo `system` MUST seguir la media query `prefers-color-scheme` y es el default. Un control `ThemeToggle` renderizado en el `Topbar` MUST ciclar por `system → light → dark → system` en cada activación. El modo activo MUST persistirse en `localStorage` bajo la clave `ui.theme`. La precedencia en el primer paint MUST ser: (1) `localStorage['ui.theme']` si está presente y es uno de `'system'`, `'light'`, `'dark'`; (2) si no, el valor OS de `prefers-color-scheme` (`dark` o `light`); (3) si no, `light`. La elección manual persistida MUST sobrescribir la preferencia del OS hasta que `localStorage['ui.theme']` se limpie. MUST no haber flash del tema equivocado en el primer paint: la clase `dark` MUST aplicarse a `<html>` (o raíz equivalente) vía un script bloqueante inline antes del primer paint, derivado de la misma regla de precedencia.

(Trazas: A4; Goal 5.)

#### Scenario: primera visita con `prefers-color-scheme: dark`

- GIVEN: un navegador con `prefers-color-scheme: dark` y sin `ui.theme` en `localStorage`
- WHEN: el usuario visita por primera vez cualquier página
- THEN: `<html class="dark">` está presente antes del primer paint
- AND: el `ThemeToggle` refleja el modo `system`
- AND: la paleta renderizada es la paleta dark de `app/_ui/tokens.css`

#### Scenario: toggle manual a `light`

- GIVEN: un navegador con `prefers-color-scheme: dark`
- AND: sin `ui.theme` en `localStorage`
- WHEN: el usuario activa el `ThemeToggle`
- THEN: el tema activo es `light`
- AND: `<html>` ya no tiene la clase `dark`
- AND: `localStorage.getItem('ui.theme')` retorna `'light'`
- AND: una recarga subsecuente renderiza en `light` independientemente del valor OS de `prefers-color-scheme`

#### Scenario: el toggle manual cicla system → light → dark → system

- GIVEN: una sesión fresca, `prefers-color-scheme: light`
- WHEN: el usuario activa el `ThemeToggle` tres veces seguidas
- THEN: el primer click setea `localStorage['ui.theme']` a `'light'`
- AND: el segundo click setea `localStorage['ui.theme']` a `'dark'`
- AND: el tercer click setea `localStorage['ui.theme']` a `'system'`
- AND: en modo `system` el tema renderizado sigue la preferencia OS en vivo

#### Scenario: limpiar localStorage restaura el default de preferencia del OS

- GIVEN: un usuario ha seleccionado manualmente `dark` por lo que `localStorage['ui.theme'] === 'dark'`
- WHEN: el usuario limpia `ui.theme` de `localStorage` y recarga
- THEN: el tema renderizado sigue de nuevo `prefers-color-scheme`

### Requirement: fallback de reduced-transparency para superficies glass (REQ-UI-15)

Cada utilidad `bg-ui-glass-*` (y cualquier otra superficie que use `backdrop-filter: blur(...)` de la tabla de tokens glass) MUST resolver a un fondo plano sólido de alta opacidad cuando el user agent reporta `@media (prefers-reduced-transparency: reduce)`. El fondo de fallback MUST ser el mismo valor `oklch(...)` del extremo de alta opacidad del token glass (sin transparencia, sin blur). Para cada par texto-sobre-fondo que aparezca bajo reduced-transparency, la relación de contraste MUST ser ≥ 4.5:1 (WCAG 2.2 AA, texto normal) o ≥ 3:1 (texto grande y componentes UI). La auditoría que establece esto — herramienta, tabla de ratios por par, ambos temas — MUST quedar registrada en `docs/qa/ui-redesign.md` (ver también REQ-UI-21).

(Trazas: A5, A11; Goal 3, User Story 4, Risk R3.)

#### Scenario: reduced-transparency reemplaza blur con sólido

- GIVEN: el OS reporta `prefers-reduced-transparency: reduce`
- WHEN: se renderiza una página con `bg-ui-glass-1`
- THEN: el estilo computado del elemento no tiene la propiedad `backdrop-filter` (o `backdrop-filter: none`)
- AND: el `background-color` computado es el valor sólido de alta opacidad del token glass (≥ 0.9 alpha)
- AND: cualquier texto renderizado encima de la superficie tiene una relación de contraste ≥ 4.5:1 contra el fondo resuelto

#### Scenario: la auditoría de contraste queda registrada bajo reduced-transparency

- GIVEN: la fase de verify para slice 1
- WHEN: se lee `docs/qa/ui-redesign.md`
- THEN: el archivo lista cada par texto-sobre-fondo en las superficies del landing, not-found y error bajo reduced-transparency
- AND: las relaciones de contraste por par están tabuladas para los temas `light` y `dark`
- AND: cero pares están por debajo de 4.5:1 para texto normal o por debajo de 3:1 para texto grande / componentes UI

### Requirement: fallback de reduced-motion para animaciones (REQ-UI-16)

Cuando el user agent reporta `@media (prefers-reduced-motion: reduce)`, las siguientes animaciones MUST NOT correr: el keyframe `animate-spin` del componente `Spinner`; el keyframe `animate-pulse` del componente `Skeleton`; los keyframes de transición de superficies glass; y cualquier animación del hero del landing (slice 1 entrega el hero como estático según la decisión bloqueada Q3). Los usuarios de reduced-motion MUST ver el estado final resuelto de cada elemento animado inmediatamente. Los componentes que dependen de animación para affordance (p.ej. un `Spinner` que señala carga) MUST reemplazarse con un marcador visual estático (p.ej. la palabra `Cargando…` o un glifo no animado) cuando reduced-motion está activo.

(Trazas: A6; Goal 4, User Story 5.)

#### Scenario: el keyframe del Spinner queda deshabilitado

- GIVEN: el OS reporta `prefers-reduced-motion: reduce`
- WHEN: se renderiza un `Spinner` en una página de carga
- THEN: la propiedad computada `animation` del elemento `Spinner` es `none`
- AND: un marcador de carga estático (texto o glifo) es visible

#### Scenario: el keyframe del Skeleton queda deshabilitado

- GIVEN: el OS reporta `prefers-reduced-motion: reduce`
- WHEN: se renderiza un placeholder `Skeleton`
- THEN: la propiedad computada `animation` del elemento `Skeleton` es `none`
- AND: el placeholder se renderiza como un bloque plano y estático

#### Scenario: las transiciones glass y las animaciones del hero quedan deshabilitadas

- GIVEN: el OS reporta `prefers-reduced-motion: reduce`
- WHEN: se dispara una transición de hover o focus de una superficie glass
- THEN: la propiedad computada `transition` es `none` (o duración 0ms)
- AND: el hero del landing (slice 1) se renderiza como una composición estática sin `animation-name` que refiera a floating-glow o keyframes relacionados

### Requirement: scaffold de i18n con `next-intl`, catálogos EN/ES, LanguageSwitcher (REQ-UI-17)

La aplicación MUST integrar `next-intl` para internacionalización. MUST haber dos catálogos de locale en `messages/en.json` y `messages/es.json`. La resolución de locale MUST seguir esta precedencia en el servidor: (1) el valor de la cookie `NEXT_LOCALE` si está seteado a `'en'` o `'es'`; (2) el header de petición `Accept-Language` — si la entrada de mayor peso empieza con `es` (p.ej. `es`, `es-AR`, `es-MX`, `es-ES`), la locale es `es`; si no, la locale es `en` (decisión bloqueada Q1: idiomas no soportados defaultean a English). Un `LanguageSwitcher` renderizado en el `Topbar` MUST cambiar la locale activa, persistir la elección en la cookie `NEXT_LOCALE`, y disparar una refresh de ruta del lado servidor. En viewports `width < 640px` (Tailwind `sm`) el `LanguageSwitcher` MUST colapsarse a un único ícono que abre un popover listando `Español` e `English` (decisión bloqueada Q2); en viewports `≥ sm` el switcher MAY renderizarse como botones inline o un dropdown. La única dependencia de producción nueva permitida por este cambio es `next-intl` (A13); ninguna otra entrada se agrega a `pnpm-lock.yaml`.

(Trazas: A8, A13; Goal 6, User Story 6.)

#### Scenario: Accept-Language en español resuelve a `es`

- GIVEN: una petición con `Accept-Language: es-AR,es;q=0.9,en;q=0.8`
- AND: ninguna cookie `NEXT_LOCALE` seteada
- WHEN: cualquier página se renderiza
- THEN: la locale activa es `es`
- AND: el copy renderizado resuelve contra `messages/es.json`

#### Scenario: Accept-Language en inglés resuelve a `en`

- GIVEN: una petición con `Accept-Language: en-US,en;q=0.9`
- AND: ninguna cookie `NEXT_LOCALE` seteada
- WHEN: cualquier página se renderiza
- THEN: la locale activa es `en`
- AND: el copy renderizado resuelve contra `messages/en.json`

#### Scenario: Accept-Language no soportado defaultea a `en`

- GIVEN: una petición con `Accept-Language: ja,fr;q=0.8`
- AND: ninguna cookie `NEXT_LOCALE` seteada
- WHEN: cualquier página se renderiza
- THEN: la locale activa es `en` (decisión bloqueada Q1)

#### Scenario: la cookie NEXT_LOCALE sobrescribe Accept-Language

- GIVEN: una petición con `Accept-Language: es-AR`
- AND: una cookie `NEXT_LOCALE=en`
- WHEN: cualquier página se renderiza
- THEN: la locale activa es `en`

#### Scenario: el LanguageSwitcher persiste la elección

- GIVEN: un usuario en cualquier página
- WHEN: el usuario activa el `LanguageSwitcher` y elige `English`
- THEN: la cookie `NEXT_LOCALE` se setea a `en`
- AND: una carga de página subsecuente renderiza en inglés independientemente del header `Accept-Language`

#### Scenario: placement de popover en viewports muy angostos

- GIVEN: un viewport de `320×568` (Tailwind base, `<sm`)
- WHEN: el `Topbar` se renderiza
- THEN: el `LanguageSwitcher` se renderiza como un único botón-ícono (no como links de texto inline)
- AND: activar el ícono abre un popover que contiene las etiquetas `Español` e `English`

### Requirement: Inter Variable + JetBrains Mono vía `next/font/google` (REQ-UI-18)

La tipografía MUST usar Inter Variable para texto de display y body, y JetBrains Mono para texto monoespaciado. Ambas familias de fuentes MUST cargarse vía `next/font/google` con `display: 'swap'` y `preload: true`. Los pesos pre-cargados MUST ser: Inter Variable en 400, 500, 600 y 700; JetBrains Mono en 400 y 500. El font loader MUST exponer las CSS custom properties `--font-inter` y `--font-jb-mono` en el elemento raíz. El `@theme` de Tailwind v4 MUST mapear `--font-sans: var(--font-inter)` y `--font-mono: var(--font-jb-mono)` de modo que las utility classes `font-sans` y `font-mono` resuelvan a las familias pre-cargadas. El HTML renderizado MUST NOT contener un `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` (ni ningún `<link>` apuntando al CDN de Google Fonts) — las fuentes MUST cargarse solo vía el pipeline de `next/font`. El preload de fuentes contribuye al target LCP-en-`/` ≤ 2.0 s p95 (A14) heredado de `transactions-ui`.

(Trazas: A7, A14; Goal 9.)

#### Scenario: las fuentes resuelven vía `next/font`

- GIVEN: cualquier página
- WHEN: se inspecciona el HTML renderizado
- THEN: el bloque `<style>` generado por `next/font` contiene declaraciones `@font-face` para Inter Variable y JetBrains Mono
- AND: ningún elemento `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` está presente
- AND: el elemento raíz lleva las CSS custom properties `--font-inter` y `--font-jb-mono`

#### Scenario: las utility classes de fuente de Tailwind resuelven a las familias pre-cargadas

- GIVEN: un elemento con clase `font-sans`
- WHEN: la página se renderiza
- THEN: el `font-family` computado resuelve al valor de `var(--font-inter)`
- AND: un elemento con clase `font-mono` resuelve a `var(--font-jb-mono)`

#### Scenario: los pesos pre-cargados están presentes

- GIVEN: la configuración de `next/font`
- WHEN: el build emite los assets de fuente
- THEN: el subset de Inter Variable contiene los pesos 400, 500, 600, 700
- AND: el subset de JetBrains Mono contiene los pesos 400, 500
- AND: cada archivo de peso lleva `<link rel="preload" as="font" ...>` emitido por `next/font`

### Requirement: los tokens de glassmorphism y gradient son APPEND-only (REQ-UI-19)

El archivo `app/_ui/tokens.css` MUST extenderse con las siguientes siete CSS custom properties, declaradas dentro de `@theme` (Tailwind v4) o el bloque `:root` equivalente: `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`. Las 14 variables de color pre-existentes declaradas en `app/_ui/tokens.css` MUST NOT ser modificadas — sus declaraciones, valores y orden MUST permanecer byte-for-byte sin cambios. Un `git diff` de `app/_ui/tokens.css` entre el commit pre-ui-redesign y el commit post-slice-1 MUST mostrar solo adiciones (líneas `+`) para los siete tokens nuevos; no se permiten líneas `−` contra las 14 variables de color existentes.

(Trazas: A10; decisión bloqueada "append-only tokens".)

#### Scenario: los tokens glass y gradient quedan declarados

- GIVEN: el `app/_ui/tokens.css` post-slice-1
- WHEN: el archivo se lee
- THEN: declara `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur`, `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to` como CSS custom properties (o tokens de tema de Tailwind v4)

#### Scenario: las variables de color pre-existentes quedan byte-for-byte sin cambios

- GIVEN: un `git diff` entre el commit pre-ui-redesign y el commit post-slice-1 sobre `app/_ui/tokens.css`
- WHEN: el diff se lee
- THEN: las 14 variables de color pre-existentes aparecen sin líneas `−` (sin remociones, sin ediciones a valores existentes)
- AND: el diff contiene solo líneas `+` para los siete tokens nuevos y cualquier scaffolding circundante requerido

### Requirement: superficies not-found y error en el nuevo lenguaje visual (REQ-UI-20)

Los archivos `app/not-found.tsx` y `app/error.tsx` MUST existir en la raíz del App Router (`app/`, no bajo ningún sub-segmento). Ambas superficies MUST renderizarse en el nuevo lenguaje visual (tarjeta glass sobre fondo gradiente, usando los tokens de REQ-UI-19). El copy visible MUST estar localizado vía `next-intl` de modo que un usuario español vea copy en español y un usuario inglés vea copy en inglés. Cada superficie MUST setear un `<title>` sensato (vía el export `metadata` de Next.js o un mecanismo equivalente): `not-found.tsx` MUST setear un título que incluya la frase localizada para not-found (p.ej. `No encontrado` / `Not found`); `error.tsx` MUST setear un título que incluya la frase localizada para error (p.ej. `Error` / `Error`). Ambas superficies MUST respetar la landmark `<main>`. La superficie `not-found.tsx` MUST incluir un CTA que enlace a `/`. Ninguna superficie MUST existir en el estilo legacy English-only de Tailwind (el histórico `app/not-found.tsx` entregado por `transactions-ui` no tenía copy localizado ni lenguaje glass; este requisito del anexo REQ-UI-23 se pliega en REQ-UI-20).

(Trazas: A9; User Story 4.)

#### Scenario: not-found renderiza copy localizado

- GIVEN: una petición a `/this-route-does-not-exist`
- AND: la locale activa es `es`
- WHEN: Next.js rutea la petición a `app/not-found.tsx`
- THEN: el status de la respuesta es `404`
- AND: el cuerpo renderizado contiene el copy en español `No encontrado`
- AND: el cuerpo renderizado contiene un link CTA con `href="/"`
- AND: el elemento `<title>` lee el título localizado de not-found
- AND: la página contiene una landmark `<main>`

#### Scenario: la superficie de error renderiza copy localizado

- GIVEN: cualquier Server Component lanza una excepción no manejada
- WHEN: Next.js rutea a `app/error.tsx`
- THEN: el cuerpo renderizado contiene el copy localizado `Error`
- AND: se expone un mecanismo de retry (ya sea un botón que llama a `reset()` o un link a la misma ruta)
- AND: el elemento `<title>` lee el título localizado de error
- AND: la página contiene una landmark `<main>`

#### Scenario: not-found / error usan el nuevo lenguaje visual

- GIVEN: `app/not-found.tsx` y `app/error.tsx` tal como se entregan en slice 1
- WHEN: el source se lee
- THEN: ambos archivos referencian tokens glass / gradient de `app/_ui/tokens.css` (REQ-UI-19)
- AND: ninguno de los archivos usa los string literals legacy English-only de Tailwind (`Page not found`, `Something went wrong`, etc.) como único copy

### Requirement: auditoría de contraste WCAG 2.2 AA en ambos temas (REQ-UI-21)

MUST haber una auditoría de contraste registrada en `docs/qa/ui-redesign.md`. La auditoría MUST cubrir cada par texto-sobre-fondo nuevo introducido por slice 1 en AMBOS temas, `light` y `dark`. La auditoría MUST registrar la herramienta usada (axe-core CLI, Lighthouse, Stark, o equivalente), la relación de contraste por par, el umbral WCAG 2.2 AA que aplica (4.5:1 para texto normal, 3:1 para texto grande y componentes UI), y el resultado pass/fail. La auditoría MUST cubrir como mínimo: el texto del hero del landing, las tres tarjetas de funcionalidad (heading, body, CTA), la superficie not-found, la superficie error, y los controles del chrome (`Topbar`, `Sidebar` / `BottomTabBar`, `LanguageSwitcher`, `ThemeToggle`). El verify gate MUST fallar a menos que la auditoría muestre cero pares por debajo del umbral.

(Trazas: A11; Goal 2, Goal 8, Risk R3.)

#### Scenario: el archivo de auditoría existe y se enlaza desde la evidencia de verify

- GIVEN: la fase de verify para slice 1
- WHEN: se lee `docs/qa/ui-redesign.md`
- THEN: el archivo nombra la herramienta usada
- AND: el archivo lista al menos las superficies enumeradas arriba
- AND: cada superficie tiene una tabla de ratios por par para ambos temas
- AND: el veredicto del archivo es `PASS` (cero pares por debajo del umbral)

#### Scenario: un par glass-texto falla la auditoría

- GIVEN: la auditoría identifica un par texto-sobre-fondo en el landing con una relación de contraste por debajo de 4.5:1 en dark mode
- WHEN: la auditoría se presenta al verify gate
- THEN: el verify gate falla para slice 1
- AND: el par fallido se lista en `docs/qa/ui-redesign.md` con guía de remediación (valor de token a ajustar, ratio objetivo, etc.)

### Requirement: el skip-to-content link es el primer elemento focuseable (REQ-UI-22)

MUST haber un skip-to-content link renderizado como parte del layout raíz `app/layout.tsx`. El skip link MUST ser el primer elemento focuseable en el orden de tabulación del documento en cada página (landing, rutas autenticadas, not-found, error). El skip link MUST apuntar a la landmark `<main>` de la página actual. El skip link MUST volverse visible cuando recibe foco (el styling por default del navegador es aceptable; el link MUST NOT estar permanentemente oculto vía `display: none` o `visibility: hidden`).

(Trazas: A3; Goal 2.)

#### Scenario: el usuario de teclado alcanza el skip link primero

- GIVEN: cualquier página de la aplicación
- WHEN: un usuario de teclado presiona Tab exactamente una vez desde la barra de direcciones
- THEN: el foco aterriza en el skip-to-content link
- AND: el link está visiblemente enfocado (focus ring o equivalente)

#### Scenario: activar el skip link salta a `<main>`

- GIVEN: el foco está en el skip-to-content link
- WHEN: el usuario presiona Enter o Space
- THEN: el navegador scrollea el foco al elemento `<main>` de la página actual
- AND: el foco se mueve al primer elemento focuseable dentro de `<main>` (o a `<main>` mismo si tiene `tabindex="-1"`)

### Requirement: alcance de superficies de i18n para slice 1 (REQ-UI-24)

Para slice 1, los catálogos de i18n `messages/en.json` y `messages/es.json` MUST resolver strings solo en las superficies introducidas por este cambio: el landing de marketing en `/`, las superficies `not-found.tsx` y `error.tsx`, y el chrome (`Topbar`, `Sidebar`, `BottomTabBar`, `LanguageSwitcher`, `ThemeToggle`, labels de navegación). Las siete superficies de producción entregadas por el cambio archivado `transactions-ui` — `/dashboard`, `/accounts`, `/accounts/[id]`, `/accounts/new`, `/transactions`, `/transactions/[id]`, `/transactions/new` — MUST permanecer en su mezcla actual de idioma (EN/ES mixto según lo documentado en la spec canónica de ui §Glossary bajo `Mixed EN/ES copy`); slice 1 MUST NOT migrar su copy. El fallback de `next-intl` MUST estar configurado de modo que cualquier key presente en un catálogo pero ausente en el otro retorne la key presente verbatim, nunca lance, y nunca bloquee el render.

(Trazas: lista Out of Scope en `openspec/changes/ui-redesign/proposal.md`.)

#### Scenario: las superficies de producción quedan en su mezcla actual de idioma

- GIVEN: un usuario hispanohablante (`NEXT_LOCALE=es` o `Accept-Language` con `es*`) en `/accounts` en slice 1
- WHEN: la página se renderiza
- THEN: la página renderiza el mismo copy que entregaba antes de ui-redesign (EN/ES mixto, según la entrada de glosario `Mixed EN/ES copy` de la spec canónica de ui)
- AND: ningún copy traducido se fuerza dentro de la superficie de producción

#### Scenario: una key de traducción faltante cae al string de la key

- GIVEN: una key de string `landing.cta.primary` existe en `messages/es.json` pero está ausente en `messages/en.json`
- WHEN: un usuario inglés llega al landing
- THEN: el texto renderizado del CTA es el string literal `landing.cta.primary` (sin throw, sin blank space, sin stack trace)
- AND: el verify gate MAY loguear un warning de key faltante

## MODIFIED Requirements

### Requirement: v1 entrega un único tema light (REQ-UI-9)

La aplicación MUST soportar tres modos de tema — `system`, `light` y `dark` — cableados a través de `prefers-color-scheme` más un `ThemeToggle` manual en el `Topbar`. La tabla de tokens en `app/_ui/tokens.css` MUST declarar valores de light-mode como defaults y valores de dark-mode bajo el selector `.dark` (o scope CSS equivalente). MUST haber tanto valores light como dark presentes en el archivo al final del slice 1; los tokens dark se activan vía el toggle `<html class="dark">` establecido en REQ-UI-14. El override manual persiste en `localStorage` bajo `ui.theme`; la precedencia es manual > preferencia OS > default (ver REQ-UI-14).

(Previamente: "v1 entrega un único tema light. La tabla de tokens en `app/_ui/tokens.css` MAY declarar valores de token de dark-mode vía CSS custom properties (para que el cambio de seguimiento `ui-dark-mode` sea non-breaking), pero v1 MUST NOT renderizar los tokens dark. El dashboard MUST NOT incluir un theme toggle." — superado por el tema de tres estados de ui-redesign; el mecanismo `<html class="dark">` reemplaza la guardia v1 de la variante Tailwind `dark:`.)

#### Scenario: ambos temas quedan declarados y dark está activo cuando se togglea

- GIVEN: `app/_ui/tokens.css` después de slice 1
- WHEN: el archivo se lee
- THEN: los valores de light-mode son los defaults
- AND: los valores de dark-mode quedan declarados bajo el selector `.dark`
- AND: un usuario que togglea el `ThemeToggle` a `dark` causa que la UI renderizada cambie de paleta sin recargar

#### Scenario: las variantes Tailwind dark están permitidas y resuelven

- GIVEN: el codebase del slice 1
- WHEN: `git grep` corre por `dark:` dentro de `app/_ui/`, `app/accounts/`, `app/transactions/`, `app/dashboard/`, `app/_components/`
- THEN: las variantes Tailwind `dark:` MAY aparecer (la guardia original "cero variantes `dark:`" de `transactions-ui` ya no aplica)
- AND: cualquier variante `dark:` resuelve a un valor declarado bajo el selector `.dark` en `app/_ui/tokens.css`
