# ADR-0004 — Hono catch-all en `app/api/[...path]/route.ts`

**Estado**: Aceptado · **Fecha**: 2026-06-13 · **Decisores**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`design.md` §1, §2 ·
`openspec/changes/auth-foundation-slice-c/design.md` §2

## Contexto y problema a resolver

La API de aplicación no-auth (`/api/me`, `/api/health`, `/api/auth/register`) necesita un framework de servidor que: (1) sea type-safe end-to-end (la instancia `OpenAPIHono` de Hono exporta un cliente tipado `hc<typeof honoApp>` para la UI), (2) se monte de forma prolija dentro del App Router de Next.js 16 en una sola ruta catch-all, (3) soporte la validación de requests con Zod que usamos en cada frontera del sistema, y (4) nos dé un único lugar para cablear middleware de request-id, error-handler y origin-check a través de toda la superficie no-auth. La superficie `/api/auth/*` es de Auth.js, no de Hono; el catch-all no tiene que doble-manejarla.

## Drivers

- **Type safety**: `OpenAPIHono` + `hc<typeof honoApp>` le da a la UI un cliente completamente tipado sin paso de generación de código.
- **Forma del mount**: un único `app/api/[...path]/route.ts` que delega `GET`/`POST`/`PATCH`/`DELETE` a `honoApp.fetch(request)`. El routing file-based de Next.js resuelve primero `app/api/auth/[...nextauth]/route.ts` (path más específico), por lo que el catch-all de Hono no matchea `/api/auth/*`.
- **Composición de middlewares**: un único `app.use('*', requestIdMiddleware)` y un único `app.onError(...)` cubren toda la superficie no-auth. Sin cableado por ruta.
- **Validación Zod-nativa**: `@hono/zod-validator` consume los mismos DTOs que ya usan las acciones de aplicación.
- **Runtime**: tiene que correr en el runtime Node.js 20 que Fly.io provee; Hono es agnóstico de runtime.

## Opciones consideradas

1. **Hono** en `app/api/[...path]/route.ts` — `OpenAPIHono` + cliente tipado `hc<typeof honoApp>`.
2. **Route handlers puros de Next.js** en `app/api/<name>/route.ts` por endpoint — la API de primera clase de Next.js; sin framework separado; pero sin cliente tipado end-to-end, sin composición de middlewares compartida, y sin validación Zod-nativa.
3. **tRPC** — type-safe end-to-end, pero suma una curva de aprendizaje más pesada y una declaración de router-por-ruta que es redundante con la forma de Hono.
4. **Fastify** — production-grade, pero requiere un servidor Node.js separado (no se montaría como catch-all de Next.js sin pegamento extra).

## Resultado de la decisión

**Opción elegida**: "1. Hono en `app/api/[...path]/route.ts`", porque la forma `OpenAPIHono` + `hc<typeof honoApp>` le da a la UI un cliente tipado sin paso de codegen, el único catch-all deja intacto el routing del App Router de Next.js (gana la ruta más específica de Auth.js), y la composición de middlewares (`requestIdMiddleware` + `errorHandler` + `originCheck`) vive en un solo lugar.

### Consecuencias

- **Buenas**: type safety end-to-end; un único catch-all; la `/api/auth/*` de Auth.js queda intacta; el export de `src/modules/api/client.ts` es una sola línea (`export const api = hc<typeof honoApp>('/');`).
- **Malas**: Hono es un segundo framework dentro del proceso de Next.js; el puente a nivel de tipos (`hc<typeof honoApp>`) necesita `verbatimModuleSyntax: true` para que los imports no exportados fallen en compile time. Aceptable para el MVP; si la API de Hono deriva entre majors, el upgrade es un error tipado en los call sites.

### Confirmación

Validado por T-021 (`app.test.ts`, 9 casos), T-022 (`client.test.ts`, 2 casos incluyendo el check de compile-time `Expect<Equal<...>>`), y el test de integración de C-1 en T-025 (`route.test.ts`, 2 casos: `/api/auth/signin` rutea a Auth.js, `/api/me` rutea a Hono).
