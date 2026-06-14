# ADR-0005 — Auto-link por match de email (estándar de la industria)

**Estado**: Aceptado · **Fecha**: 2026-06-13 · **Decisores**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`design.md` §3 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Contexto y problema a resolver

Cuando un usuario se loguea con Google, hay dos casos posibles: (1) el `email_verified: true` de Google matchea un `User.email` existente en nuestra DB (el usuario se registró localmente primero y ahora está vinculando su cuenta de Google), o (2) no hay match (signup nuevo con Google). El primer caso es el flujo de auto-link. El modelo de seguridad es: ¿vinculamos silenciosamente la cuenta de Google al usuario local existente, o rechazamos el sign-in y forzamos una UI de link manual?

## Drivers

- **BR-AUTH-5**: el auto-link sucede solo cuando el `email_verified` de Google es `true`. Si el `email_verified` del perfil de Google es `false` (o falta), el flujo de OAuth falla antes en la capa de Auth.js (BR-AUTH-6). El check de defensa en profundidad en `DefaultProviderPolicy` está documentado como invariante separado.
- **BR-AUTH-10**: el `@@unique([provider, providerAccountId])` compuesto en `Account` es la única línea de defensa a nivel DB contra el ataque de "la misma cuenta de Google linkeada a dos usuarios". El test del repositorio assertea la violación `P2002` en un segundo `create` con la misma clave compuesta.
- **UX**: el comportamiento estándar de la industria (Notion, Linear, Vercel, GitHub) es auto-link por match de email verificado; una UI de link manual es follow-up, no una puerta de MVP.
- **Inmutabilidad de `defaultProvider`** (BR-AUTH-13): `defaultProvider` se setea SOLO en el primer registro. El auto-link NO muta `defaultProvider`. El usuario conserva su `defaultProvider = 'local'` original incluso después de linkear Google.

## Opciones consideradas

1. **Auto-link por match de email** cuando `email_verified: true` (estándar de la industria; Notion, Linear, Vercel, GitHub).
2. **Sin auto-link** — rechazar el sign-in y forzar una UI de link manual. Peor UX; el usuario tiene que tipear el email dos veces.
3. **Auto-link solo en `email_verified: true` AND `provider === 'google'`** — más estrecho que la opción 1; funcionalmente igual en MVP porque Google es el único provider de OAuth.
4. **Magic link por email** en vez de OAuth — sin fila de `Account`, pero elimina por completo la superficie de ataque de auto-link. Post-MVP (cubierto por el cambio `email-verification`).

## Resultado de la decisión

**Opción elegida**: "1. Auto-link por match de email cuando `email_verified: true`", porque el `@@unique([provider, providerAccountId])` compuesto es la línea de defensa de BR-AUTH-10, `email_verified: true` es la señal de confianza de BR-AUTH-5 / BR-AUTH-6 desde Google, y el estándar de UX de la industria (Notion, Linear, Vercel) es el default amigable para el usuario. La pasada de endurecimiento (notificación por email explícita de "esta cuenta de Google se vinculó a tu cuenta local existente", UI manual de "desvincular Google", y el cambio `email-verification`) queda tracked como follow-up.

### Consecuencias

- **Buenas**: fricción mínima de UX; el usuario local obtiene un login con Google sin un flujo separado de "vincular cuenta"; `defaultProvider` se queda en `'local'` (BR-AUTH-13).
- **Malas**: si un atacante controla una cuenta de Google cuyo email matchea el de un usuario local real Y el `email_verified` de Google es `true` (un compromiso del lado de Google), el atacante puede loguearse como el usuario local. Mitigado por BR-AUTH-5 (`email_verified: true` es requerido) y BR-AUTH-10 (el unique compuesto es la garantía a nivel DB). Una pasada futura de endurecimiento suma una notificación por email en el auto-link para que el usuario real se dé cuenta.

### Confirmación

Validado por T-018 (shapes de callbacks en `authjs.test.ts`) y T-013 (`DefaultProviderPolicy.test.ts`, 5 casos incluyendo el caso "sign-in posterior preserva el `defaultProvider` existente"). BR-AUTH-10 se valida por el test de T-017 `Account.findUnique` (lookup compuesto) y la futura re-corrida con testcontainers en `sdd-verify` (la aserción de violación `P2002`).
