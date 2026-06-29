# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-06-29

### Added

- **Capacidad `ui` de extremo a extremo** (#98 #99 #100 #101 #102 #103, slice 6 de
  `transactions-ui`): la nueva referencia del sistema de diseño - capa de
  render de producción. La capacidad está construida a mano sobre Tailwind v4
  - React 19 con **cero nuevas dependencias top-level** (`pnpm-lock.yaml`
  - sin cambios desde v0.3.0). Alcance:
  * **18 primitivas del sistema de diseño** en `app/_ui/primitives/`:
    `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`,
    `Combobox` (Client), `FieldError`, `FormField`, `Card` +
    sub-componentes, `Table` + sub-componentes, `Badge`, `EmptyState`,
    `Spinner`, `Skeleton`, `Pagination`, `Dialog` (Client), `Breadcrumb`,
    `Link`. Cada primitiva tiene un test unitario que asserta su contrato
    de a11y (atributos `role`, propagación `aria-*`, emparejamiento
    label / control).
  * **5 primitivas del layout shell** en `app/_ui/layout/`:
    `PageHeader`, `PageContainer`, `BreadcrumbBar`, `Sidebar`
    (declarada hacia adelante, no usada en v1), `Topbar` (declarada
    hacia adelante, no usada en v1).
  * **Tabla de tokens** en `app/_ui/tokens.css` declarando los tokens
    del tema claro v1 como custom properties CSS, más el scope de
    dark mode bajo `[data-theme='dark']` para compatibilidad hacia
    adelante no breaking (REQ-UI-9 / BR-UI-8).
  * **Superficies de UI de producción** que reemplazan las tres smoke
    pages: `/accounts`, `/accounts/:id`, `/accounts/new`,
    `/transactions`, `/transactions/:id`, `/transactions/new`,
    `/dashboard`. Cada superficie cubre los cuatro estados de UI
    (empty, loading, error, success) según REQ-UI-3 y mantiene la
    guarda de Server Component `auth()`.
  * **Boundaries de error user-facing** por segmento de ruta:
    `app/error.tsx`, `app/dashboard/error.tsx`,
    `app/accounts/error.tsx`, `app/transactions/error.tsx`.
  * **Dos flags aditivos de query** en endpoints GET existentes:
    `?include=lastActivity` en `GET /api/accounts` (REQ-UI-1) y
    `?include=accountName` en `GET /api/transactions` (REQ-UI-2). Los
    endpoints sin el flag permanecen byte-idénticos al contrato
    pre-`transactions-ui` — puramente aditivo.
  * **Dos Client Components para el estado de query-params del
    dashboard**: `app/_components/dashboard-account-picker.tsx`
    (navega a `?accountId=<id>`) y
    `app/_components/dashboard-month-switcher.tsx` (renderiza
    `<Link>`s para mes anterior / actual / siguiente).
  * **Suite de tests de integración con axe-core** en `tests/a11y/`: un
    test `vitest-axe` por página de producción que asserta cero
    violaciones `critical` + `serious` (piso WCAG 2.2 AA).
  * **Suite de tests de snapshot visual** en `tests/visual/`:
    snapshots golden-file para las primitivas presentacionales
    estáticas (`Card`, `Badge`, `EmptyState`, `Skeleton`, `Breadcrumb`).
  * **Suite de tests E2E happy-path** en `tests/e2e/`: journeys de
    usuario completos (list → detail → create → submit; dashboard
    account picker + month switcher).
  * **Referencia del sistema de diseño** en `docs/architecture/ui.md`
    (el catálogo público que codifica REQ-UI-10): tabla de tokens
    (scope CSS light + dark), inventario de 18 primitivas con shape
    de props + contrato de a11y por primitiva, inventario de 5
    layout shells, y contratos cross-cutting (indicador de foco,
    emparejamiento de labels, errores inline, estado de loading al
    submit, caption / scope / aria-sort de tablas, sin variantes
    dark, imports basados en path).
  * **Checklist de QA manual** en `docs/qa/transactions-ui.md`
    (codifica REQ-UI-11): barrido de teclado por página, contrato
    de teclado cross-page, surfaceo de errores de formulario, paso
    de screen reader en VoiceOver (macOS) + NVDA (Windows), chequeo
    manual de aislamiento cross-user, nota de seguimiento de
    dark mode, sección informativa de axe-core, y una sección de
    sign-off owned-by-user. Ejecutable en 30–45 minutos.
  * **Verificación del budget de performance** en
    `docs/perf/transactions-ui.md`: los comandos de Lighthouse CLI,
    el perfil de throttling 4G + Moto G4 simulado, el budget p95
    page load < 2s en `/`, `/dashboard` y `/transactions`,
    placeholders de resumen JSON para las tres páginas, y la
    mitigación por failure de budget de `design.md §16.5`.

### Changed

- **Spec `transactions`** (`openspec/specs/transactions/spec.md`):
  REQ-TX-15 (el requerimiento original "Three smoke pages mirror the
  accounts slice") es **REEMPLAZADO** por un puntero delgado a la
  nueva capacidad `ui` (`openspec/specs/ui/spec.md` REQ-UI-1 a
  REQ-UI-11). Todos los demás requerimientos (REQ-TX-1 a REQ-TX-14)
  se preservan verbatim. El reemplazo es non-breaking: sin cambios
  de BR, sin cambios de rutas Hono, sin cambios de modelo de datos,
  sin nuevas dependencias top-level.
- **Limpieza 4R aterrizada en este release** (#104): los top-5
  findings de la revisión 4R post-merge de `transactions-ui` se
  arreglaron en un único PR — remoción de casts `as`, adición de
  boundary `Suspense`, corrección de la directiva `'use client'`,
  switch a formato UUID, y alineación del conteo de primitivas en
  `docs/architecture/ui.md` con el código fuente.

### Notes

- La UI de producción v1 se entrega con un **único tema claro**
  (REQ-UI-9). Los tokens de dark mode están declarados pero sin
  uso; el cambio follow-up `ui-dark-mode` los activa seteando
  `data-theme="dark"` en el document root.
- i18n (inglés / español) es copy mixto EN/ES siguiendo la
  convención preexistente del proyecto (copy del dashboard en
  español, texto de UI a nivel de componente en inglés). El cambio
  follow-up `ui-i18n` introduce un message catalog.
- **Follow-ups post-release owned-by-user** (T-UI-505 sweep de
  Lighthouse p95 < 2s en `/`, `/dashboard`, `/transactions`;
  T-UI-506 sign-off manual de QA según `docs/qa/transactions-ui.md`)
  están intencionalmente **diferidos a después de que se corte el
  tag v0.4.0**. Los resúmenes JSON en `docs/perf/transactions-ui.md`
  y la sección de sign-off en `docs/qa/transactions-ui.md` están
  pending hasta que el usuario los ejecute post-release. Ninguno
  es un blocker del release — ambos son artefactos de
  observabilidad + sign-off que el maintainer puede ejecutar en
  cualquier momento contra el tag v0.4.0.

[0.2.0]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.2.0
[0.2.1]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.2.1
[0.3.0]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.3.0
[0.4.0]: https://github.com/Sebailla/gastos-personales/releases/tag/v0.4.0
