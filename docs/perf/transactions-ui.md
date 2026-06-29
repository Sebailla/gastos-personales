# Performance budget verification — `transactions-ui`

**Author**: Sebastián Illa
**Capability**: `ui`
**Source change**: `transactions-ui`
**Status**: implemented · **Lighthouse runs**: pending (user-owned; see §4)
**Audience**: project owner running the Lighthouse CLI sweep after `sdd-archive` merges
**Stack**: v3 — Next.js 16 + Node 20 + React 19 + Hono catch-all + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + Testing Library + pnpm + Tailwind v4

> Codifies the perf budget assertion at
> `openspec/changes/transactions-ui/design.md` §10.3 and the
> `p95 page load < 2s` budget on `/`, `/dashboard`, and
> `/transactions`. The Lighthouse CLI commands, the simulated
> 4G + Moto G4 throttling profile, and the JSON output placeholders
> live here.
>
> The Lighthouse run is a **user-owned manual task** (T-UI-505).
> The orchestrator does NOT run `pnpm run build` (it's blocked on
> the missing `.env` — see slices 1-5 apply-progress); even if the
> build worked, the user is the owner of the Lighthouse CLI sweep.
> The JSON summary placeholders below are filled by the user
> post-merge per the §4 sign-off protocol.

---

## 1. Budget

The v1 production UI commits to:

- **p95 page load < 2s** on `/`, `/dashboard`, and `/transactions`
  under simulated 4G + Moto G4.
- Total Client Component JS ≤ 10 KB gzipped (design §10.1 budget
  table; the four Client Components combined are `Combobox` +
  `Dialog` + `DashboardAccountPicker` + `DashboardMonthSwitcher` +
  the form submit-button state — well under the budget).
- Zero new top-level dependencies (no shadcn, no Radix, no NextUI,
  no MUI, no Chakra; `pnpm-lock.yaml` is unchanged from slice 1).

The budget is conservative because the render layer is server-first
(Server Components render the initial paint; the Client Components
are hydration boundaries on the interactive bits only — design
§10.4). The dashboard's three parallel fetches
(`/api/reports/monthly`, `/api/reports/breakdown`,
`/api/reports/accounts/:id/flow`) are server-side `Promise.all`
calls, so the wall time is `max(t1, t2, t3)` not `t1 + t2 + t3`.

---

## 2. Throttling profile

The Lighthouse CLI uses **simulated 4G + Moto G4** throttling.
The relevant knobs:

| Knob                    | Value                                       | Notes                                                  |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Network                 | Slow 4G (or `simulate`)                     | ~1.6 Mbps down / 750 Kbps up / 150ms RTT                 |
| CPU throttling          | 4× slowdown                                 | Simulates a mid-range mobile device (Moto G4 class)    |
| Form factor             | `mobile`                                    | Phone viewport (412 × 823 CSS px default)              |
| Throttling method       | `simulate`                                  | Deterministic, reproducible; NOT `devtools`            |
| Lighthouse runs         | 3 runs per page; take the median            | Reduces single-run flake                                |
| Output format           | `json`                                      | Machine-readable for the budget check                  |

The `simulate` throttling method is preferred over `devtools` because
it is deterministic and CI-friendly; `devtools` throttling depends
on the host machine's CPU and is not reproducible.

---

## 3. CLI commands (verbatim)

The following three commands produce the three Lighthouse JSON
files. Run them from the worktree root after `pnpm build && pnpm
start &` is up (the server listens on `http://localhost:3000`):

```bash
# Start the production server in the background
pnpm build && pnpm start &

# Wait for the server to be ready (poll /healthz or just sleep)
sleep 5

# Lighthouse on / (root)
npx lighthouse http://localhost:3000/ \
  --form-factor=mobile \
  --throttling-method=simulate \
  --output=json \
  --output-path=./lighthouse-root.json \
  --chrome-flags="--headless --no-sandbox"

# Lighthouse on /dashboard
npx lighthouse http://localhost:3000/dashboard \
  --form-factor=mobile \
  --throttling-method=simulate \
  --output=json \
  --output-path=./lighthouse-dashboard.json \
  --chrome-flags="--headless --no-sandbox"

# Lighthouse on /transactions
npx lighthouse http://localhost:3000/transactions \
  --form-factor=mobile \
  --throttling-method=simulate \
  --output=json \
  --output-path=./lighthouse-transactions.json \
  --chrome-flags="--headless --no-sandbox"
```

Repeat each command 3 times per page and take the median of the
"Total Blocking Time" + "Largest Contentful Paint" metrics (the
two metrics Lighthouse uses to estimate the p95 page load).

> **Note on `--chrome-flags="--headless --no-sandbox"`.** The
> `--no-sandbox` flag is required when running Lighthouse inside a
> container or CI runner without the Chrome sandbox user. On a
> developer machine, the flag is a no-op for headless Chrome.
> Remove it if running interactively and Chrome complains.

---

## 4. JSON summaries

> The user runs the CLI commands in §3 post-merge and pastes the
> JSON summaries here. The placeholders below are TBD until
> T-UI-505 fills them. The "p95 < 2s" assertion is a per-page
> check; any page that fails the budget triggers the §5 mitigation
> from `design.md §16.5`.

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
  "_verdict": "TBD — p95 < 2s? Three parallel server-side fetches; the wall time is max(t1, t2, t3) not t1 + t2 + t3 per design §10.2"
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
  "_verdict": "TBD — p95 < 2s? Single fetch /api/transactions?include=accountName; the includeAccountName branch adds ~10ms for the findMany with a small IN clause per design §10.2"
}
```

---

## 5. Budget failure mitigation

If the p95 < 2s budget fails on any page, the mitigation from
`openspec/changes/transactions-ui/design.md §16.5` applies.
**Likelihood:** Medium. **Severity:** Medium.

The mitigation is to **split the dashboard's three parallel
fetches into two chunks**:

- Chunk A: `/api/reports/monthly?month=...` (the highest-volume
  aggregate).
- Chunk B (parallel): `/api/reports/breakdown?month=...` +
  `/api/reports/accounts/:id/flow?month=...`.

The split is conditional on the Lighthouse data: if the breakdown
+ flow pair exceeds the budget on `/dashboard`, splitting them
into two sequential `Promise.all` groups (one per chunk) gives
the browser two render-pass opportunities instead of one.

If the budget still fails after the split, the next lever is to
**switch the dashboard's data path from server-side `Promise.all`
to client-side `useSWR` with a 100ms stale-while-revalidate
window** — the user's session sees the summary first and the
breakdown + flow arrive progressively. This is a follow-up
`ui-dashboard-perf` change; it is out of scope for the v1 budget
verification.

---

## 6. Sign-off

> The user (project owner) pastes the JSON summaries into §4 and
> signs off the budget verification once every page hits the p95
> < 2s assertion. If a page fails, the user either accepts the
> over-budget run (with a note below) or files a follow-up change.

- **Signed off by**: _______________________________
- **Date**: _______________
- **Pages that met the budget**: _______________________________
- **Pages that missed the budget** (if any): _______________________________
- **Mitigation applied** (if any): _______________________________
- **Notes** (optional):