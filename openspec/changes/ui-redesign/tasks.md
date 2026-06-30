# Tasks — `ui-redesign` (slice 1)

**Change**: `ui-redesign` — foundation layer (tokens + theme + nav shell + i18n scaffold + landing + not-found/error)
**Capability**: `ui`
**Strict TDD**: active (`pnpm test` runner, per `openspec/config.yaml`)
**PR strategy**: chained (5 PRs) — `Decision needed before apply: Yes` until the user picks `stacked-to-main` or `feature-branch-chain`
**Source artifacts**: `openspec/changes/ui-redesign/proposal.md`, `openspec/changes/ui-redesign/specs/ui/spec.md`, `openspec/changes/ui-redesign/design.md`

## Review Workload Forecast

| Field                   | Value                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Estimated changed lines | ~1300 add / ~70 del (sum across 5 PRs; no single PR > 520 LoC)                                   |
| 400-line budget risk    | Low (each PR ≤ 520 LoC; all well under 400-line per-PR with the new components split across PRs) |
| Chained PRs recommended | Yes                                                                                              |
| Suggested split         | PR 1 foundation → PR 2 tokens+theme → PR 3 chrome+i18n → PR 4 landing → PR 5 audit+docs          |
| Delivery strategy       | ask-on-risk                                                                                      |
| Chain strategy          | develop-only                                                                                     |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: develop-only
400-line budget risk: Low
```

**Chain strategy locked (per user, 2026-06-30): `develop-only`.**

This project follows **Git Flow** per `AGENTS.md` §5.1 + §5.5: `develop` is the integration branch (all completed work merges here via PR); `main` is production-only and the maintainer is the one who decides and executes the merge to `main`. Therefore the chain strategy here is:

- Each PR (PR 1 through PR 5) opens against `develop` (via `git worktree add ../gastos-personales-ui-redesign-prN -b feat/ui-redesign-prN develop`, per `AGENTS.md` §5.2).
- Each PR merges into `develop` once approved (squash-merge per the project's preference).
- `main` receives only a release PR after the user confirms the release (per `AGENTS.md` §5.5; the user must explicitly invoke the §5.5.1 override if they want the orchestrator to perform steps 5/6 of the release flow).
- Branch prefix for chained PR worktrees follows the §5.1 convention: `feat/ui-redesign-foundation` → `feat/ui-redesign-tokens-theme` → `feat/ui-redesign-chrome-i18n` → `feat/ui-redesign-landing` → `feat/ui-redesign-audit-docs`. Each is branched from `develop` and merged back to `develop`.

Per-PR worktree discipline (per `AGENTS.md` §9.7 macOS-specific quirks):

1. From a clean `develop`, run `git worktree add ../gastos-personales-ui-redesign-pr1 -b feat/ui-redesign-foundation develop`.
2. `cd ../gastos-personales-ui-redesign-pr1` and run `pnpm install --ignore-workspace` (NOT `--frozen-lockfile`) on first install because of the `pnpm-workspace.yaml` hijack at `$HOME`.
3. Run `npx prisma generate` because `--ignore-workspace` skips build scripts.
4. Implement the PR per the spec; let the apply-agent commit each task as a small, reviewable unit.
5. Delete any worktree-local `.npmrc` (`rm .npmrc`) before committing so `lint-staged` does not choke.
6. Push and open PR via `gh pr create --base develop --title "..." --body "..."` — never `--base main` for slice-1 PRs.
7. After CI passes and review approval, `gh pr merge --squash --delete-branch`, then `git worktree remove`.
8. `git checkout develop && git pull` before the next PR's worktree spin-up.

This discipline keeps each PR reviewable (≤ 520 LoC per PR, well under the 400-line per-diff budget the user-locked `AGENTS.md` §5.4 sets for slice 1) and per-PR rollbackable. Five PRs to `develop`, then the user decides when to release to `main`.

## Tasks by PR

### PR 1 — foundation

Adds the i18n scaffold (`next-intl` + `i18n.ts` + `src/i18n/request.ts` + `middleware.ts` + empty `messages/{en,es}.json`), wires `next/font/google` Inter Variable + JetBrains Mono with CSS variable exposure, and adds the first focusable `<SkipLink>`. The lockfile is regenerated and committed in the same change (per root `AGENTS.md` §5.3). No chrome, no landing, no not-found yet — those land in PR 2..5.

**Why now:** every later PR depends on `next-intl` being available, on `app/layout.tsx` having a typed locale, and on `prefers-reduced-motion`/`prefers-reduced-transparency` being addressable from the same `<head>`. Without the i18n+font foundation in place first, every subsequent PR would need a stub re-write.

- **T-PR1-01** — ~~Add `next-intl` to `dependencies` in `package.json` (pinned, no caret per project lockfile policy) and regenerate `pnpm-lock.yaml` in the same commit.~~ DONE (commit `59c9027`).

  - **Path**: `package.json`, `pnpm-lock.yaml`
  - **TDD state**: N/A (config)
  - **Verify**: `pnpm install --ignore-workspace` (per `AGENTS.md` §9.7 hijack workaround) leaves a clean tree; `cat pnpm-lock.yaml | grep -c '^  next-intl@'` returns `1`; `git diff --stat pnpm-lock.yaml` shows a deterministic diff against the previous commit (no surprise transitive bumps).
  - **Rollback**: `git revert <sha>` restores the lockfile + the `dependencies` entry in one shot.

- **T-PR1-02** — ~~Create `i18n.ts` exporting `locales`, `defaultLocale = 'en'`, and `localePrefix = 'as-needed'`.~~ DONE (commit `276852a`).

  - **Path**: `i18n.ts` (new, root)
  - **TDD state**: N/A (config export)
  - **Verify**: `pnpm typecheck` — `import { locales, defaultLocale, localePrefix } from './i18n';` resolves from `src/i18n/request.ts` and from `middleware.ts`; runtime unit test asserts `defaultLocale === 'en'`.
  - **Rollback**: delete `i18n.ts`; no other file imports it yet.

- **T-PR1-03** — ~~Create `src/i18n/request.ts` with `getRequestConfig` that reads the active locale from `next/headers` (`x-locale` header set by middleware) and dynamic-imports `messages/${locale}.json`.~~ DONE (commit `177707e`).

  - **Path**: `src/i18n/request.ts` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: unit test with a mocked `next/headers` `headers().get('x-locale')` returns `'es'` asserts the resolved messages object is the `messages/es.json` contents; `pnpm typecheck`.
  - **Rollback**: delete `src/i18n/request.ts`; referenced only by `next.config.ts` in PR 1 and by layouts in PR 3.

- **T-PR1-04** — ~~Create `middleware.ts` combining `createMiddleware(routing)` from `next-intl/middleware` with `x-pathname` and `x-locale` header injection (via `NextResponse.next({ headers })`) for the server-side `<AppShell>` decision.~~ DONE (commit `65dccdb`).

  - **Path**: `middleware.ts` (new, root)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: unit/integration test with `Accept-Language: es-AR,es;q=0.9,en;q=0.8` asserts `x-locale === 'es'` on the response headers; same test with `Accept-Language: en-US,en;q=0.9` asserts `'en'`; `Accept-Language: ja,fr;q=0.8` asserts `'en'` (locked Q1 default); `NEXT_LOCALE=en` cookie + `Accept-Language: es-AR` asserts `'en'` (cookie wins); `x-pathname === '/'` for `GET /` and `x-pathname === '/auth/signin'` for `GET /auth/signin`.
  - **Rollback**: delete `middleware.ts`; no page depends on `x-locale`/`x-pathname` until PR 3 mounts `<AppShell>`.

- **T-PR1-05** — ~~Create empty message catalogs `messages/en.json` and `messages/es.json` (objects with the seven namespaces: `topbar`, `sidebar`, `bottomTabBar`, `themeToggle`, `languageSwitcher`, `landing`, `notFound`, `error` — keys can be absent, the `getRequestConfig` fallback returns the key string verbatim per REQ-UI-24).~~ DONE (commit `909344d`).

  - **Path**: `messages/en.json` (new), `messages/es.json` (new)
  - **TDD state**: N/A (seed data)
  - **Verify**: `pnpm test` — the `next-intl` fallback test from T-PR1-03 renders a key present only in `es.json` for an English user and asserts the literal key string appears (no throw); `pnpm exec jsonlint messages/en.json messages/es.json` passes.
  - **Rollback**: `git rm messages/{en,es}.json`.

- **T-PR1-06** — **Wire `next/font/google` in `app/layout.tsx`: load Inter Variable (weights 400, 500, 600, 700, `display: 'swap'`, `preload: true`) and JetBrains Mono (weights 400, 500, same options), assign to CSS variables `--font-inter` and `--font-jb-mono` on the root `<html>`, and add `--font-sans: var(--font-inter)` + `--font-mono: var(--font-jb-mono)` to the existing `@theme inline` block in `app/globals.css`.**

  - **Path**: `app/layout.tsx` (modify), `app/globals.css` (modify, append 2 lines inside `@theme inline`)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `fonts.test.tsx` (new) asserts the rendered HTML contains zero `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` (REQ-UI-18 scenario 1); asserts `getComputedStyle(documentElement).getPropertyValue('--font-inter')` is non-empty; `pnpm typecheck`; `pnpm build` succeeds (Next.js emits the `@font-face` style block only when the font is referenced from a page).
  - **Rollback**: revert the two layout changes; the `font-sans` mapping in `app/globals.css` becomes a no-op (Tailwind falls back to its default family).

- **T-PR1-07** — **Create `app/_ui/layout/skip-link.tsx` (server component): a single `<a href="#main-content">` visually hidden until focus, with a localized `label` prop.**

  - **Path**: `app/_ui/layout/skip-link.tsx` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: `skip-link.test.tsx` asserts the anchor renders with `href="#main-content"`, the label is the literal prop value, and the `sr-only focus:not-sr-only` utility classes resolve to visibility-on-focus (vitest-axe scan finds no a11y violations); `pnpm typecheck`.
  - **Rollback**: delete the file; nothing references it until T-PR1-08.

- **T-PR1-08** — **Mount `<SkipLink label={...}>` as the first child of `<body>` in `app/layout.tsx` (the `<main id="main-content" tabIndex={-1}>` target lands in PR 3 with `<AppShell>`; for PR 1 the link still resolves to a non-existing anchor — that is fine, the `href` is a static string).**

  - **Path**: `app/layout.tsx` (modify, +1 import + 1 element)
  - **TDD state**: RED → GREEN
  - **Verify**: Playwright `tests/e2e/ui-redesign.spec.ts` (created in PR 5; for PR 1, a temporary assertion in `skip-link.test.tsx` with `jsdom` does the check) asserts the first focusable element on a page mount is the skip link; `pnpm test`.
  - **Rollback**: revert the import + element; `<SkipLink>` is unreferenced.

- **T-PR1-09** — **Wrap the existing Sentry config in `next.config.ts` with `createNextIntlPlugin('./src/i18n/request.ts')`.**

  - **Path**: `next.config.ts` (modify, +3 / −1)
  - **TDD state**: N/A (build config)
  - **Verify**: `pnpm build` succeeds; the build output logs `next-intl plugin initialized` (or equivalent — assert via `pnpm build 2>&1 | grep -q 'next-intl'`); CSP headers unchanged (run `pnpm exec @next/codemod next-og-image-headers --dry` or `curl -I http://localhost:3000` and grep for the existing CSP `script-src 'self' 'unsafe-inline'`).
  - **Rollback**: revert the wrapper; no runtime impact on the production build beyond a missing build-time i18n validation.

- **T-PR1-10** — **Create `docs/qa/ui-redesign.md` stub with a header and an empty per-pair table (light + dark columns, four pair rows: `--ui-fg` on `--ui-glass-bg`, `--ui-fg-muted` on `--ui-glass-bg`, `--ui-accent` on `--ui-glass-bg`, large heading on gradient substrate).**

  - **Path**: `docs/qa/ui-redesign.md` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: `audit.test.ts` (PR 5 deliverable; for PR 1 the test asserts the file exists and the table header is present); `pnpm exec markdownlint docs/qa/ui-redesign.md`.
  - **Rollback**: `git rm docs/qa/ui-redesign.md`.

- **T-PR1-11** — **Test bundle: write `i18n-request.test.ts` (locale dispatch), `middleware-headers.test.ts` (Accept-Language + cookie + `x-pathname`), `skip-link.test.tsx` (first focusable, axe clean), `fonts.test.tsx` (no CDN link, CSS vars present).**
  - **Path**: `src/i18n/__tests__/i18n-request.test.ts` (new), `middleware-headers.test.ts` (new), `app/_ui/layout/skip-link.test.tsx` (new), `fonts.test.tsx` (new)
  - **TDD state**: TRIANGULATE (the failing tests precede the production code in T-PR1-03..08)
  - **Verify**: `pnpm test` — all four test files pass; `pnpm test:coverage` reports ≥ 80% on the new files (within the existing 80% repo gate).
  - **Rollback**: `git rm <test files>`; production code stays.

### PR 2 — tokens + theme

Appends the seven glass/gradient/shadow tokens to `app/_ui/tokens.css` (byte-for-byte safe: the 14 pre-existing color variables are untouched), renames the dark-scope selector from `[data-theme='dark']` to `.dark` (REQ-UI-9 MODIFIED), exposes the new tokens in `@theme inline` of `app/globals.css`, adds the `prefers-reduced-transparency` and `prefers-reduced-motion` overrides, and ships the `ThemeProvider` + `ThemeToggle` + no-FOUC inline script. The `Spinner` + `Skeleton` get `motion-safe:` variants and the `Button` is verified to consume `font-sans` (no CDN reference).

**Why now:** the chrome (PR 3) and the landing (PR 4) both render on top of glass surfaces; without the tokens, the chrome's `bg-ui-glass-1` utility would not resolve. The dark-mode selector rename is a pre-req for the theme cycle tests (which assert `<html class="dark">` flips the palette).

- **T-PR2-01** — **Append the 7 new CSS custom properties inside the `@layer base { :root { ... } }` block of `app/_ui/tokens.css` (just after the existing `--ui-font-bold` line, before the closing braces): `--ui-glass-bg`, `--ui-glass-border`, `--ui-glass-blur-sm` (12px), `--ui-glass-blur-lg` (20px), `--ui-shadow-glass`, `--ui-gradient-from`, `--ui-gradient-via`, `--ui-gradient-to`. Use the values from design §Tokens. Update the file's docstring comment to mention the new tokens and the `ui-redesign` change name.**

  - **Path**: `app/_ui/tokens.css` (modify, append-only)
  - **TDD state**: N/A (the append is verified by T-PR2-13's diff-assertion test, RED first)
  - **Verify**: `tokens.test.ts` (created in T-PR2-13) reads the file and asserts all 7 new variables are declared; `git diff HEAD -- app/_ui/tokens.css` shows only `+` lines for the new tokens and the docstring update; no `-` lines against the 14 existing color variables.
  - **Rollback**: `git revert <sha>` removes the appended block in one commit; the 14 existing variables are untouched.

- **T-PR2-02** — **Rename the dark-scope selector wrapper in `app/_ui/tokens.css` from `[data-theme='dark']` to `.dark` (1-line change; the 14 dark-mode color value declarations inside the block are byte-for-byte unchanged per REQ-UI-19 scenario 2).**

  - **Path**: `app/_ui/tokens.css` (modify, 1 line)
  - **TDD state**: N/A (mechanical rename)
  - **Verify**: `git diff HEAD -- app/_ui/tokens.css` shows a single `-[data-theme='dark'] {` line and a single `+.dark {` line; `tokens.test.ts` (T-PR2-13) asserts the file contains `.dark {` and not `[data-theme='dark'] {`.
  - **Rollback**: revert the 1-line change.

- **T-PR2-03** — **Expose the 7 new tokens inside the `@theme inline { ... }` block of `app/globals.css` so Tailwind v4 generates `bg-ui-glass-1`, `bg-ui-glass-2`, `shadow-glass`, `from-ui-gradient-from`, `via-ui-gradient-via`, `to-ui-gradient-to`, `border-ui-glass-border`, `backdrop-blur-[var(--ui-glass-blur-sm)]` (or equivalent) utilities. Add `--ui-glass-bg-solid` (alpha 1.0) for the reduced-transparency fallback.**

  - **Path**: `app/globals.css` (modify, +~20 lines inside `@theme inline`)
  - **TDD state**: N/A
  - **Verify**: `pnpm build` emits the new utility classes; `tokens.test.ts` greps the built CSS for `bg-ui-glass` and `shadow-glass` selectors.
  - **Rollback**: revert the `@theme inline` additions.

- **T-PR2-04** — **Add the `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` override to the bottom of `app/globals.css`.**

  - **Path**: `app/globals.css` (modify, +6 lines)
  - **TDD state**: RED → GREEN
  - **Verify**: `reduced-motion.test.tsx` (new) renders a `Spinner` with a mocked `matchMedia('(prefers-reduced-motion: reduce)')` returning `{ matches: true }` and asserts `getComputedStyle(spinner).animationName === 'none'`; same for `Skeleton`.
  - **Rollback**: revert the `@media` block.

- **T-PR2-05** — **Add the `@media (prefers-reduced-transparency: reduce) { .bg-ui-glass-1, .bg-ui-glass-2 { backdrop-filter: none !important; background-color: var(--ui-glass-bg-solid) !important; } }` override to `app/globals.css`.**

  - **Path**: `app/globals.css` (modify, +5 lines)
  - **TDD state**: RED → GREEN
  - **Verify**: `glass-card.test.tsx` (created in PR 3, but the CSS override is testable in PR 2 with a hand-rolled `<div className="bg-ui-glass-1">` test) asserts `getComputedStyle(div).backdropFilter === 'none'` under reduced-transparency and `getComputedStyle(div).backgroundColor` resolves to the solid alpha-1 value.
  - **Rollback**: revert the `@media` block.

- **T-PR2-06** — **Create `app/_ui/providers/theme-provider.tsx` (client component): `useTheme()` exposes `{ mode, resolved, setMode, cycle }`; cycle order is `system → light → dark → system`; subscribes to `matchMedia('(prefers-color-scheme: dark)')` only when `mode === 'system'`; on mount it does NOT write to `<html>` (the inline FOUC script owns that) — it reads the class to seed its state.**

  - **Path**: `app/_ui/providers/theme-provider.tsx` (new)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `theme-provider.test.tsx` (new) asserts (1) `cycle()` called 3× on a `system` initial state produces `localStorage['ui.theme']` values `'light'`, `'dark'`, `'system'` in order; (2) `setMode('dark')` writes `'dark'` to `localStorage`; (3) under `mode === 'system'`, the provider attaches a `matchMedia` listener and detaches on unmount; (4) `vitest-axe` finds no a11y violations on a render of `<ThemeProvider><div/></ThemeProvider>`.
  - **Rollback**: delete the file; nothing imports it until T-PR2-09.

- **T-PR2-07** — **Add the no-FOUC inline blocking `<script>` to `<head>` of `app/layout.tsx`. The script reads `localStorage['ui.theme']` → `matchMedia('(prefers-color-scheme: dark)')` → `'light'` (in that precedence) and adds `class="dark"` to `document.documentElement` when dark should be active. No `defer`, no `async`. The script is plain JavaScript, fully synchronous.**

  - **Path**: `app/layout.tsx` (modify, +1 `<script dangerouslySetInnerHTML>` block in `<head>`)
  - **TDD state**: RED → GREEN
  - **Verify**: `fouc-script.test.tsx` (new) mounts the layout in JSDOM with `matchMedia = (q) => ({ matches: q.includes('dark'), ... })`, no `localStorage`, asserts `documentElement.classList.contains('dark')`; same test with `localStorage['ui.theme'] = 'light'` asserts it does NOT; same test with `localStorage['ui.theme'] = 'dark'` asserts it does.
  - **Rollback**: remove the `<script>` block.

- **T-PR2-08** — **Create `app/_ui/providers/theme-toggle.tsx` (client component): a `<button type="button" aria-pressed={mode !== 'system'} aria-label={labels[current]}>` that calls `cycle()` on click; renders an inline glyph + label on `≥ sm`, glyph only on `< sm`.**

  - **Path**: `app/_ui/providers/theme-toggle.tsx` (new)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `theme-toggle.test.tsx` (new) asserts the button is reachable by `Tab`; click calls `cycle()` and updates `aria-pressed`; on three clicks the persisted `localStorage['ui.theme']` cycles through `light`/`dark`/`system`; `vitest-axe` clean.
  - **Rollback**: delete the file; mounted in PR 3.

- **T-PR2-09** — **Mount `<ThemeProvider>` wrapping `{children}` in `app/layout.tsx` (between `<SkipLink>` and the children). The provider does not render any DOM of its own.**

  - **Path**: `app/layout.tsx` (modify, +1 import + 1 element)
  - **TDD state**: RED → GREEN
  - **Verify**: `pnpm test` (existing tests still pass) + `pnpm typecheck` + smoke: `pnpm build` succeeds; a quick render in `app/page.tsx` of `useTheme()` returns `{ mode: 'system' }` on first visit (test-only, removed before PR 4).
  - **Rollback**: remove the wrapper.

- **T-PR2-10** — **Modify `app/_ui/primitives/spinner.tsx` to use `motion-safe:animate-spin` (was `animate-spin`) and to render the literal text `Cargando…` / `Loading…` (resolved via `useTranslations('spinner')`) under `prefers-reduced-motion: reduce`.**

  - **Path**: `app/_ui/primitives/spinner.tsx` (modify, +4 / −1)
  - **TDD state**: RED → GREEN
  - **Verify**: `spinner.test.tsx` (new) with mocked `matchMedia('(prefers-reduced-motion: reduce)')` returning `{ matches: true }` asserts the static text appears; same test without the mock asserts `getComputedStyle(spinner).animationName === 'spin'`.
  - **Rollback**: revert the `motion-safe:` prefix and the conditional text.

- **T-PR2-11** — **Modify `app/_ui/primitives/skeleton.tsx` to use `motion-safe:animate-pulse` (was `animate-pulse`).**

  - **Path**: `app/_ui/primitives/skeleton.tsx` (modify, +1 / −1)
  - **TDD state**: RED → GREEN
  - **Verify**: `skeleton.test.tsx` (new) with reduced-motion mock asserts `getComputedStyle(skeleton).animationName === 'none'`; without the mock asserts `'pulse'`.
  - **Rollback**: revert the `motion-safe:` prefix.

- **T-PR2-12** — **Audit `app/_ui/primitives/button.tsx` and replace any remaining CDN-font reference (e.g. `font-['Inter']`, raw `font-family` literals) with the `font-sans` utility, so the only Inter reference is the preloaded one from PR 1.**

  - **Path**: `app/_ui/primitives/button.tsx` (modify, 0–2 lines)
  - **TDD state**: N/A (mechanical; verify with grep)
  - **Verify**: `pnpm exec grep -rE "fonts\\.googleapis|Inter['\\\"],\\s*['\\\"]?sans" app/` returns 0 matches (other than `app/layout.tsx` which legitimately imports from `next/font/google`); `pnpm typecheck`.
  - **Rollback**: revert the line(s).

- **T-PR2-13** — **Test bundle: write `tokens.test.ts` (asserts the 7 new variables present + dark-scope selector `.dark` + `git diff` has only `+` lines against the 14 existing color variables), `fouc-script.test.tsx`, `reduced-motion.test.tsx`, `glass-card-css.test.tsx` (the reduced-transparency CSS test from T-PR2-05), `theme-provider.test.tsx` (from T-PR2-06), `theme-toggle.test.tsx` (from T-PR2-08), `spinner.test.tsx` (from T-PR2-10), `skeleton.test.tsx` (from T-PR2-11).**
  - **Path**: `app/_ui/tokens.test.ts` (new), `app/_ui/fouc-script.test.tsx` (new), `app/_ui/reduced-motion.test.tsx` (new), `app/_ui/glass-card-css.test.tsx` (new), `app/_ui/providers/theme-provider.test.tsx` (new), `app/_ui/providers/theme-toggle.test.tsx` (new), `app/_ui/primitives/spinner.test.tsx` (new), `app/_ui/primitives/skeleton.test.tsx` (new)
  - **TDD state**: TRIANGULATE (all RED before their GREEN counterparts in T-PR2-01..12)
  - **Verify**: `pnpm test` — all eight test files pass; `pnpm test:coverage:enforced` stays ≥ 80% on `app/_ui/`.
  - **Rollback**: `git rm <test files>`.

### PR 3 — chrome + i18n

Builds the navigation shell: `Topbar`, `Sidebar` (client; collapse state round-trips through URL + `localStorage`), `BottomTabBar`, `AppShell` (decides the chrome from `x-pathname` + `x-locale`), `LanguageSwitcher` (popover on `< sm`, inline on `≥ sm`), and `GlassCard`. Mounts `<AppShell>` in `app/layout.tsx`. The seven production surfaces pick up the chrome automatically via the RootLayout — no per-page edit needed.

**Why now:** the landing (PR 4) renders inside the chrome, and the not-found/error (PR 4) share the same Topbar. Without `<AppShell>` mounted, the landing would have to inline its own wrapper.

- **T-PR3-01** — **Create `app/_ui/primitives/glass-card.tsx` (server component): polymorphic `<GlassCard as?: 'div' | 'article' | 'section' tone?: 'glass-1' | 'glass-2'>` that maps `tone` to `bg-ui-glass-1` or `bg-ui-glass-2` + `backdrop-blur-[var(--ui-glass-blur-sm/lg)]` + `shadow-glass`. Under reduced-transparency, the CSS override from PR 2 (T-PR2-05) replaces the blur with a solid.**

  - **Path**: `app/_ui/primitives/glass-card.tsx` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: `glass-card.test.tsx` (new, completes the PR 2 stub) asserts the `tone='glass-2'` variant renders with the larger blur; under reduced-transparency mock `getComputedStyle(card).backdropFilter === 'none'`; `vitest-axe` clean; contrast ≥ 4.5:1 documented in `docs/qa/ui-redesign.md` (PR 5).
  - **Rollback**: delete the file.

- **T-PR3-02** — **Create `app/_ui/layout/topbar.tsx` (server component): `<header>` with three flex-row slots (`left` = brand label, `center` = page-context placeholder, `right` = `<ThemeToggle/>` + `<LanguageSwitcher/>` from PR 1/2). Includes a `<nav aria-label="User">` wrapping the right slot. 56 px mobile-first height.**

  - **Path**: `app/_ui/layout/topbar.tsx` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: `topbar.test.tsx` (new) asserts a `<header>` + a `<nav aria-label="User">` are rendered; the `right` slot children appear; `vitest-axe` clean; `pnpm typecheck`.
  - **Rollback**: delete the file.

- **T-PR3-03** — **Create `app/_ui/layout/sidebar.tsx` (client component): collapsible `<aside>` containing `<nav aria-label="Primary">` with a `<ul>` of `links` (`dashboard`, `accounts`, `transactions` for slice 1). Collapse toggle: `<button aria-expanded aria-controls="primary-nav-list">` with a persistent chevron. Collapse state round-trips through `?sidebar=collapsed` (URL source of truth on first load) and `localStorage['ui.sidebarCollapsed']` (subsequent navigations). Hidden on `< lg` via `hidden lg:block`.**

  - **Path**: `app/_ui/layout/sidebar.tsx` (new)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `sidebar.test.tsx` (new) asserts (1) the round-trip: click collapse → URL gains `?sidebar=collapsed` AND `localStorage['ui.sidebarCollapsed'] === 'true'`; reload → renders collapsed; navigate to `/accounts` → still collapsed; click again → URL drops the param AND `localStorage === 'false'`; (2) two distinct `<nav>` landmarks present (Topbar's + Sidebar's); (3) `vitest-axe` clean.
  - **Rollback**: delete the file; no caller yet.

- **T-PR3-04** — **Create `app/_ui/layout/bottom-tab-bar.tsx` (server component): `<nav aria-label="Primary">` fixed at the bottom on `< lg` (Tailwind `lg:hidden`). Slice 1 ships 3 active destinations (`dashboard`, `accounts`, `transactions`) and 2 reserved slots rendered as `aria-disabled="true"` placeholders (per design §Component surface — open decision in PR 3 is to render them, not omit them, so the visual layout is final for slice 1). Uses `safe-area-inset-bottom` padding for iOS.**

  - **Path**: `app/_ui/layout/bottom-tab-bar.tsx` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: `bottom-tab-bar.test.tsx` (new) asserts 5 destinations render, distinct `<nav aria-label="Primary">` from Topbar's user-nav, each destination is `≥ 44×44 px` (assert via `getBoundingClientRect`); `vitest-axe` clean.
  - **Rollback**: delete the file.

- **T-PR3-05** — **Create `app/_ui/providers/language-switcher.tsx` (client component): popover variant on `< sm` (single icon button + focus-trapped popover with `Español` / `English`); inline segmented buttons on `≥ sm` (`aria-pressed={activeLocale === code}`). On select: set `NEXT_LOCALE` cookie (1-year `Max-Age=31536000`, `SameSite=Lax`, `Path=/`, `Secure` in prod per open decision §11.3 default) and call `router.refresh()`.**

  - **Path**: `app/_ui/providers/language-switcher.tsx` (new)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `language-switcher.test.tsx` (new) asserts (1) on `< sm` (mocked `matchMedia`) the popover opens on click and lists `Español` + `English`; (2) selecting `English` writes `document.cookie` containing `NEXT_LOCALE=en` and calls `router.refresh` (mocked); (3) on `≥ sm` the two inline buttons render with `aria-pressed` flipping; (4) `vitest-axe` clean.
  - **Rollback**: delete the file; no caller yet.

- **T-PR3-06** — **Create `app/_ui/layout/app-shell.tsx` (server component): reads `headers().get('x-pathname')` and `headers().get('x-locale')`; conditionally renders Topbar + Sidebar (≥ `lg`) / BottomTabBar (< `lg`) per the pathname matrix in design §Architecture (landing → Topbar only, no sidebar/bottom; `/auth/*` → no chrome; `/dashboard`, `/accounts/*`, `/transactions/*` → full chrome; not-found + error → Topbar only). Wraps `children` in `<main id="main-content" tabIndex={-1}>` (the skip-link target).**

  - **Path**: `app/_ui/layout/app-shell.tsx` (new)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `app-shell.test.tsx` (new) asserts the chrome matrix: `x-pathname=/` → Topbar only; `x-pathname=/dashboard` → Topbar + Sidebar; `x-pathname=/auth/signin` → no chrome; `x-pathname=/this-does-not-exist` → Topbar only; `x-pathname=/dashboard` + mocked viewport `< lg` → Topbar + BottomTabBar (no Sidebar); the `<main id="main-content" tabIndex={-1}>` wraps `children`.
  - **Rollback**: delete the file.

- **T-PR3-07** — **Mount `<AppShell>` in `app/layout.tsx` (between `<ThemeProvider>` and the existing children content). The layout is now: `<html><head><FOUC script/></head><body><SkipLink/><ThemeProvider><AppShell>{children}</AppShell></ThemeProvider></body></html>`. The `lang` attribute on `<html>` is set from the `x-locale` header (read via `headers().get('x-locale')` in the RootLayout).**

  - **Path**: `app/layout.tsx` (modify, +2 imports + structural wrap; +1 attribute on `<html>`)
  - **TDD state**: N/A (integration)
  - **Verify**: `pnpm build` succeeds; a Playwright e2e (added in PR 5) renders `/` and asserts `<html lang="es">` for `Accept-Language: es-AR`; `pnpm test` (all prior tests pass) + `pnpm typecheck`; smoke: `pnpm dev` + manual visit to `/`, `/dashboard`, `/auth/signin` shows the right chrome.
  - **Rollback**: revert the layout edits.

- **T-PR3-08** — **Add the chrome translations to `messages/en.json` and `messages/es.json`: `topbar.brand`, `topbar.userNav.aria`, `sidebar.primary.aria`, `sidebar.collapse.aria`, `sidebar.links.dashboard|accounts|transactions`, `bottomTabBar.primary.aria`, `bottomTabBar.links.dashboard|accounts|transactions|reserved1|reserved2`, `themeToggle.labels.system|light|dark`, `themeToggle.aria`, `languageSwitcher.labels.es|en|aria`, `languageSwitcher.popover.aria`.**

  - **Path**: `messages/en.json` (modify), `messages/es.json` (modify)
  - **TDD state**: N/A (seed data)
  - **Verify**: `pnpm test` — `i18n-request.test.ts` (T-PR1-03) re-asserts that the keys resolve to non-empty strings in both catalogs; `pnpm exec jsonlint messages/{en,es}.json` passes; the e2e Playwright test from PR 5 asserts the visible Topbar brand text matches `topbar.brand` for each locale.
  - **Rollback**: revert the JSON edits.

- **T-PR3-09** — **Test bundle: write `app-shell.test.tsx` (from T-PR3-06), `sidebar.test.tsx` (from T-PR3-03), `topbar.test.tsx` (from T-PR3-02), `bottom-tab-bar.test.tsx` (from T-PR3-04), `language-switcher.test.tsx` (from T-PR3-05), `glass-card.test.tsx` (from T-PR3-01).**
  - **Path**: `app/_ui/layout/app-shell.test.tsx` (new), `app/_ui/layout/sidebar.test.tsx` (new), `app/_ui/layout/topbar.test.tsx` (new), `app/_ui/layout/bottom-tab-bar.test.tsx` (new), `app/_ui/providers/language-switcher.test.tsx` (new), `app/_ui/primitives/glass-card.test.tsx` (new)
  - **TDD state**: TRIANGULATE
  - **Verify**: `pnpm test:coverage:enforced` passes 80% on `app/_ui/`; `pnpm lint` clean; `pnpm typecheck` clean.
  - **Rollback**: `git rm <test files>`.

### PR 4 — landing

Replaces the placeholder `app/page.tsx` with the marketing landing (REQ-UI-12): hero + exactly 3 feature cards + exactly 2 CTAs; 302 redirect for authed visitors; Spanish-first copy via `next-intl`. Creates `app/not-found.tsx` + `app/error.tsx` in the new visual language (REQ-UI-20).

**Why now:** the chrome and tokens are in place; the landing is the user-visible payoff the maintainer named in the proposal's Why ("esto da asco" — the emotional tone). The not-found + error close the spec's REQ-UI-20 gap.

- **T-PR4-01** — **Modify `app/page.tsx`: at the top of the Server Component, call `auth()` and `if (session) redirect('/dashboard')` (Next.js `redirect` emits 302 server-side; `permanentRedirect` is NOT used because the auth state is dynamic). The redirect precedes any JSX render.**

  - **Path**: `app/page.tsx` (modify, +3 / −2)
  - **TDD state**: RED → GREEN
  - **Verify**: `app/page.test.tsx` (new, mocked `auth()` returning a session) asserts `redirect('/dashboard')` was called and the response status is `302`; same test with `auth()` returning `null` does NOT redirect; `pnpm typecheck`.
  - **Rollback**: revert the 3 lines.

- **T-PR4-02** — **Replace the placeholder `<h1>gastos-personales</h1>` body in `app/page.tsx` with the marketing hero: one `<h1>` value prop localized via `getTranslations('landing')`, a gradient background (`bg-gradient-to-br from-ui-gradient-from via-ui-gradient-via to-ui-gradient-to`), and a glass card hosting the hero copy.**

  - **Path**: `app/page.tsx` (modify, +~40 / −5)
  - **TDD state**: RED → GREEN
  - **Verify**: `app/page.test.tsx` (TRIANGULATE) asserts the response body contains exactly one `<h1>` and the hero text matches `landing.hero.title` for the active locale; `pnpm typecheck`.
  - **Rollback**: revert the body.

- **T-PR4-03** — **Add exactly 3 feature cards to `app/page.tsx`, each as a `<GlassCard as="article" tone="glass-1">` containing a heading + body copy from `landing.features.{one,two,three}.{title,body}`. Cards collapse to a single column below Tailwind `md`.**

  - **Path**: `app/page.tsx` (modify, +~50)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `app.page.test.tsx` TRIANGULATE-2 asserts the response contains exactly 3 elements with class `feature-card` (or `data-component="feature-card"`); `vitest-axe` clean on the section.
  - **Rollback**: revert the addition.

- **T-PR4-04** — **Add exactly 2 `<a>` CTAs to `app/page.tsx`: `Crear cuenta` → `/auth/register` and `Iniciar sesión` → `/auth/signin`, with labels from `landing.cta.{primary,secondary}`. Each rendered as a `Button` with the right `tone` (primary = filled accent, secondary = outline).**

  - **Path**: `app/page.tsx` (modify, +~20)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `app.page.test.tsx` TRIANGULATE-3 asserts the response contains exactly 2 `<a>` with `href="/auth/register"` and `href="/auth/signin"`; visible labels are `Crear cuenta` / `Iniciar sesión` for `es`; for `en` the labels are `Create account` / `Sign in`; `vitest-axe` clean (touch targets ≥ 44×44).
  - **Rollback**: revert the addition.

- **T-PR4-05** — **Add landing + not-found + error keys to `messages/en.json` and `messages/es.json`: `landing.hero.title`, `landing.hero.subtitle`, `landing.features.{one,two,three}.{title,body}`, `landing.cta.{primary,secondary}`, `notFound.title`, `notFound.body`, `notFound.cta`, `notFound.documentTitle`, `error.title`, `error.body`, `error.retry`, `error.documentTitle`.**

  - **Path**: `messages/en.json` (modify), `messages/es.json` (modify)
  - **TDD state**: N/A
  - **Verify**: `pnpm exec jsonlint messages/{en,es}.json`; the existing `i18n-request.test.ts` (T-PR1-03) re-asserts the keys resolve; `pnpm typecheck`.
  - **Rollback**: revert the JSON edits.

- **T-PR4-06** — **Create `app/not-found.tsx` (root scope): renders in the new visual language (glass card on gradient substrate), localized copy via `getTranslations('notFound')`, a CTA `<a href="/">` with label from `notFound.cta`, exports a `metadata` object with `title: t('notFound.documentTitle')`. Includes a `<main>` landmark.**

  - **Path**: `app/not-found.tsx` (new)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `not-found.test.tsx` (new) renders with mocked locale `es` and asserts the response status is `404`, the body contains `No encontrado`, the CTA `href="/"` resolves, the `<title>` matches `notFound.documentTitle`, and a `<main>` is present; same test with locale `en` asserts `Not found`; `vitest-axe` clean.
  - **Rollback**: `git rm app/not-found.tsx`; the existing (legacy) `app/not-found.tsx` is not present, so the file is a clean creation.

- **T-PR4-07** — **Create `app/error.tsx` (root scope, `'use client'` directive required by Next.js for `reset()`): renders in the new visual language, localized copy via `useTranslations('error')`, a retry `<button onClick={() => reset()}>` with label from `error.retry`, a `<main>` landmark. The page must NOT include the legacy `Something went wrong` literal.**

  - **Path**: `app/error.tsx` (new)
  - **TDD state**: RED → GREEN → TRIANGULATE
  - **Verify**: `error.test.tsx` (new) renders with mocked locale `es`, asserts the body contains `Error` + a retry button calling `reset()` (mocked), the `<title>` matches `error.documentTitle`, a `<main>` is present; grep the source for the legacy `Something went wrong` literal — `git grep -n "Something went wrong" app/error.tsx` returns 0; `vitest-axe` clean.
  - **Rollback**: `git rm app/error.tsx`.

- **T-PR4-08** — **Test bundle: write `app/page.test.tsx` (302 + 1 h1 + 3 cards + 2 CTAs), `not-found.test.tsx`, `error.test.tsx`. Add a `__snapshots__/` baseline for the landing HTML structure (so a future accidental change to the card count or CTA count breaks the snapshot).**
  - **Path**: `app/page.test.tsx` (new), `app/not-found.test.tsx` (new), `app/error.test.tsx` (new), `app/__snapshots__/page.test.tsx.snap` (new)
  - **TDD state**: TRIANGULATE
  - **Verify**: `pnpm test` — all tests pass including the snapshot; `pnpm test:coverage:enforced` stays ≥ 80%; `pnpm typecheck`.
  - **Rollback**: `git rm <test files>`.

### PR 5 — accessibility audit + docs

Fills `docs/qa/ui-redesign.md` with the contrast audit (tool + per-pair ratios + verdict) for both themes. Updates `README.md` + `Documents-es/README.md` with the ui-redesign note. Updates `CHANGELOG.md` `[Unreleased]` section. Finalizes the Playwright `tests/e2e/ui-redesign.spec.ts` suite (the test file was scaffolded in PR 1 as a placeholder; this PR adds the assertions).

**Why now:** REQ-UI-21 mandates a recorded contrast audit as a verify-gate deliverable. The README + CHANGELOG updates are the project-mandated documentation hooks (`AGENTS.md` §5.4 + §5.5). Without the audit and the docs hooks, the slice is not shippable per the project's own conventions.

- **T-PR5-01** — **Fill `docs/qa/ui-redesign.md`: a header naming the tool used (`@axe-core/cli` + manual spot-checks per the design §Testing strategy), the per-pair contrast ratio table (light + dark columns, four pair rows: `--ui-fg` on `--ui-glass-bg`, `--ui-fg-muted` on `--ui-glass-bg`, `--ui-accent` on `--ui-glass-bg`, large heading on gradient substrate), the reduced-transparency re-audit table (the same pairs under `prefers-reduced-transparency: reduce`), and a `## Verdict` line declaring `PASS` only when every row is above threshold (4.5:1 normal text, 3:1 large text / UI). Mirror the file at `Documents-es/docs/qa/ui-redesign.md` in the same commit per `AGENTS.md` §13.3.**

  - **Path**: `docs/qa/ui-redesign.md` (modify), `Documents-es/docs/qa/ui-redesign.md` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: `audit.test.ts` (new) parses the markdown table and asserts every row's ratio is above the threshold for its category; `pnpm exec markdownlint docs/qa/ui-redesign.md`; the Spanish mirror exists at `Documents-es/docs/qa/ui-redesign.md` and is byte-for-byte the same content translated (prose) — verify with `diff <(head -1 docs/qa/ui-redesign.md) <(head -1 Documents-es/docs/qa/ui-redesign.md)` returning non-empty (they differ in language but the structure matches).
  - **Rollback**: revert the markdown + the mirror.

- **T-PR5-02** — **Create `tests/e2e/ui-redesign.spec.ts` (Playwright): scenarios — (a) `/` unauthed → 200 + 1 h1 + 3 feature cards + 2 CTAs with `Crear cuenta` for `es-AR`; (b) `/` authed → 302 → `/dashboard`; (c) `/dashboard` at `1280×800` shows `Topbar` + `Sidebar`, no `BottomTabBar`; (d) `/dashboard` at `375×812` shows `Topbar` + `BottomTabBar`, no `Sidebar`; (e) `prefers-reduced-transparency: reduce` removes `backdrop-filter` on `GlassCard`; (f) `prefers-reduced-motion: reduce` → `Spinner`/`Skeleton` have no `animation-name`; (g) theme toggle persists `localStorage['ui.theme']` across reload; (h) `NEXT_LOCALE=en` cookie + `Accept-Language: es-AR` → English copy; (i) skip link is the first focusable on `/`, `/dashboard`, `/this-does-not-exist`; (j) sidebar collapse round-trip (URL + `localStorage` + visual).**

  - **Path**: `tests/e2e/ui-redesign.spec.ts` (new)
  - **TDD state**: N/A (integration suite, e2e)
  - **Verify**: `pnpm exec playwright test tests/e2e/ui-redesign.spec.ts` — all 10 scenarios pass; the local server (`pnpm dev` or `pnpm build && pnpm start`) is required for the e2e run.
  - **Rollback**: `git rm tests/e2e/ui-redesign.spec.ts`.

- **T-PR5-03** — **Update `README.md` (English source) with a one-paragraph `## UI redesign (slice 1)` note covering: glassmorphism + gradient tokens, triple-state theme, EN/ES i18n via `next-intl`, Topbar + Sidebar (≥ `lg`) + BottomTabBar (< `lg`) nav shell, the marketing landing at `/` with 302-redirect for authed visitors, and the locked decision that `signin`/`register`/`balance-widget` are deferred to slices 2/3.**

  - **Path**: `README.md` (modify, +~12 lines)
  - **TDD state**: N/A (docs)
  - **Verify**: `pnpm exec markdownlint README.md`; the section heading `## UI redesign (slice 1)` is present (`grep -c '^## UI redesign (slice 1)' README.md` returns 1).
  - **Rollback**: revert the addition.

- **T-PR5-04** — **Update `Documents-es/README.md` (Spanish mirror) with a `## Rediseño de UI (rebanada 1)` section that is a faithful translation of T-PR5-03's prose (preserves REQ IDs, file paths, code blocks verbatim per `AGENTS.md` §13.4). Both files land in the same commit.**

  - **Path**: `Documents-es/README.md` (modify, +~12 lines)
  - **TDD state**: N/A (docs)
  - **Verify**: `pnpm exec markdownlint Documents-es/README.md`; the section heading is `## Rediseño de UI (rebanada 1)`; no Chinese characters anywhere in the file (drift check per `AGENTS.md` §3).
  - **Rollback**: revert the addition.

- **T-PR5-05** — **Update `CHANGELOG.md` `## [Unreleased]` section: add a `### Added` subsection listing the seven glass/gradient tokens, the `ThemeProvider` + `ThemeToggle` + `LanguageSwitcher` components, the navigation shell (`Topbar` + `Sidebar` + `BottomTabBar`), the `next-intl` i18n scaffold with EN/ES catalogs, the marketing landing at `/`, and the root `not-found.tsx` + `error.tsx`. Add a `### Changed` subsection listing the renamed dark-scope selector (`[data-theme='dark']` → `.dark`) and the `Spinner`/`Skeleton` motion-safe variant. No version bump yet (release flow is `develop` → `main` per `AGENTS.md` §5.5).**

  - **Path**: `CHANGELOG.md` (modify, +~10 lines under `## [Unreleased]`)
  - **TDD state**: N/A (docs)
  - **Verify**: `pnpm exec markdownlint CHANGELOG.md`; the `## [Unreleased]` section contains a `### Added` and a `### Changed` subsection; `package.json` version is unchanged (`grep '"version"' package.json` still reports `0.4.0`).
  - **Rollback**: revert the addition.

- **T-PR5-06** — **Test bundle: write `audit.test.ts` (parses `docs/qa/ui-redesign.md` table and asserts every row above threshold), `e2e-smoke.test.ts` (Vitest-friendly Playwright wrapper that imports `tests/e2e/ui-redesign.spec.ts` to keep CI coverage at 100% of the project's test surface), and a final `pnpm test:coverage:enforced` run.**
  - **Path**: `audit.test.ts` (new), `tests/e2e/e2e-smoke.test.ts` (new)
  - **TDD state**: RED → GREEN
  - **Verify**: `pnpm test:coverage:enforced` passes 80% on `app/_ui/`, `app/page.tsx`, `app/not-found.tsx`, `app/error.tsx`; `pnpm lint` clean; `pnpm typecheck` clean; `pnpm exec playwright test` clean.
  - **Rollback**: `git rm <test files>`.

## Cross-PR risks for the apply phase

The `sdd-apply` agent MUST mitigate these on its own; they are not addressed by the task list above because they cut across PRs.

- **R-apply-1 — Glass × dark-mode contrast slip (REQ-UI-21).** The 7 glass tokens (PR 2) are picked to give ≥ 12:1 contrast on dark, but a single ad-hoc `--ui-glass-bg` override in a future component (e.g. a card with custom alpha) can fall below 4.5:1. **Mitigation:** PR 5's `audit.test.ts` is the verify gate; any new component that introduces a text-on-glass pair MUST add a row to `docs/qa/ui-redesign.md` in the same PR.

- **R-apply-2 — `next/font` metric shift on `max-w-*` forms.** Replacing the CDN font (if any) with `next/font` Inter Variable causes a 1–3 px line-height shift on forms with `max-w-*`. **Mitigation:** PR 1 (T-PR1-06) wires fonts first so the chrome (PR 3) and the landing (PR 4) never see a mixed-font frame; `next/font` automatic `size-adjust` keeps the swap imperceptible; manual visual regression on `/auth/signin` (slice 2, but its inline form already uses Inter via the old CDN — confirm in PR 1 before slice 2 starts).

- **R-apply-3 — FOUC under JS-disabled or slow script execution.** The inline blocking script in `app/layout.tsx` (T-PR2-07) sets `<html class="dark">` before first paint. If the script is malformed (e.g. `try/catch` swallowed a TypeError), users on a `prefers-color-scheme: dark` machine see a light flash. **Mitigation:** T-PR2-13's `fouc-script.test.tsx` covers the three precedence cases; a Playwright e2e in PR 5 (T-PR5-02 scenario g) loads `/` with JavaScript disabled for one run and asserts the `<html class>` is set by the time the body starts rendering (inline script does not depend on JS execution completion for parsing).

- **R-apply-4 — i18n hydration mismatch.** The `x-locale` header is set by middleware (PR 1) and read by `getRequestConfig` (T-PR1-03) and the FOUC script (T-PR2-07). If a future PR introduces a second source of truth (e.g. a `useLocale()` call that reads a context instead of the header), the server and the client can disagree on the first paint. **Mitigation:** the FOUC script reads `localStorage` + `matchMedia` directly (no React context), and `getRequestConfig` reads the header — single source of truth per concern; PR 5's Playwright e2e (T-PR5-02 scenario h) asserts the first paint's `<title>` already shows the right locale.

- **R-apply-5 — Sidebar race on first load (URL ↔ `localStorage`).** Two sources of truth can disagree: `?sidebar=collapsed` in the URL and `localStorage['ui.sidebarCollapsed']` from a previous session. **Mitigation:** T-PR3-03 specifies URL wins on first load; subsequent updates go through `history.replaceState` + `localStorage.setItem` atomically (single render); a `storage` event listener syncs across tabs. The Playwright e2e in T-PR5-02 (scenario j) reloads 5 times after a collapse toggle and asserts URL + `localStorage` + visual state all agree.

- **R-apply-6 — `pnpm-lock.yaml` drift after `next-intl` is added (per `AGENTS.md` §5.3 lockfile policy).** The lockfile is a **deliverable**, not an intermediate. Re-running `pnpm install` MUST regenerate it deterministically; a missing or drifted lockfile breaks CI (`pnpm install --frozen-lockfile`). **Mitigation:** T-PR1-01 commits the regenerated `pnpm-lock.yaml` in the same change as the `package.json` edit; the pre-commit hook `.husky/pre-commit` → `scripts/check-lockfile.sh` (already present per `AGENTS.md` §5.3) will fail the commit if the lockfile diff is empty after `package.json` is staged. The macOS pnpm-workspace-hijack workaround (`pnpm install --ignore-workspace`, then `git checkout pnpm-lock.yaml` if the workspace's resolution drifts) applies only to the local dev environment — CI uses `--frozen-lockfile` and is unaffected.

## Acceptance for this task list

This task list is acceptable when:

- **(a) every REQ-UI-NN maps to at least one task** — see the cross-reference below.
- **(b) every new component from design §Component surface has a create-task + test-task pair** — `ThemeProvider` (T-PR2-06 + T-PR2-13), `ThemeToggle` (T-PR2-08 + T-PR2-13), `LanguageSwitcher` (T-PR3-05 + T-PR3-09), `SkipLink` (T-PR1-07 + T-PR1-11), `Topbar` (T-PR3-02 + T-PR3-09), `Sidebar` (T-PR3-03 + T-PR3-09), `BottomTabBar` (T-PR3-04 + T-PR3-09), `GlassCard` (T-PR3-01 + T-PR3-09).
- **(c) every PR's LoC estimate matches design §Sequence of changes within ±20%** — PR 1 ≈ +220/−3, PR 2 ≈ +200/−8, PR 3 ≈ +520/−5, PR 4 ≈ +260/−10, PR 5 ≈ +220/−0; design lists +220/−3, +200/−8, +520/−5, +260/−10, +220/−0. All within ±0 lines (the design was the source).
- **(d) verify commands are runnable** — every task lists a concrete `pnpm` script, a `git grep`/`grep`/`diff` command, a vitest-axe assertion, or a Playwright scenario. No task proposes a tool not in `package.json` (Playwright is flagged in T-PR5-02 as a devDep to add if not present per design §Testing strategy).

### REQ-UI-NN → task cross-reference

| REQ               | Tasks                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| REQ-UI-9 MODIFIED | T-PR2-02 (selector rename), T-PR2-13 (`tokens.test.ts` asserts `.dark` present)                                                    |
| REQ-UI-12         | T-PR4-01 (302), T-PR4-02 (hero), T-PR4-03 (3 cards), T-PR4-04 (2 CTAs), T-PR4-08 (test bundle)                                     |
| REQ-UI-13         | T-PR3-03 (Sidebar), T-PR3-04 (BottomTabBar), T-PR3-06 (AppShell matrix), T-PR3-09 (tests)                                          |
| REQ-UI-14         | T-PR2-06 (ThemeProvider), T-PR2-07 (FOUC script), T-PR2-08 (ThemeToggle), T-PR2-13 (cycle test)                                    |
| REQ-UI-15         | T-PR2-05 (CSS override), T-PR2-13 (glass-card-css test), T-PR3-01 (GlassCard)                                                      |
| REQ-UI-16         | T-PR2-04 (CSS override), T-PR2-10 (Spinner), T-PR2-11 (Skeleton), T-PR2-13 (reduced-motion test)                                   |
| REQ-UI-17         | T-PR1-02 (i18n.ts), T-PR1-03 (request.ts), T-PR1-04 (middleware), T-PR1-05 (catalogs), T-PR3-05 (Switcher), T-PR3-08 (chrome keys) |
| REQ-UI-18         | T-PR1-06 (next/font), T-PR1-11 (fonts test)                                                                                        |
| REQ-UI-19         | T-PR2-01 (7 tokens), T-PR2-02 (selector rename), T-PR2-13 (tokens diff test)                                                       |
| REQ-UI-20         | T-PR4-06 (not-found), T-PR4-07 (error), T-PR4-08 (tests)                                                                           |
| REQ-UI-21         | T-PR5-01 (audit file), T-PR5-06 (audit.test.ts), T-PR5-02 (Playwright e2e)                                                         |
| REQ-UI-22         | T-PR1-07 (SkipLink component), T-PR1-08 (mount in layout), T-PR1-11 (test), T-PR5-02 (Playwright Tab)                              |
| REQ-UI-24         | T-PR1-05 (empty catalogs with `getRequestConfig` fallback), T-PR1-11 (fallback test), T-PR5-02 (e2e on `/accounts`)                |
