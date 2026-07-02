# Spec — capability `snapshots`

**Autor**: Sebastián Illa
**Capability**: `snapshots`
**Source change**: (ninguna aún — pendiente `snapshots-implementation`)
**Estado**: stub · aún no implementado
**Creado**: 2026-07-02 · **Última sincronización**: 2026-07-02
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL + Zod + Vitest + pnpm + Tailwind v4 (heredado de `auth-foundation`, `accounts-ledger`, `transactions`, `fx-cache`, `reports`)

> Esta es la primera escritura del spec de la capability
> `snapshots` y un stub honesto. La capability está declarada
> en `openspec/config.yaml` (lista `capabilities:`) y es
> referenciada desde `openspec/specs/accounts/spec.md`
> (línea 42) como consumidora futura del agregado de
> `accounts`. La capability en sí misma **no está
> implementada aún** en v0.4.x. El conjunto completo de
> requirements (`REQ-SNAP-*`), business rules (`BR-SNAP-*`)
> y scenarios se difiere al próximo change del SDD
> (`snapshots-implementation`). Este stub existe para que la
> capability tenga un spec canónico en el path declarado en
> `openspec/AGENTS.md` y para que los demás specs puedan
> referenciarlo sin mentir.

## Propósito

La capability `snapshots` captura el **net worth de cierre
de período** del usuario en un instante de tiempo. Un
snapshot es un agregado de lectura sobre las `accounts`
(ledger de FinancialAccount) y `transactions` (ledger con
FX snapshot) del usuario, estampado con una fecha
(típicamente fin de mes) y una moneda de salida, y
persistido como registro histórico consultable. Los
snapshots le permiten al usuario ver "net worth a lo largo
del tiempo" sin rederivar el agregado en cada lectura, y son
la base de cualquier UI futura de series de tiempo
(`/networth`, `/networth/:id`) y de cualquier flujo de
exportación.

## Estado de este spec

Este documento es un **stub**. Existe para (a) darle a la
capability `snapshots` un archivo de spec canónico en el
path declarado en `openspec/AGENTS.md`, (b) hacer que
`openspec/specs/accounts/spec.md` (y cualquier spec futuro
que mencione `snapshots`) sea una referencia honesta en
lugar de una forward declaration, y (c) codificar la
restricción de direccionalidad cross-module que la
implementación futura DEBE respetar.

**Lo que este stub NO contiene:** requirements formales
(`### REQ-SNAP-*`), business rules (`BR-SNAP-*`), scenarios
(`#### Scenario: …`), definiciones de rutas, columnas del
data model, firmas de services, o shapes de UI. Todo eso se
redactará cuando el change `snapshots-implementation`
ingrese al ciclo de vida del SDD (`proposal → spec → design
→ tasks → apply → verify → sync → archive`).

El autor NO backfilleará secciones del stub con contenido
placeholder; el spec pasará de stub a draft mediante un
change dedicado, no por parches inline a este archivo.

## Alcance

### Dentro del alcance

- Declarar la existencia de la capability, su propósito y el
  contrato cross-module mínimo en el que los demás specs
  pueden confiar.
- Respetar la regla de arquitectura "Modules isolated" del
  `AGENTS.md` raíz §10.5: `snapshots` lee desde `accounts` y
  `transactions` vía los ports de `src/shared/domain-kernel/`,
  NUNCA mediante imports directos desde
  `src/modules/accounts/` o `src/modules/transactions/`.
- Proveer un único ancla fáctica significativa — "esta
  capability aún no tiene requirements" — para que cualquier
  spec, ADR o issue futuro pueda referenciar `snapshots` con
  honestidad.

### Fuera del alcance (diferido a `snapshots-implementation`)

- Requirements (`REQ-SNAP-1`, `REQ-SNAP-2`, …).
- Business rules (`BR-SNAP-1`, `BR-SNAP-2`, …).
- Scenarios (el conjunto `#### Scenario: …`, según la
  convención de specs usada por `accounts/spec.md` y otros).
- Definiciones de rutas (`GET /api/snapshots`,
  `GET /api/networth`, …).
- Adiciones al data model (agregado `Snapshot`, índices,
  manejo de FX).
- Port del repository, service, composición del controller en
  `src/modules/snapshots/{domain,application,infrastructure}/`.
- Superficie de UI (chart `/networth`, detalle de snapshot,
  account picker para la serie de tiempo).
- Migración a `prisma/schema.prisma` y la migration
  correspondiente bajo `prisma/migrations/`.

## Contrato cross-module

La dependencia direccional queda fijada por este stub para
que ninguna implementación futura la invierta
accidentalmente:

- **`snapshots` → `accounts`** (lectura): `snapshots` lee
  filas de FinancialAccount vía
  `src/shared/domain-kernel/AccountRepositoryPort`. La
  superficie del port (`FinancialAccountFields`) ya está
  compartida; el módulo `snapshots` consume ese port, NO
  el service ni el repository de `accounts` directamente.
- **`snapshots` → `transactions`** (lectura): `snapshots`
  lee filas de Transaction vía el port de transactions del
  kernel (`TransactionDTO` es el subconjunto estructural
  9-de-15 ya compartido por `reports`). Misma regla — port
  del kernel, nunca un import directo al módulo.
- **`snapshots` → `reports`** (sin dependencia directa):
  si la implementación necesita agregados mensuales, los
  deriva localmente desde el port crudo de transactions de
  arriba. NO hay dependencia sobre
  `src/modules/reports/`. Tanto `reports` como `snapshots`
  son consumidores downstream del port de transactions del
  kernel.
- **`accounts`, `transactions`, `reports`, `fx`, `auth`,
  `ui` ← `snapshots`** (sin dependencia): ningún otro
  módulo adquiere una dependencia sobre `snapshots`.
  `snapshots` es un nodo terminal en el grafo de módulos.

Este conjunto de ejes es la única garantía estructural que
emite este stub. Cualquier cambio de direccionalidad
requiere un nuevo change de spec, no una edición a este
stub.

## Preguntas abiertas (para `snapshots-implementation`)

Estas son las decisiones que cerrará el change futuro; este
stub las superficie para que no se introduzcan a ciegas.

1. **Forma de almacenamiento.** Fila append-only de
   `Snapshot` (una por período por usuario) vs. tabla de
   time-buckets materializada vs. un stream event-sourced
   al cual el módulo `snapshots` se suscribe vía el
   dispatcher existente en `src/shared/events/`. La
   elección tiene efectos en cascada sobre la semántica de
   escritura (idempotencia al re-ejecutar un cierre de
   período) y sobre el costo de lectura con historial
   grande.
2. **Zona horaria.** Medianoche UTC (consistente con la
   convención de mes UTC de la capability `reports` según
   `BR-RPT-3`) vs. zona horaria local del usuario
   (consistente con cómo el usuario razona sobre su propio
   dinero). Las dos no son equivalentes en los bordes de
   mes para regiones al oeste de UTC.
3. **Moneda de display.** Calcular y almacenar un único
   monto de display por snapshot (en la `displayCurrency`
   del usuario, con un FX snapshot al momento de escritura
   consistente con cómo `transactions` snapshot-ea su
   `convertedAmountMinor`) vs. almacenar montos nativos
   por cuenta y re-convertir al momento de la lectura
   (escrituras más baratas, lecturas más caras, FX más
   fresco).
4. **Qué cuenta como "net worth".** Suma de todos los
   balances de financial accounts (sin importar `type`) vs.
   excluir balances de crédito vs. restar pasivos. El enum
   `AccountType` actual (`BANK`, `CREDIT`, `INVESTMENT`,
   `CRYPTO`, `CASH`, `OTHER`) admite cualquier
   interpretación, pero el spec debe comprometerse con una.
5. **Retroactividad.** ¿Puede el usuario pedir un snapshot
   de una fecha pasada rederivable desde las transactions
   históricas (barato, pero las tasas de FX para fechas
   pasadas necesitan una superficie `fx_history` que no
   existe), o los snapshots son estrictamente forward-only
   desde `v0.5.0` en adelante?

## Próximo change

El próximo entry del ciclo de vida que toque esta capability
será una proposal bajo
`openspec/changes/snapshots-implementation/`, que promoverá
este stub a un spec completo agregando bloques
`### REQ-SNAP-*`, `### BR-SNAP-*` y `#### Scenario`. Hasta
que ese change aterrice, este stub es el spec canónico.
