# Tailwind v4 — Hazards del Content-Scanner

> Por qué existe esta página. El incidente del PR #113 (2026-07-01)
> fue causado por un único comentario JSDoc que contenía la notación
> abreviada `bg-ui-glass-{1,2}` + `backdrop-blur-[var(--ui-glass-blur-{sm,lg})]`
> en `app/_ui/primitives/glass-card.test.tsx`. El content scanner de
> Tailwind v4 extrajo esos tokens de brace-expansion como si fueran
> clases reales, los emitió al CSS generado y PostCSS crasheó con
> `Unexpected token CurlyBracketBlock` en build time, dejando
> `/es` con HTTP 500 en modo dev.
>
> PR #113 arregló el síntoma inmediato. PR #115 agregó esta página +
> el guard `pnpm run check:tailwind-scanner` para prevenir
> reincidencia.

## El hazard

Tailwind v4 usa un **content scanner** para encontrar utility classes
en los archivos fuente. Grepea `.ts`, `.tsx`, `.md`, `.mdx` (y otros
formatos de texto) buscando tokens que _parezcan_ utility classes,
cualquier cosa que matchee el patrón `[a-z]+(-[a-z]+)*`.

El scanner **no parsea el código como código**. Trata string
literals, comentarios JSDoc, regex patterns y prosa por igual. Cualquier
cosa que _parezca_ una clase es extraída.

El hazard: **notación de brace-expansion**. Tailwind v4 NO soporta
`{a,b}` en nombres de clases (era una feature de v3 que se removió
en v4). Pero el content scanner no sabe eso y va a:

1. Encontrar el texto literal `bg-ui-glass-{1,2}` en tu fuente.
2. Emitir una regla CSS con ese selector en el stylesheet generado.
3. PostCSS intenta parsear `{1,2}` como valor CSS.
4. PostCSS falla: `Unexpected token CurlyBracketBlock`.

El build sigue completando (warning, no error) y la ruta afectada
devuelve HTTP 500.

## La regla

**Nunca escribas tokens de utility class con brace-expansion en
archivos fuente.**

Usá prosa o dos nombres de clase literales:

```diff
-`bg-ui-glass-{1,2}` + `backdrop-blur-[var(--ui-glass-blur-{sm,lg})]`
+`bg-ui-glass-1` (or `bg-ui-glass-2`) +
+`backdrop-blur-[var(--ui-glass-blur-sm)]` (or `-[lg]`)
```

Aplica a: comentarios JSDoc, documentación en prosa, regex literals que
documentan el patrón (evitarlos también), docs en Markdown, en
cualquier lado donde un token con forma de utility class se pueda
confundir con una clase real.

## El guard

`scripts/check-tailwind-content-scanner.ts` grepea el codebase
buscando el patrón del hazard y falla CI / pre-commit ante cualquier
match fuera del allowlist fixture.

Ejecutar localmente:

```bash
pnpm run check:tailwind-scanner
```

Está integrado en:

- **Pre-commit** (`.husky/pre-commit`): corre después de `lint-staged` + `gga run`. Atrapa hazards antes de que lleguen al commit.
- **CI lint job** (`.github/workflows/ci.yml`): corre en paralelo con ESLint. Atrapa hazards que se escaparon del pre-commit (e.g. push con `--no-verify`, bypass de branch protection).

Códigos de salida:

- `0` — sin hazards.
- `1` — uno o más hazards encontrados (con lista file:line:match en stderr).
- `2` — fallo inesperado (stack trace completo en stderr).

## Allowlist

Algunos hazards son intencionales:

- **Regex literals en tests** que documentan la ausencia de una clase,
  e.g. `expect(classAttr).not.toMatch(/bg-ui-glass-{1,2}/)`.
- **Comentarios de código** que documentan el comportamiento del
  scanner de Tailwind para futuros contribuidores.
- **Descripciones de tokens del design system** en `app/_ui/README.md`
  que usan notación de braces para enumerar variantes (las clases
  reales están escritas como literales donde se usan).
- **Descripciones históricas de branches / nombres de archivo** en
  `docs/archive` que documentan cambios SDD ya shipped; esos archivos
  no están en el content scan path activo de Tailwind para el build
  actual.

Agregar hazards intencionales a
`scripts/__fixtures__/tailwind-scanner-allowlist.txt` con un
comentario de justificación:

```
# bg-ui-glass-{1,2} aparece en el regex `not.toMatch` en
# app/_ui/primitives/glass-card.test.tsx:52; intencional.
bg-ui-glass-{1,2}
```

## Agregar una nueva entrada al allowlist

1. Correr `pnpm run check:tailwind-scanner` para ver la violación.
2. Confirmar que el match es un falso positivo (una descripción, un
   regex literal, un ejemplo en doc-comment) — **no** una clase CSS
   real.
3. Agregar el string exacto del match al allowlist fixture con un
   comentario de una línea explicando por qué es intencional.
4. Re-correr `pnpm run check:tailwind-scanner` para confirmar que la
   violación desapareció.

Si el match es una clase CSS real, **arreglá el código** en su lugar,
reescribiendo la clase como nombre literal.

## Relacionados

- PR #113 — `fix(tests): escape Tailwind scanner from glass-card.test.tsx JSDoc` (incidente original).
- PR #114 — `chore(next): align next-env.d.ts reference path with next 16.2.9` (cleanup hermano).
- PR #115 — `chore(build): add tailwind content-scanner guard` (esta página + el script).
