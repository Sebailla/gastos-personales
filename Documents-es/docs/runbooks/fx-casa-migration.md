# Runbook — migración `add_account_fx_casa` (fx-cache PR-2)

**Owner**: Sebastián Illa
**Cambio**: `fx-cache`
**PR**: PR-2 de 3 PRs encadenados (`feat/fx-cache-2` → `develop`)
**Migración**: `prisma/migrations/<timestamp>_add_account_fx_casa/migration.sql`
**Hand-off del spec**: REQ-FX-9 (la columna `casa` es no destructiva)

Este runbook cubre las verificaciones del lado del operador para la
migración Prisma `add_account_fx_casa`. La migración agrega una
columna `casa` nullable a `FinancialAccount` (un enum `AccountFxCasa`
con valores `OFICIAL | BLUE | MEP | CCL | CRIPTO | TARJETA`). Es
**no destructiva**: las filas existentes quedan con `casa = NULL` y
renderizan el default global heredado (`env.FX_DEFAULT_CASA`, default
`'oficial'`) hasta que el usuario elija una casa explícita en el
formulario de creación.

---

## 1. Snapshot pre-migración

Antes de aplicar la migración, capturá la cantidad de filas en
`FinancialAccount`. La migración es no destructiva — el conteo
debe quedar igual después.

```bash
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "FinancialAccount";'
```

Salida esperada: un único entero (la cantidad de filas). Guardá el
valor en el ticket / changelog. La verificación post-migración usa
la misma query y debe devolver el mismo número.

## 2. Aplicar la migración

La migración está commiteada en `prisma/migrations/` y se ejecuta
como parte del flujo normal de `prisma migrate deploy`. No hay paso
manual de SQL.

```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
# Esperado: "Database schema is up to date!"
```

El `migration.sql` generado se ve así:

```sql
-- CreateEnum
CREATE TYPE "AccountFxCasa" AS ENUM ('OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA');

-- AlterTable
ALTER TABLE "FinancialAccount" ADD COLUMN     "casa" "AccountFxCasa";
```

No hay **`NOT NULL`**, **ni `DEFAULT`**, **ni `UPDATE`** sobre las
filas existentes. Postgres acepta el alta de la columna y las filas
existentes quedan con `casa = NULL` por defecto.

## 3. Verificación post-migración

### 3.1 — Cada fila existente tiene `casa IS NULL`

```bash
psql "$DATABASE_URL" -c \
  'SELECT count(*) FROM "FinancialAccount" WHERE "casa" IS NULL;'
```

Esperado: el mismo entero que el snapshot pre-migración. **Si alguna
fila reporta `casa IS NOT NULL` acá, la migración NO corrió como
está diseñada** — escalar de inmediato (la migración no debe hacer
backfill).

### 3.2 — Ninguna fila fue modificada más allá del alta de columna

```bash
psql "$DATABASE_URL" -c \
  'SELECT count(*) FROM "FinancialAccount" WHERE "updatedAt" > now() - interval ''1 minute'';'
```

Esperado: `0` (la migración no toca filas existentes; solo se dispara
el alta de columna).

### 3.3 — La columna nueva acepta el enum `AccountFxCasa`

```bash
psql "$DATABASE_URL" -c \
  "INSERT INTO \"FinancialAccount\" \
   (\"id\", \"userId\", \"type\", \"name\", \"currency\", \
    \"openingBalanceMinor\", \"openingBalanceMode\", \"casa\", \
    \"createdAt\", \"updatedAt\") \
   VALUES \
   ('test-casa-blue', (SELECT \"id\" FROM \"User\" LIMIT 1), 'BANK', \
    'Test casa blue', 'USD', 0, 'FRESH', 'BLUE', now(), now());"

psql "$DATABASE_URL" -c \
  "SELECT \"name\", \"casa\" FROM \"FinancialAccount\" WHERE \"id\" = 'test-casa-blue';"

psql "$DATABASE_URL" -c \
  "DELETE FROM \"FinancialAccount\" WHERE \"id\" = 'test-casa-blue';"
```

Esperado: la fila se inserta con `casa = 'BLUE'`; el SELECT devuelve
`'BLUE'`; el DELETE elimina la fila de prueba.

### 3.4 — Valores inválidos de casa se rechazan a nivel DB

```bash
psql "$DATABASE_URL" -c \
  "INSERT INTO \"FinancialAccount\" \
   (\"id\", \"userId\", \"type\", \"name\", \"currency\", \
    \"openingBalanceMinor\", \"openingBalanceMode\", \"casa\", \
    \"createdAt\", \"updatedAt\") \
   VALUES \
   ('test-casa-bad', (SELECT \"id\" FROM \"User\" LIMIT 1), 'BANK', \
    'Test casa bad', 'USD', 0, 'FRESH', 'INVALID', now(), now());"
```

Esperado: un error (`invalid input value for enum AccountFxCasa:
"INVALID"`). El parse de Zod en la frontera de la API captura esto
en la práctica; el rechazo a nivel DB es defense-in-depth.

## 4. Chequeo del smoke UI (terminal del operador)

Después de aplicar la migración y redesplegar la aplicación:

1. Iniciá sesión en `/auth/signin`.
2. Visitá `/accounts/new` — confirmá que el nuevo select
   **"FX casa (optional)"** se renderiza con 7 opciones (6 casas +
   "Default (oficial)").
3. Creá una cuenta nueva con `casa = BLUE` → `POST /api/accounts`
   devuelve `201`.
4. `GET /api/accounts/<new-id>` → el campo `casa` del body de
   respuesta es la forma **lowercase** de DolarAPI (`"blue"`).
5. Verificá que el widget de balance existente siga devolviendo
   503 — el DI está conectado al stub; el endpoint de FX todavía
   no está conectado al provider real (eso llega en PR-3).

**Slot para screenshot**: adjuntá al PR / changelog un screenshot
del formulario `/accounts/new` mostrando el nuevo select "FX casa
(optional)", con una casa explícita seleccionada.

## 5. Rollback

La migración es forward-only y no se puede hacer rollback limpio
sin un downgrade manual. Si surge un problema después de la
migración:

1. Frená el proceso de la aplicación (para que no aterricen
   nuevos writes).
2. Inspeccioná la versión de la app corriendo. El único cambio
   de schema de la migración es la columna `casa` y el enum
   `AccountFxCasa`. Una versión pre-PR-2 no lee ni escribe la
   columna.
3. Si tenés que revertir el schema:
   ```sql
   ALTER TABLE "FinancialAccount" DROP COLUMN "casa";
   DROP TYPE "AccountFxCasa";
   ```
   Esto es destructivo: cualquier fila que tuviera `casa` seteado
   pierde ese valor. **No corras esto si algún usuario seteó una
   casa desde que se aplicó la migración.** Coordiná con el
   usuario antes de hacer rollback.

## 6. Artefactos relacionados

- `prisma/migrations/<ts>_add_account_fx_casa/migration.sql` —
  la migración generada.
- `openspec/changes/fx-cache/specs/fx/spec.md` REQ-FX-9 — el
  requerimiento de migración no destructiva.
- `openspec/changes/fx-cache/design.md` §3.3 — el diseño de la
  migración.
- `docs/adr/0010-dolar-api-provider.md` — la decisión de casa
  por cuenta (DG-FX-2).
- `docs/runbooks/fx-casa-migration.md` — fuente original en
  inglés.
