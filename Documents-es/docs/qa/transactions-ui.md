# Checklist manual de QA — `transactions-ui`

**Autor**: Sebastián Illa
**Capability**: `ui`
**Cambio fuente**: `transactions-ui`
**Estado**: implementado · **Sign-off**: pendiente (owner es el usuario; ver §7)
**Audiencia**: project owner ejecutando la pasada manual de QA antes de `sdd-verify`
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4

> Codifica REQ-UI-11 de `openspec/specs/ui/spec.md`. El checklist
> cubre cada página de producción (`/`, `/accounts`, `/accounts/:id`,
> `/accounts/new`, `/transactions`, `/transactions/:id`,
> `/transactions/new`, `/dashboard`) en navegación por teclado,
> comportamiento con screen reader, y scope de tema oscuro. Por el
> riesgo §16.6 del design, el owner del QA manual es **el
> usuario**, no el orchestrator; la verify gate falla hasta que el
> usuario firme el checklist en §7.
>
> El checklist está estructurado para correr en **30–45 minutos**
> en una sola pasada de screen reader por plataforma (VoiceOver en
> macOS; NVDA en Windows). La estructura página por página permite
> re-correr una sola página después de un cambio de UI sin repetir
> toda la pasada.
>
> El espejo en español vive en este archivo; el original en inglés
> está en `docs/qa/transactions-ui.md`.

---

## 1. Prerrequisitos

Antes de correr el checklist, prepará:

- [ ] Una cuenta seeded con **al menos 3 cuentas** (mezcla de
      monedas `ARS | USD | EUR` si multi-moneda importa para la
      prueba) y **al menos 10 transacciones** distribuidas en dos
      meses para que los reports del dashboard tengan data
      significativa.
- [ ] Una segunda cuenta seeded (el check "cross-user" en §6
      solo requiere que conozcas el `userId` del otro usuario —
      podés leerlo de la URL de sus páginas de detalle después de
      iniciar sesión como él).
- [ ] **macOS** con VoiceOver habilitado (Cmd+F5) para §3 + §5.
- [ ] **Windows** con NVDA instalado (el instalador está en
      <https://www.nvaccess.org/download/>) para la pasada
      cross-platform de §5.
- [ ] Browser: Chrome (estable actual) para la pasada inicial.
      Opcional: Firefox o Safari para spot-checks cross-browser
      en items `[ ]` de §2.4.

> **Tip.** Corré la pasada de teclado (§3) primero. Es la más
> rápida y captura ~70% de las regresiones (focus traps, labels
> faltantes, activación por teclado). La pasada de screen reader
> (§5) va después de la pasada de teclado porque el screen reader
> va a surfacear cualquier cosa que la pasada de teclado se haya
> perdido.

---

## 2. Navegación por teclado página por página

Para cada página de abajo, la pasada de teclado TIENE que pasar
antes de que corra la pasada de screen reader.

### 2.1 `/` (root)

- [ ] Apretar **Tab** desde una carga fresca lleva el foco
      primero al link "Skip to content"; activarlo mueve el foco
      al contenido principal (el root layout de Next.js App
      Router lo provee por convención).
- [ ] El tab order matchea el orden visual (sin overrides de
      `tabIndex`).
- [ ] Todo elemento interactivo tiene un ring de foco visible
      (`focus-visible:ring-2`); ratio de contraste ≥ 3:1 contra
      el fondo.

### 2.2 `/accounts` (listado)

- [ ] El page header tiene un `<h1>` ("Cuentas"); la descripción
      es la segunda área focuseable cuando se llega vía Tab.
- [ ] El botón "+ Nueva cuenta" es focuseable y se activa vía
      **Enter** y **Space** (comportamiento nativo de `<button>`;
      no hace falta handler de teclado custom).
- [ ] El `<table>` de cuentas renderiza:
  - [ ] `<caption>` presente (visible o `sr-only`).
  - [ ] Cada `<th>` tiene `scope="col"`.
  - [ ] Clickear un header de columna sortable (Name, Last
        activity) foca un `<button>` adentro del `<th>`; apretar
        **Enter** con el botón focuseado dispara el sort.
  - [ ] Después del sort, el `aria-sort` del header focuseado
        alterna entre `ascending` / `descending` / `none`.
- [ ] El toggle "Show archived" es un `<Checkbox>` emparejado
      con un `<label>`; togglear vía **Space** revela / oculta
      las filas archivadas.
- [ ] Empty state (borrá todas las cuentas temporalmente si hace
      falta):
  - [ ] La página renderiza el primitive `EmptyState` con
        `role="status"`.
  - [ ] El CTA ("Crear primera cuenta") es el primer elemento
        focuseable cuando está presente.

### 2.3 `/accounts/:id` (detalle)

- [ ] Un `<h1>` para el título de la página (nombre de la
      cuenta).
- [ ] CardHeader renderiza `<h2>` con el mismo título y un Badge
      para la moneda de la cuenta; el Badge es decorativo (no
      focuseable).
- [ ] CardBody renderiza filas key-value; cada fila es un `<dl>`
      visualmente (no es estrictamente requerido para a11y, pero
      lo que importa es la jerarquía de headings).
- [ ] Los botones "Edit" y "Archive" de CardFooter se activan vía
      **Enter** y **Space**.
- [ ] Después de Archive (con confirmación): la página redirige
      a `/accounts` y el badge de archivado aparece en la fila.

### 2.4 `/accounts/new` (crear)

- [ ] El `<h1>` del page header es "Nueva cuenta"; la descripción
      lee "Cargá los datos de la cuenta. El nombre es visible
      solo para vos."
- [ ] Tab order: Name → Currency → Casa → Submit. (Archived está
      oculto por defecto en v1 — no hay toggle de archived en
      create.)
- [ ] Cada campo tiene un `<label htmlFor="<id>">` emparejado;
      apretar **Tab** desde el label foca el input.
- [ ] Submit con Name vacío renderiza un mensaje de error inline
      abajo del campo Name; el campo tiene `aria-invalid="true"`
      y `aria-describedby` apuntando al `id` del error.
- [ ] El botón submit transiciona a estado de loading al click:
      `disabled` + `aria-busy="true"` + icono `<Spinner>`
      visible. Un segundo click mientras está cargando se
      **ignora** (debounced por `useActionState` de React 19).
- [ ] En 201, la página redirige a `/accounts` y la nueva fila
      aparece en el listado.

### 2.5 `/transactions` (listado)

- [ ] Mismo contrato de a11y de `Table` que `/accounts` (§2.2) —
      caption, scope, headers sortables con `aria-sort` + `<button>`
      interno.
- [ ] El par de columnas "Native amount" / "Converted amount"
      renderiza ambos valores cuando la moneda de la transacción
      difiere de la casa de la cuenta; cuando native=casa, solo
      se renderiza una columna (el native amount).
- [ ] El footer de paginación abajo es un landmark `<nav
      aria-label="Pagination">`. Tab lleva a "Previous", después
      cada número de página, después "Next". La página actual
      tiene `aria-current="page"` y se distingue visualmente.
- [ ] Empty state: la página renderiza el `EmptyState` con CTA
      "Crear primera transacción" linkeando a
      `/transactions/new`.

### 2.6 `/transactions/:id` (detalle)

- [ ] Un `<h1>` para el título de la página (p. ej. "Transacción
      tx_…").
- [ ] CardHeader renderiza `<h2>` con el id de la transacción y
      un Badge para la dirección (`INCOME` → success, `EXPENSE` →
      danger).
- [ ] El body de detalle renderiza la fila en un layout key-value;
      `fxAsOfSnapshot` se renderiza como texto plano "Rate as of:
      <ISO>" (REQ-TX-15 Scenario).
- [ ] Las acciones "Edit" + "Delete" viven en CardFooter. Delete
      muestra un `Dialog` de confirmación:
  - [ ] El Dialog tiene `role="dialog"` + `aria-modal="true"` +
        `aria-labelledby` apuntando al `<h2>` del Dialog.
  - [ ] El foco se mueve al primer elemento focuseable dentro
        del Dialog (el botón Cancel por convención).
  - [ ] **Escape** cierra el Dialog y devuelve el foco al
        trigger.
  - [ ] **Tab** cycla foco dentro del Dialog (focus trap);
        tabbear pasado el último elemento wrappea al primero.
  - [ ] Click en backdrop cierra el Dialog.

### 2.7 `/transactions/new` (crear)

- [ ] Mismo contrato de field-pairing que `/accounts/new` (§2.4).
- [ ] El campo `accountId` usa el primitive `Combobox` (Client
      Component). En el input de búsqueda:
  - [ ] Tipear filtra las opciones visibles por
        `option.label`.
  - [ ] **Escape** limpia la query (NO cierra la página).
  - [ ] **ArrowDown** / **ArrowUp** navegan las opciones
        filtradas.
  - [ ] **Enter** selecciona la opción focuseada; el input de
        búsqueda visual se limpia y el valor de la página se
        actualiza.
- [ ] Submit con `amountMinor = 0` devuelve un error inline desde
      la API (`INVALID_AMOUNT`); el error se mapea al campo
      amount vía el mapper `errorEnvelope → fieldError`.
- [ ] Submit con `transactionDate > hoy` devuelve
      `FUTURE_DATE_NOT_ALLOWED`; el error se mapea al campo date.
- [ ] Submit contra una cuenta archivada devuelve
      `ACCOUNT_ARCHIVED`; el error se renderiza inline junto al
      account picker.
- [ ] En 201, la página redirige a `/transactions`; la nueva
      fila aparece arriba del listado.

### 2.8 `/dashboard`

- [ ] El `<h1>` del page header es "Resumen" (copy en español por
      la convención de mezcla EN/ES de `design.md` §12.1).
- [ ] Tres cards se renderizan side-by-side en `lg`, apiladas en
      `sm`: Monthly summary, Category breakdown, Account flow.
- [ ] El account picker (Client Component) navega a
      `?accountId=<id>` al seleccionar. El picker es un `<select>`
      con `aria-label="Elegir cuenta"`; **Tab** lo foca y
      **Enter** / handler nativo de change submitea.
- [ ] El month switcher renderiza tres controles `<Link>`
      (Previous / Current / Next); el mes actual tiene
      `aria-current="page"`.
- [ ] Con `?accountId=<A>`, la card de Account flow fetcha
      `/api/reports/accounts/<A>/flow` y renderiza el flujo
      diario. Sin `?accountId`, la flow card renderiza un
      `EmptyState` ("Seleccioná una cuenta para ver su flujo").
- [ ] Empty state (cero transacciones este mes): las tres cards
      renderizan su variante de `EmptyState` con copy en español
      razonable ("Sin movimientos en el mes", "Sin desglose por
      categoría", "Sin flujo para mostrar").

---

## 3. Navegación por teclado — cross-page

Estos checks verifican el contrato cross-page más allá de la lista
por página de arriba.

- [ ] Todo elemento interactivo a través de todas las páginas es
      alcanzable vía **Tab**. Ningún elemento está oculto del
      tab order de teclado (sin `tabIndex={-1}` en elementos
      interactivos).
- [ ] **Shift+Tab** navega hacia atrás en el mismo orden.
- [ ] **Enter** activa controles `<button>` y `<Link>`
      nativamente.
- [ ] **Space** activa controles `<button>` y `<Checkbox>`
      nativamente.
- [ ] **Escape** cierra cualquier `Dialog` abierto y cualquier
      dropdown de `Combobox` abierto (el Combobox limpia la
      query; el Dialog se desmonta).
- [ ] **Home** / **End** saltan a la primera / última opción
      dentro del `Combobox` (comportamiento nativo del
      `<select>`).
- [ ] En submit de formulario con error, el foco se mueve al
      primer campo inválido (o se queda en el botón submit si
      ningún campo puede recibir foco).
- [ ] Después de una navegación, el foco se resetea al tope de
      la página (o al `<h1>` de la página por convención de
      Next.js App Router); no queda foco residual de una página
      previa.

---

## 4. Surfacing de errores de formulario

Todo error de formulario TIENE que renderizarse inline con
`aria-describedby`. Alertas arriba del formulario PUEDEN existir
como superficie secundaria pero NO TIENEN que ser la única
superficie de error.

- [ ] Submit de cualquier formulario con un campo requerido
      vacío renderiza el mensaje de error abajo de ese campo
      específico (no arriba del formulario).
- [ ] El atributo `aria-invalid="true"` del campo se setea
      cuando hay un error presente.
- [ ] El atributo `aria-describedby` del campo apunta al `id`
      del elemento `FieldError`.
- [ ] Los screen readers anuncian el error cuando aparece
      (verificado en §5).
- [ ] Alerta arriba del formulario (si está presente) se
      renderiza como superficie secundaria, nunca como la única.

---

## 5. Pasada de screen reader

### 5.1 VoiceOver (macOS)

- [ ] Habilitar VoiceOver (Cmd+F5). Usar VO+Right / VO+Left
      para navegar.
- [ ] **Landmarks.** En cada página, el rotor (VO+U) lista:
  - [ ] Un `<header>` (el `PageHeader`).
  - [ ] Un `<main>` (el `PageContainer`).
  - [ ] Uno o dos `<nav>` (`BreadcrumbBar` + `Pagination`
        cuando están presentes).
  - [ ] Cero landmarks stray (sin `<section>` huérfanos sin
        accessible name).
- [ ] **Headings.** El rotor (VO+Cmd+H) lista headings en este
      orden sin niveles salteados:
  - [ ] Un `<h1>` por página (el título del `PageHeader`).
  - [ ] `<h2>` por CardHeader en la página.
  - [ ] `<h3>` solo dentro de Cards (p. ej. título del
        EmptyState).
- [ ] **Tables.** En `/accounts` y `/transactions`, VO lee el
      caption (cuando no es `sr-only`); en una celda, VO lee el
      header de columna.
- [ ] **Labels de formulario.** Tab por cada campo de
      formulario en `/accounts/new` y `/transactions/new`; VO lee
      el label emparejado con cada campo. Disparar un error de
      submit hace que VO anuncie el error inline (el `aria-live`
      en `FieldError` se dispara).
- [ ] **Dialogs.** En el Dialog "Delete transaction" en
      `/transactions/:id`, VO anuncia "dialog" al focus, lee el
      título, y lee la descripción. **Escape** cierra el Dialog
      y VO anuncia "dialog dismissed".
- [ ] **Estado de loading.** Al submit de cualquier formulario,
      VO anuncia el estado `aria-busy="true"` en el botón submit
      y el texto "Loading" del `aria-label` del Spinner.

### 5.2 NVDA (Windows)

- [ ] Arrancar NVDA (Ctrl+Alt+N). Usar la lista de elementos
      (NVDA+F7) para verificar los mismos contratos de landmark
      / heading / table que §5.1.
- [ ] Formularios: NVDA lee el label emparejado con cada campo
      al foco. Disparar un error de submit hace que NVDA
      anuncie el error inline.
- [ ] Dialogs: NVDA anuncia "dialog" al foco + lee el título y
      la descripción.

---

## 6. Aislamiento cross-user (manual)

Por BR-TX-4, el acceso cross-user TIENE que devolver `404
NOT_FOUND` (sin leak de información). La UI surfacea esto como
`redirect` en la página de detalle; la página de listado solo
muestra las filas del caller.

- [ ] Iniciar sesión como usuario A. Anotar el id de una
      transacción `id = tx_abc123`.
- [ ] Cerrar sesión. Iniciar sesión como usuario B.
- [ ] Visitar `/transactions/tx_abc123` como usuario B: la página
      redirige a `/transactions` (o muestra un 404 / mensaje
      "No encontrado").
- [ ] En `/transactions`, el listado muestra SOLO las
      transacciones del usuario B. Las filas del usuario A están
      ausentes.

---

## 7. Nota de follow-up de tema oscuro (fuera de scope para v1)

Por REQ-UI-9 / BR-UI-8, v1 entrega **un único tema claro**. La
tabla de tokens declara valores de modo oscuro bajo
`[data-theme='dark']` en `app/_ui/tokens.css` para compatibilidad
futura no-breaking, pero v1 NO TIENE que renderizar los tokens
oscuros.

- [ ] **v1 no incluye un toggle de tema.** Ningún control
      visible para el usuario cambia a modo oscuro.
- [ ] La tabla de tokens en `app/_ui/tokens.css:74-89` está
      presente y declarada pero sin uso.
- [ ] **No hay variantes Tailwind `dark:`** en ninguna parte de
      las páginas de producción (un check de `git grep` asserta
      esto; la verify gate corre el mismo check).
- [ ] Un cambio follow-up `ui-dark-mode` activa los tokens
      oscuros seteando `data-theme="dark"` en el document root.
      Fuera de scope para v1.

---

## 8. Contrato axe-core (informativo)

La verify gate (slice 5) corre `vitest-axe` sobre cada página de
producción. La asserción del test es
`expect(results).toHaveNoViolations()` que falla ante cualquier
violación `critical` o `serious`. La pasada manual de QA es el
**complemento humano** al check automatizado; surfacea issues que
axe-core no puede detectar (p. ej. orden de anuncio del screen
reader, focus management en Client Components custom).

- [ ] La suite `tests/a11y/` pasa localmente (`pnpm test
      tests/a11y`) — informativo; el orchestrator corre esto en
      slice 5.
- [ ] Las violaciones `moderate` y `minor` NO son blockers pero
      DEBERÍAN loguearse como items de backlog.

---

## 9. Sign-off

> El usuario (project owner) firma el checklist una vez que todas
> las cajas `[ ]` de arriba son `[x]`. El orchestrator NO firma en
> nombre del usuario; la verify gate falla hasta que esta sección
> tenga una línea `Signed off by:` no vacía y una fecha.

- **Signed off by**: _______________________________
- **Date**: _______________
- **Notes** (opcional — surfaceá cualquier cosa que el usuario
  quiera que el reviewer sepa, p. ej. "salteé §5.2 porque hoy no
  tengo una máquina con Windows; corrí solo §5.1 en macOS"):