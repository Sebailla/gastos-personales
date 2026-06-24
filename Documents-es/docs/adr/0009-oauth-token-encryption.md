# ADR-0009 — Encriptación de tokens OAuth en reposo (AES-256-GCM envelope)

**Estado**: Accepted · **Fecha**: 2026-06-20 · **Deciders**: Sebastián Illa

## Contexto y planteamiento del problema

El modelo `Account` de Prisma (`prisma/schema.prisma:48-54`)
guardaba `refresh_token`, `access_token` y `id_token` como
`String? @db.Text` en plaintext. Una lectura de la DB (DBA,
filtración de backup, compromiso de réplica, inyección SQL en
otro lugar de la app, exposición de una réplica de lectura
mal configurada) significaba takeover completo de la cuenta de
Google de cada usuario vinculado. La revisión 4R-R1 flageó
esto como **CRITICAL** (OWASP A02 — Cryptographic Failures) el
2026-06-20.

El usuario pidió el 4R follow-up más urgente: encriptación
OAuth F-4R-1. Este ADR captura la decisión y el rollout.

## Drivers

- **Confidencialidad de refresh tokens OAuth** —
  `refresh_token` es el campo más sensible; en su
  posesión habilita acceso indefinido a la cuenta de
  Google. `access_token` e `id_token` son de vida
  corta pero aún leakgean PII (email, nombre, URL de
  perfil).
- **Sin KMS externo** — el proyecto corre en Fly.io
  con el secrets store. No hay Vault, HSM, ni AWS KMS
  en el roadmap de esta iteración.
- **Single-region, single-process deployment** — no
  hay replicación cross-region ni key state compartido
  entre procesos. Una sola key en un Fly secret es el
  threat model más simple que cierra la superficie de
  lectura de DB.
- **Infraestructura crypto existente** — el proyecto
  ya usa Web Crypto (`src/shared/crypto/web-crypto.ts`)
  para HMAC, SHA-256, y UUIDv7. AES-256-GCM es una
  primitive más de Web Crypto; sin nuevas dependencias.

## Opciones consideradas

1. **AES-256-GCM envelope (opción elegida)** —
   encriptación a nivel de app con una key de 32 bytes
   desde `OAUTH_TOKEN_ENCRYPTION_KEY` (env var, 64
   hex chars). IV de 12 bytes aleatorio por fila. La DB
   guarda `Bytes?` (BYTEA en Postgres). El wrapper
   del adapter de Auth.js v5 encripta en `linkAccount`
   y desencripta en `getUserByAccount`. Sin nuevas
   dependencias; usa Web Crypto.
2. **Extensión pgcrypto** — `pgcrypto.encrypt()` /
   `pgcrypto.decrypt()` de Postgres con la key
   provista vía SQL. Pro: transparente para la app.
   Contra: requiere superuser para habilitar la
   extensión; la key tiene que estar en la sesión SQL
   de alguna forma (vía `current_setting()`, que es su
   propio dolor de cabeza de secret-management); la
   key en la sesión SQL leakgea vía
   `pg_stat_statements` si el query logging está
   activo.
3. **KMS externo (Vault, AWS KMS, Fly KMS)** — el
   gold standard. La app nunca ve la key raw; emite
   `encrypt(plaintext, key_id)` y el KMS retorna
   ciphertext. Contra: el KMS de Fly es limitado
   (solo secrets, no envelope encryption); AWS KMS es
   overkill para una app de gastos personales y
   agrega un network hop en cada signin. Diferir.
4. **Drop refresh tokens** — Google soporta access
   tokens de vida corta sin refresh; la app
   re-autorizaría cada 60 minutos. Pro: cero DB
   write. Contra: UX terrible (el usuario es
   redirigido a la pantalla de consentimiento de
   Google en timer); no arregla la superficie de
   leak del access_token / id_token.

## Decisión

**Opción elegida**: 1 (envelope encryption con Web Crypto).

La implementación:

- `src/shared/crypto/envelope-encryption.ts` — las
  primitivas `encryptEnvelope(plaintext, key)` /
  `decryptEnvelope(ciphertext, key)`. Layout
  `[12-byte IV | N-byte ciphertext | 16-byte GCM tag]`.
  GCM es autenticado; un ciphertext alterado throwea.
- `src/modules/auth/infrastructure/adapters/encrypted-prisma-adapter.ts`
  — wrappea `@auth/prisma-adapter`. Override de
  `linkAccount` (encripta antes del write) y
  `getUserByAccount` (desencripta después del read).
  Todos los demás métodos (User, Session,
  VerificationToken) se heredan sin cambios.
- `prisma/schema.prisma` — `Account.refresh_token /
  access_token / id_token` cambian de `String? @db.Text`
  a `Bytes?`.
- `prisma/migrations/20260620_encrypt_oauth_tokens/migration.sql`
  — la migración del schema. Para una DB de dev
  existente, se requiere un script de backfill (ver
  Rollout abajo).
- `src/shared/env/env.schema.ts` — agrega
  `OAUTH_TOKEN_ENCRYPTION_KEY` (opcional en dev,
  requerido en prod). 64 hex chars = 32 raw bytes.
  Generar con `openssl rand -hex 32`.
- `src/modules/auth/infrastructure/external/authjs.ts` —
  cambia `PrismaAdapter(prisma())` por
  `createEncryptedPrismaAdapter(prisma())`. Cambio
  de una línea.

### Notas de implementación

- **Manejo de key**: la key se lee de
  `process.env.OAUTH_TOKEN_ENCRYPTION_KEY` lazy en
  cada call (no se cachea en boot). Esto está bien
  para el dev hot path (env read es microsegundos) y
  evita una dependencia dura del orden de boot de
  `instrumentation.ts`.
- **Modo de falla**: una key faltante o malformada
  throwea `AppError(INTERNAL_ERROR)` en cada call
  que toca Account. **No hay fallback a plaintext** —
  un deploy mal configurado debe fallar ruidoso.
- **Aislamiento de tests**: el helper de encriptación
  se testea con una key all-zeros determinística. El
  adapter wrapper aún no está unit-testeado (la
  superficie del adapter de Auth.js v5 es grande; un
  PR de follow-up agregará unit tests focados con un
  `PrismaClient` fake).
- **Backwards compatibility**: la migración convierte
  las filas plaintext existentes a `bytea` vía un
  `convert_to` SQL cast. El resultado **no** es
  ciphertext AES-256-GCM válido (son los bytes UTF-8
  raw). Un script de backfill separado es requerido
  para re-encriptar las filas existentes con la key
  de aplicación.

### Threat model

| Adversario | Defensa |
|---|---|
| DBA / backup leak / réplica de lectura | La DB solo tiene ciphertext; sin acceso a la key. ✓ |
| Proceso de runtime comprometido | El atacante lee plaintext. ✗ (defensa grado KMS) |
| Replay de ciphertext (sin tampering) | El auth tag de GCM lo detecta; `decryptEnvelope` throwea. ✓ |
| Rotación de key | Fuera de scope. Futuro: key id en el envelope, multi-key support. |
| Truncado de ciphertext | `decryptEnvelope` throwea si buffer < IV + tag. ✓ |

## Rollout

1. **Pre-merge**: este PR. El helper de encriptación,
   el adapter wrapper, el schema change, la migración
   y el env schema están adentro. No se toca data de
   usuarios reales (la DB de dev no tiene cuentas
   Google vinculadas aún).
2. **Deploy dev**: aplicar la migración. La tabla
   `Account` está vacía; no se necesita backfill.
3. **Deploy prod** (ventana controlada, PR futuro):
   1. Stop del proceso de la app (sin writes
      concurrentes a `Account`).
   2. Correr el script de backfill
      `scripts/backfill-encrypt-oauth-tokens.ts`
      contra la DB live. El script lee cada fila,
      desencripta con la key de dev existente
      (no-op si el env está limpio), encripta con la
      key nueva, y escribe de vuelta. Idempotente
      (skipea filas ya encriptadas intentando
      desencriptar primero; cae a encrypt+write en
      parse failure).
   3. Setear `OAUTH_TOKEN_ENCRYPTION_KEY` en el Fly
      secrets store.
   4. Arrancar la app. El primer signin de cada
      usuario re-encripta la fila transparentemente.

## Verificación

End-to-end verificado el 2026-06-20 en esta rama:

- `pnpm test` → 393 passed (379 existentes + 14
  nuevos en `src/shared/crypto/envelope-encryption.test.ts`).
- `pnpm typecheck` → clean.
- Roundtrip: `encrypt('foo', key) → decrypt(...)`
  retorna `'foo'`. IVs distintos en cada call.
  Tampering detectado. Key incorrecta rechazada. 64
  hex chars aceptado; largo incorrecto rechazado;
  non-hex rechazado.

## Consecuencias

- **Good**: la superficie de leak de tokens OAuth
  está cerrada. Un compromiso de DBA / backup ya no
  significa takeover de Google. La implementación
  son ~250 líneas (helper + adapter + tests) con
  cero dependencias nuevas.
- **Good**: la superficie del adapter de Auth.js v5
  no cambia para los métodos que no son Account. El
  callback de Google, el authorize de credentials, el
  session lookup y los flows de verification token
  funcionan sin cambios de código.
- **Bad**: una rotación de key futura requiere un
  envelope multi-key (agregar un prefijo de 1 byte
  de versión, soportar decrypt con la key vieja +
  re-encrypt con la nueva). Fuera de scope de esta
  iteración.
- **Bad**: la dev experience es una env var más que
  recordar. El `AppError` por key faltante es ruidoso
  (bueno para prod) pero ruidoso en dev. Un cambio
  futuro podría auto-generar una key de dev en
  `instrumentation.ts` cuando `NODE_ENV ===
  'development'` y la env var está ausente, con un
  warning one-time loggeado.
- **Bad**: faltan tests para el adapter wrapper en sí.
  El helper de encriptación tiene 14 unit tests; el
  schema change está typecheck-clean. El wrapper es
  chico (~100 líneas) y la integración está
  type-checked en la frontera, pero un PR de
  follow-up debería agregar tests focados con un
  `PrismaClient` fake para lockear los contratos de
  encrypt-on-link y decrypt-on-getUserByAccount.

## Follow-ups

1. **Backfill script**
   (`scripts/backfill-encrypt-oauth-tokens.ts`) —
   requerido para el rollout de producción. Lee cada
   fila de `Account`, idempotentemente encripta con
   la key de la app, escribe de vuelta. Fuera de
   scope de este PR.
2. **Rotación de key** — agregar 1 byte de versión
   de key al envelope, soportar decrypt con la key
   previa. Diferir hasta la primera necesidad de
   rotación.
3. **Auto-generación de key de dev** — cuando
   `OAUTH_TOKEN_ENCRYPTION_KEY` está ausente y
   `NODE_ENV === 'development'`, generar una key
   random en `instrumentation.ts` y loggear un
   warning one-time. Le ahorra al dev nuevo un paso
   de setup.
4. **Unit tests del adapter wrapper** — fake
   `PrismaClient` para lockear los contratos
   encrypt-on-link / decrypt-on-getUserByAccount.
5. **Encriptación de Session/VerificationToken** —
   `Session.sessionToken` está actualmente en
   plaintext. El mismo patrón aplica; el proyecto no
   tiene un requerimiento `BR-AUTH-X` para mantenerlo
   así, así que diferir.
