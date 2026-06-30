# Apply progress — `ui-redesign` PR 1 (foundation)

**Branch**: `feat/ui-redesign-foundation` (worktree at `../gastos-personales-ui-redesign-pr1`)
**Base**: `develop` @ `35291da`
**PR scope**: T-PR1-01..T-PR1-11
**Strict TDD**: active (test runner `pnpm test`)
**Artifact store**: `openspec` (Engram unavailable per task spec)

This file is the per-task TDD evidence log for PR 1. Each row in the
**TDD Cycle Evidence** table corresponds to one RED → GREEN → TRIANGULATE
sequence (or to a N/A config task). The **Files changed per commit** and
**Test commands run** sections are appended in commit order.

## PR boundary

- **In scope**: i18n scaffold (next-intl + i18n.ts + request.ts + middleware + empty catalogs), `next/font/google` wiring, `<SkipLink>` creation + mount, `next.config.ts` plugin wrap, `docs/qa/ui-redesign.md` stub.
- **Out of scope**: T-PR2-01..T-PR2-13 (tokens, theme provider, FOUC, motion-safe variants); T-PR3-01..T-PR3-09 (chrome, AppShell, LanguageSwitcher); T-PR4-01..T-PR4-08 (landing, not-found, error); T-PR5-01..T-PR5-06 (audit + README + CHANGELOG + Playwright e2e).
- **Hard guards respected**: no push, no PR open, no `main` touch, no migration of `app/auth/signin/page.tsx` / `app/auth/register/page.tsx` / `app/accounts/[id]/balance-widget/`, no edits to the 14 pre-existing CSS color variables in `app/_ui/tokens.css`, no deps beyond `next-intl`.

## TDD Cycle Evidence

| Task     | Cycle           | Command                                                                      | Result                                                                                                                               |
| -------- | --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T-PR1-01 | N/A (config)    | `pnpm install --ignore-workspace`                                            | OK; `next-intl@4.13.1` resolved; `grep -c '^  next-intl@' pnpm-lock.yaml` >= 1                                                       |
| T-PR1-02 | N/A (config)    | `pnpm typecheck` + `node -e "import('./i18n.ts').then(m => console.log(m))"` | `i18n.ts` exports `locales=['en','es']`, `defaultLocale='en'`, `localePrefix='as-needed'`                                            |
| T-PR1-03 | RED             | `pnpm test src/i18n/__tests__/i18n-request.test.ts`                          | Test file asserts `getRequestConfig` returns messages for `x-locale: es`; FAILS (no `src/i18n/request.ts`)                           |
| T-PR1-03 | GREEN           | `pnpm test src/i18n/__tests__/i18n-request.test.ts`                          | PASSES after writing minimal `getRequestConfig` that reads `headers().get('x-locale')` and dynamic-imports `messages/${locale}.json` |
| T-PR1-03 | TRIANGULATE     | `pnpm test src/i18n/__tests__/i18n-request.test.ts`                          | Adds a second test case asserting `x-locale: en` falls through to `messages/en.json`; PASSES                                         |
| T-PR1-04 | RED             | `pnpm test middleware-headers.test.ts`                                       | Test asserts `middleware` injects `x-locale`/`x-pathname`; FAILS (no `middleware.ts`)                                                |
| T-PR1-04 | GREEN           | `pnpm test middleware-headers.test.ts`                                       | PASSES after writing minimal `middleware.ts` chaining `createMiddleware(routing)` + `NextResponse.next({ headers })`                 |
| T-PR1-04 | TRIANGULATE     | `pnpm test middleware-headers.test.ts`                                       | Adds cookie-wins case + `Accept-Language: ja` → `en`; PASSES                                                                         |
| T-PR1-06 | RED             | `pnpm test app/_ui/fonts.test.tsx`                                           | Asserts no Google Fonts CDN link, asserts `--font-inter` non-empty; FAILS (no layout wiring)                                         |
| T-PR1-06 | GREEN           | `pnpm test app/_ui/fonts.test.tsx`                                           | PASSES after wiring `next/font/google` + CSS variables on `<html>` + theme inline mapping                                            |
| T-PR1-06 | TRIANGULATE     | `pnpm test app/_ui/fonts.test.tsx`                                           | Adds assertion that `--font-jb-mono` non-empty + `font-mono` utility maps to it; PASSES                                              |
| T-PR1-07 | RED             | `pnpm test app/_ui/layout/skip-link.test.tsx`                                | Asserts SkipLink renders with `href="#main-content"`; FAILS (no file)                                                                |
| T-PR1-07 | GREEN           | `pnpm test app/_ui/layout/skip-link.test.tsx`                                | PASSES after writing minimal `<a>` server component with sr-only/focus:not-sr-only classes                                           |
| T-PR1-08 | RED             | `pnpm test app/_ui/layout/skip-link.test.tsx`                                | Asserts `app/layout.tsx` mounts `<SkipLink>` as first body child; FAILS                                                              |
| T-PR1-08 | GREEN           | `pnpm test app/_ui/layout/skip-link.test.tsx`                                | PASSES after importing + mounting `<SkipLink>` first in body                                                                         |
| T-PR1-09 | N/A (build cfg) | `pnpm build`                                                                 | `next-intl` plugin initialized; build succeeds                                                                                       |
| T-PR1-10 | RED             | `pnpm test docs/qa/audit.test.ts`                                            | Asserts `docs/qa/ui-redesign.md` exists with table header; FAILS                                                                     |
| T-PR1-10 | GREEN           | `pnpm test docs/qa/audit.test.ts`                                            | PASSES after creating stub file                                                                                                      |
| T-PR1-11 | TRIANGULATE     | `pnpm test`                                                                  | Full test suite passes; all new test files included                                                                                  |

## Files changed per commit

(Filled in during execution.)

## Test commands run

(Filled in during execution.)

## Remaining unchecked tasks

(Filled in during execution.)
