# QA — `ui-redesign` — auditoría de contraste WCAG 2.2 AA

> Autor: Sebastián Illa
> Cambio: `openspec/changes/ui-redesign`
> Fuente de la spec: `openspec/changes/ui-redesign/specs/ui/spec.md` REQ-UI-21
> Estado: stub — PR 1 de 5 slices encadenadas; las filas por par se completan en PR 5 (audit+docs) cuando aterricen los nuevos tokens glass, las variantes de tema y el chrome.

Este archivo es la auditoría de contraste autoritativa para las nuevas superficies visuales que entrega `ui-redesign`. Es referenciado por:

- `openspec/changes/ui-redesign/specs/ui/spec.md` REQ-UI-21 — cada par nuevo en ambos temas queda registrado acá.
- `openspec/changes/ui-redesign/tasks.md` T-PR1-10 — este stub se crea en PR 1 para que los PRs siguientes tengan landing page.
- La suite de Vitest que se agrega en PR 5 (`tests/e2e/ui-redesign.spec.ts`) — Playwright + axe-core barre las nuevas páginas `/`, `not-found` y `error` y cruza contra las filas por par de abajo.

## Tabla de contraste por par (se completa en PR 5)

| Par                                               | Token fg        | Token bg          | ratio light | ratio dark | WCAG 2.2 AA | Notas |
| ------------------------------------------------- | --------------- | ----------------- | ----------- | ---------- | ----------- | ----- |
| `--ui-fg` sobre `--ui-glass-bg`                   | `--ui-fg`       | `--ui-glass-bg`   | TBD         | TBD        | requerido   |       |
| `--ui-fg-muted` sobre `--ui-glass-bg`             | `--ui-fg-muted` | `--ui-glass-bg`   | TBD         | TBD        | requerido   |       |
| `--ui-accent` sobre `--ui-glass-bg`               | `--ui-accent`   | `--ui-glass-bg`   | TBD         | TBD        | requerido   |       |
| Heading grande sobre substrato de gradiente (`/`) | `--ui-fg`       | `--ui-gradient-*` | TBD         | TBD        | requerido   |       |

## Cómo se completa este archivo

Por REQ-UI-21, cada par visual nuevo que introduzca el cambio debe tener su contraste medido en **ambos** temas (`light` y `dark`) y el resultado registrado en la tabla de arriba. La metodología de medición:

1. Renderizar el par en el tema objetivo (light o dark) en JSDOM con los tokens de producción resueltos.
2. Usar `axe-core` (vía `vitest-axe`) para leer el `color` y `background-color` computados del DOM renderizado.
3. Calcular el ratio de contraste WCAG 2.2 con la fórmula estándar:
   - `L = 0.2126 * R' + 0.7152 * G' + 0.0722 * B'` (luminancia relativa).
   - `ratio = (L_clara + 0.05) / (L_oscura + 0.05)`.
4. Criterio de pase: ratio ≥ **4.5 : 1** para cuerpo de texto, ≥ **3 : 1** para texto grande (≥ 18.66 px bold o ≥ 24 px regular).
5. Registrar el ratio crudo y el pasa/no-pasa en la tabla. Las filas que no pasen bloquean que PR 5 se marque como `Ready for verify`.

## Auditoría de transparencias reducidas

La media query `prefers-reduced-transparency: reduce` en `app/globals.css` (agregada en PR 2) reemplaza el `backdrop-filter: blur(...)` glass por un sólido de alta opacidad. La auditoría confirma que la variante sólida mantiene ≥ 4.5 : 1 de contraste en cada superficie glass.

## Auditoría de motion reducido

La media query `prefers-reduced-motion: reduce` en `app/globals.css` (agregada en PR 2) colapsa todas las animaciones a 0.01 ms. Esto se registra acá por completitud aunque no sea un par de contraste.

## Procedencia

- Creado en PR 1 (`feat/ui-redesign-foundation`) por T-PR1-10.
- Completado en PR 5 (`feat/ui-redesign-audit-docs`) por T-PR5-XX (TBD cuando se escriban las tasks de PR 5).
- Espejo en español en `Documents-es/docs/qa/ui-redesign.md` por `AGENTS.md` §13.3.
