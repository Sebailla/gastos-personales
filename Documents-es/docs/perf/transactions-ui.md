# Verificación del budget de performance — `transactions-ui`

**Autor**: Sebastián Illa
**Capability**: `ui`
**Cambio fuente**: `transactions-ui`
**Estado**: implementado · **Lighthouse runs**: pendiente (owner es el usuario; ver §4)
**Audiencia**: project owner ejecutando la pasada de Lighthouse CLI después de que `sdd-archive` mergee
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4

> Codifica la asserción del budget de perf en
> `openspec/changes/transactions-ui/design.md` §10.3 y el budget
> `p95 page load < 2s` sobre `/`, `/dashboard`, y `/transactions`.
> Los comandos de Lighthouse CLI, el perfil de throttling de 4G + Moto
> G4 simulado, y los placeholders de salida JSON viven acá.
>
> La corrida de Lighthouse es una **tarea manual owned por el
> usuario** (T-UI-505). El orchestrator NO corre `pnpm run build`
> (está bloqueado por el `.env` faltante — ver apply-progress de
> slices 1-5); incluso si el build funcionara, el usuario es el
> owner de la pasada de Lighthouse CLI. Los placeholders de JSON
> resumen de abajo son llenados por el usuario post-merge según el
> protocolo de sign-off de §4.

---

## 1. Budget

La UI de producción v1 se compromete a:

- **p95 page load < 2s** sobre `/`, `/dashboard`, y `/transactions`
  bajo 4G + Moto G4 simulado.
- Total Client Component JS ≤ 10 KB gzipped (tabla de budget de
  design §10.1; los cuatro Client Components combinados son
  `Combobox` + `Dialog` + `DashboardAccountPicker` +
  `DashboardMonthSwitcher` + el estado del botón submit del
  formulario — muy por debajo del budget).
- Cero nuevas dependencias top-level (sin shadcn, sin Radix, sin
  NextUI, sin MUI, sin Chakra; `pnpm-lock.yaml` sin cambios desde
  slice 1).

El budget es conservador porque la capa de render es server-first
(los Server Components renderizan el paint inicial; los Client
Components son boundaries de hidratación solo sobre los pedazos
interactivos — design §10.4). Los tres fetches paralelos del
dashboard (`/api/reports/monthly`, `/api/reports/breakdown`,
`/api/reports/accounts/:id/flow`) son llamadas server-side
`Promise.all`, así que el wall time es `max(t1, t2, t3)` y no
`t1 + t2 + t3`.

---

## 2. Perfil de throttling

El CLI de Lighthouse usa throttling **4G + Moto G4 simulado**. Las
knobs relevantes:

| Knob                    | Valor                                       | Notas                                                  |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Network                 | Slow 4G (o `simulate`)                      | ~1.6 Mbps down / 750 Kbps up / 150ms RTT                 |
| CPU throttling          | 4× slowdown                                 | Simula un dispositivo mobile mid-range (clase Moto G4)  |
| Form factor             | `mobile`                                    | Viewport de teléfono (412 × 823 CSS px default)        |
| Throttling method       | `simulate`                                  | Determinístico, reproducible; NO `devtools`            |
| Corridas de Lighthouse  | 3 corridas por página; tomar la mediana     | Reduce flake de corrida única                           |
| Formato de salida       | `json`                                      | Machine-readable para el check de budget                |

El método de throttling `simulate` se prefiere sobre `devtools`
porque es determinístico y CI-friendly; el throttling de
`devtools` depende del CPU de la máquina host y no es
reproducible.

---

## 3. Comandos del CLI (verbatim)

Los siguientes tres comandos producen los tres archivos JSON de
Lighthouse. Correlos desde el root del worktree después de que
`pnpm build && pnpm start &` esté arriba (el server escucha en
`http://localhost:3000`):

```bash
# Arrancar el server de producción en background
pnpm build && pnpm start &

# Esperar a que el server esté listo (polling /healthz o simplemente sleep)
sleep 5

# Lighthouse sobre / (root)
npx lighthouse http://localhost:3000/ \
  --form-factor=mobile \
  --throttling-method=simulate \
  --output=json \
  --output-path=./lighthouse-root.json \
  --chrome-flags="--headless --no-sandbox"

# Lighthouse sobre /dashboard
npx lighthouse http://localhost:3000/dashboard \
  --form-factor=mobile \
  --throttling-method=simulate \
  --output=json \
  --output-path=./lighthouse-dashboard.json \
  --chrome-flags="--headless --no-sandbox"

# Lighthouse sobre /transactions
npx lighthouse http://localhost:3000/transactions \
  --form-factor=mobile \
  --throttling-method=simulate \
  --output=json \
  --output-path=./lighthouse-transactions.json \
  --chrome-flags="--headless --no-sandbox"
```

Repetir cada comando 3 veces por página y tomar la mediana de las
métricas "Total Blocking Time" + "Largest Contentful Paint" (las
dos métricas que Lighthouse usa para estimar el p95 page load).

> **Nota sobre `--chrome-flags="--headless --no-sandbox"`.** El
> flag `--no-sandbox` se requiere cuando se corre Lighthouse dentro
> de un container o CI runner sin el usuario sandbox de Chrome. En
> una máquina de developer, el flag es no-op para Chrome headless.
> Removerlo si se corre interactivamente y Chrome se queja.

---

## 4. Resúmenes JSON

> El usuario corre los comandos del CLI en §3 post-merge y pega
> los resúmenes JSON acá. Los placeholders de abajo son TBD hasta
> que T-UI-505 los llene. La asserción "p95 < 2s" es un check por
> página; cualquier página que falle el budget dispara la
> mitigación de §5 desde `design.md §16.5`.

### 4.1 `/` (root)

```json
{
  "finalUrl": "http://localhost:3000/",
  "fetchTime": "TBD",
  "environment": {
    "benchmarkIndex": "TBD",
    "throttlingMethod": "simulate",
    "formFactor": "mobile",
    "emulatedDevice": "Moto G4"
  },
  "audits": {
    "first-contentful-paint": { "score": "TBD", "displayValue": "TBD s" },
    "largest-contentful-paint": { "score": "TBD", "displayValue": "TBD s" },
    "total-blocking-time": { "score": "TBD", "displayValue": "TBD ms" },
    "cumulative-layout-shift": { "score": "TBD", "displayValue": "TBD" },
    "speed-index": { "score": "TBD", "displayValue": "TBD s" }
  },
  "categories": {
    "performance": { "score": "TBD" }
  },
  "_verdict": "TBD — p95 < 2s?"
}
```

### 4.2 `/dashboard`

```json
{
  "finalUrl": "http://localhost:3000/dashboard",
  "fetchTime": "TBD",
  "environment": {
    "benchmarkIndex": "TBD",
    "throttlingMethod": "simulate",
    "formFactor": "mobile",
    "emulatedDevice": "Moto G4"
  },
  "audits": {
    "first-contentful-paint": { "score": "TBD", "displayValue": "TBD s" },
    "largest-contentful-paint": { "score": "TBD", "displayValue": "TBD s" },
    "total-blocking-time": { "score": "TBD", "displayValue": "TBD ms" },
    "cumulative-layout-shift": { "score": "TBD", "displayValue": "TBD" },
    "speed-index": { "score": "TBD", "displayValue": "TBD s" }
  },
  "categories": {
    "performance": { "score": "TBD" }
  },
  "_verdict": "TBD — p95 < 2s? Tres fetches paralelos server-side; el wall time es max(t1, t2, t3) y no t1 + t2 + t3 por design §10.2"
}
```

### 4.3 `/transactions`

```json
{
  "finalUrl": "http://localhost:3000/transactions",
  "fetchTime": "TBD",
  "environment": {
    "benchmarkIndex": "TBD",
    "throttlingMethod": "simulate",
    "formFactor": "mobile",
    "emulatedDevice": "Moto G4"
  },
  "audits": {
    "first-contentful-paint": { "score": "TBD", "displayValue": "TBD s" },
    "largest-contentful-paint": { "score": "TBD", "displayValue": "TBD s" },
    "total-blocking-time": { "score": "TBD", "displayValue": "TBD ms" },
    "cumulative-layout-shift": { "score": "TBD", "displayValue": "TBD" },
    "speed-index": { "score": "TBD", "displayValue": "TBD s" }
  },
  "categories": {
    "performance": { "score": "TBD" }
  },
  "_verdict": "TBD — p95 < 2s? Fetch único /api/transactions?include=accountName; la rama includeAccountName agrega ~10ms para el findMany con IN clause chico por design §10.2"
}
```

---

## 5. Mitigación de falla de budget

Si el budget p95 < 2s falla en alguna página, aplica la mitigación
de `openspec/changes/transactions-ui/design.md §16.5`.
**Likelihood:** Medium. **Severity:** Medium.

La mitigación es **splittear los tres fetches paralelos del
dashboard en dos chunks**:

- Chunk A: `/api/reports/monthly?month=...` (el agregado de mayor
  volumen).
- Chunk B (paralelo): `/api/reports/breakdown?month=...` +
  `/api/reports/accounts/:id/flow?month=...`.

El split es condicional a la data de Lighthouse: si el par
breakdown + flow excede el budget en `/dashboard`, splittearlos en
dos grupos `Promise.all` secuenciales (uno por chunk) le da al
browser dos oportunidades de render-pass en lugar de una.

Si el budget sigue fallando después del split, la próxima palanca
es **cambiar la data path del dashboard de server-side `Promise.all`
a client-side `useSWR` con una ventana stale-while-revalidate de
100ms** — la sesión del usuario ve el summary primero y el
breakdown + flow llegan progresivamente. Este es un cambio
follow-up `ui-dashboard-perf`; está fuera del scope de la
verificación de budget v1.

---

## 6. Sign-off

> El usuario (project owner) pega los resúmenes JSON en §4 y
> firma la verificación del budget una vez que cada página cumple
> la asserción p95 < 2s. Si una página falla, el usuario acepta la
> corrida fuera de budget (con una nota abajo) o filéa un cambio
> follow-up.

- **Signed off by**: _______________________________
- **Date**: _______________
- **Páginas que cumplieron el budget**: _______________________________
- **Páginas que fallaron el budget** (si hay): _______________________________
- **Mitigación aplicada** (si hay): _______________________________
- **Notes** (opcional):