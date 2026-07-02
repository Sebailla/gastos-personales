# Tailwind v4 — Hazards del Content-Scanner

> Por qué existe esta página. Los incidentes del PR #113 (2026-07-01,
> `{a,b}` brace-expansion en un JSDoc) y PR #117 (2026-07-02,
> separator `a/b` en una descripción de task en Markdown) ambos
> crashearon PostCSS en build time y devolvieron HTTP 500 en `/es`
> en modo dev. PR #118 limpió los 37 hazards existentes; este guard
> previene ocurrencias futuras.

## El hazard

Tailwind v4 usa un **content scanner** para encontrar utility classes
en los archivos fuente. Grepea `.ts`, `.tsx`, `.md`, `.mdx` (y otros
formatos de texto) buscando tokens que parezcan utility classes.

El scanner **no parsea el código como código**. Trata string literals,
comentarios JSDoc, regex patterns y prosa por igual.

Dos patrones que el scanner extrae pero NO son CSS válido en v4:

1. **Brace-expansion** (`{a,b}`): válido en v3, removido en v4. Tailwind
   emite el texto literal como selector. PostCSS falla con
   `Unexpected token CurlyBracketBlock`.

2. **Slash separator** (`a/b`): usado informalmente para significar
   "a o b" (e.g. `--ui-glass-blur-sm` seguido de `/lg` dentro de
   un `var(...)` para significar "blur pequeño o grande"). No
   válido dentro de `var(...)`. PostCSS falla con `Unexpected
token Delim('/')`.

El build sigue completando (warning, no error) y la ruta afectada
devuelve HTTP 500.

## La regla

**Nunca escribas tokens con forma de utility class que usen
brace-expansion o slash separator en archivos fuente.**

Usá prosa o dos nombres literales. Ejemplos concretos de los
incidentes que dispararon este guard:

- `--ui-rounded-sm` (or `-md`, `-lg`, `-full`) — escrito así, no como
  la forma insegura con brace-expansion.
- `backdrop-blur-[var(--ui-glass-blur-sm)]` (or `-[lg]`) — escrito así,
  no como la forma insegura con slash separator dentro de `var(...)`.

Aplica a: comentarios JSDoc, documentación en prosa, regex literals,
docs en Markdown, en cualquier lado donde un token con forma de
utility class se pueda confundir con una clase real.

## El guard

El CI lint job (`.github/workflows/ci.yml`) corre un `grep -rnE`
sobre `app/`, `openspec/`, `Documents-es/` y falla el build ante
cualquier match a través de tres patrones:

```bash
grep -rnE \
  -e "\-\-[a-z][a-z0-9-]+\{[a-z0-9, _-]+\}" \
  -e "\b[a-z][a-z0-9-]+-\{[a-z0-9, _-]+\}" \
  -e "var\(--[a-z][a-z0-9-]+/[a-z][a-z0-9-]+\)" \
  --include="*.tsx" --include="*.ts" \
  --include="*.md" --include="*.mdx" \
  --exclude-dir=node_modules --exclude-dir=.next \
  app/ openspec/ Documents-es/
```

Los tres patrones cubren las dos variantes conocidas. La forma
insegura se muestra en abstracto porque este doc debe pasar el mismo
grep:

- Patrón 1: CSS variable donde la forma insegura expande a múltiples
  variantes dentro de llaves (e.g. el placeholder inseguro
  `--xxx-a-or-b-or-c`). Forma segura: nombre literal + lista en prosa.
- Patrón 2: token con forma de utility class con el mismo hazard de
  brace-expansion (e.g. inseguro `xxx-a-or-b`). Forma segura: dos
  nombres literales unidos por `(or ...)`.
- Patrón 3: `var(...)` con la forma insegura que usa `/` entre los dos
  últimos segmentos dentro de un `var(...)` (e.g. el placeholder
  inseguro escrito como dos segmentos separados por una barra).
  Forma segura: `var(--xxx-yyy)` seguido de `(or -zzz)`.

Es un grep de una línea, sin script Node, sin allowlist, sin
pre-commit hook. Corre solo en CI; los commits locales no se
bloquean por este check. (El approach anterior con script Node en
PR #115 fue cerrado porque el overhead no justificaba el beneficio.)

## Relacionados

- PR #113 — `fix(tests): escape Tailwind scanner from glass-card.test.tsx JSDoc` (primer incidente).
- PR #117 — `docs(openspec): fix sm/lg typo in T-PR3-01 task description` (segundo incidente).
- PR #118 — `docs(openspec): rewrite brace-expansion utility-class tokens as prose` (cleanup de los 37 hazards existentes).
- PR #119 — `chore(build): add tailwind content-scanner guard` (esta página + el grep de CI).
