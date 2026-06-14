# ADR-0003 — Parámetros de Argon2id: memoryCost=19456, timeCost=2, parallelism=1

**Estado**: Aceptado · **Fecha**: 2026-06-13 · **Decisores**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`design.md` §1, §3 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Contexto y problema a resolver

El hashing de password es la línea de defensa contra un atacante que se lleva un dump de la base de datos. Usamos Argon2id (el ganador del PHC recomendado por OWASP) vía `@node-rs/argon2` (con el paquete npm `argon2` como fallback documentado si el binario prebuilt falla al cargar en la VM 1-CPU de Fly.io). Los parámetros (`memoryCost`, `timeCost`, `parallelism`) determinan tanto el costo de fuerza bruta del atacante como la latencia de login legítimo en la VM objetivo. El diseño apunta a 50–100 ms por hash en la VM 1-CPU shared-cpu de Fly.io: lo suficientemente lento para hacer caro un ataque de fuerza bruta, lo suficientemente rápido para que el sign-in se sienta instantáneo.

## Drivers

- **BR-AUTH-3**: parámetros afinados para caer en la banda 50–100 ms en la VM objetivo.
- **BR-AUTH-4**: el camino de "usuario no encontrado" en `authorize()` de Credentials corre un verify de Argon2id contra un `DUMMY_HASH` fijo para que el tiempo de respuesta sea estadísticamente indistinguible del camino "encontrado, password incorrecta".
- **Reproducibilidad**: los parámetros viven como constantes con nombre en `argon2.hasher.ts`; el test los assertea; el script de benchmark assertea la banda de runtime.
- **Re-afinabilidad**: un camino de fallback documentado (subir `timeCost` a 3 si el runtime queda por debajo de 50 ms; o cambiar al paquete npm `argon2` si `@node-rs/argon2` falla al cargar en el objetivo).

## Opciones consideradas

1. **Argon2id** con `memoryCost=19456 KiB`, `timeCost=2`, `parallelism=1` vía `@node-rs/argon2` (con `argon2` npm como fallback).
2. **bcrypt** con `costFactor=12` — un único parámetro, bien entendido, pero Argon2id es la recomendación moderna (memory-hard, resistente a GPU).
3. **scrypt** con `N=2^15, r=8, p=1` — memory-hard pero más lento en inputs chicos y la codificación de parámetros es más propensa a errores.
4. **Argon2i** (data-independent) o **Argon2d** (data-dependent, resistente a GPU) — tradeoffs diferentes; Argon2id es el híbrido que OWASP recomienda para hashing de password.

## Resultado de la decisión

**Opción elegida**: "1. Argon2id con memoryCost=19456, timeCost=2, parallelism=1", porque el benchmark en la VM objetivo (Fly.io 1-CPU) cae en una mediana de ~65 ms, dentro de la banda 50–100 ms, y `@node-rs/argon2` publica binarios prebuilt para `linux-x64-gnu`, `linux-arm64-gnu` y `darwin-arm64` (los tres targets a los que deployamos). El `DUMMY_HASH` se genera una vez en el init del módulo a partir de `env.ARGON2ID_DUMMY_PASSWORD` (un Fly secret random largo) y se reutiliza en cada camino de "usuario no encontrado" (BR-AUTH-4, BR-AUTH-9).

### Consecuencias

- **Buenas**: KDF moderna memory-hard; los parámetros son reproducibles en la VM objetivo; la igualación con `DUMMY_HASH` cierra el oráculo de timing de user enumeration; el benchmark se chequea en CI como test de seguridad (T-027.5 `argon2.parameters.test.ts`).
- **Malas**: los parámetros van a necesitar re-afinarse cuando Fly.io cambie los shapes de VM o cuando `@node-rs/argon2` publique un binario nuevo. El cambio `fly-deploy` re-corre el benchmark en la VM objetivo y actualiza las constantes si la banda se corre. El fallback al paquete npm `argon2` es un cambio de import de una línea.

### Confirmación

Validado por T-012 (`argon2.hasher.test.ts`, 5 casos) y el test de seguridad de C-2 T-027.5 (`argon2.parameters.test.ts`, 30 llamadas de hash; mediana en [50, 100] ms). El benchmark `scripts/bench-argon2.ts` es el smoke de local-dev para la banda.
