#!/usr/bin/env bash
# scripts/judgment-day-commits.sh
#
# Judgment Day commit plan — 17 atomic commits, one per concern.
# Generated from the Round 1 + Round 2 + mini-fix reports.
# Run from the repo root: `bash scripts/judgment-day-commits.sh`
#
# ⚠️  Limitation: this script does file-level `git add`, not hunk-level
#     (`git add -p`). Some files are touched by multiple commits in the
#     plan; the script will WARN and let you choose. For true hunk-level
#     atomicity, run `git add -p` manually and use this script only for
#     the commit messages and order.
#
# Interaction per commit:
#   y  → apply (stage + commit)
#   n  → skip
#   s  → show staged diff
#   q  → quit

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Sanity: clean tree before we start
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: working tree is dirty. Commit or stash before running."
  git status --short
  exit 1
fi

# Sanity: we should be on develop
branch=$(git branch --show-current)
if [[ "$branch" != "develop" ]]; then
  echo "WARNING: you are on '$branch', not 'develop'. Continue? (y/n)"
  read -r ans
  [[ "$ans" == "y" ]] || exit 0
fi

total=17
applied=0
skipped=0

# Helper: try to stage a file if it has unstaged changes
try_add() {
  local f="$1"
  if [[ ! -e "$f" ]]; then
    echo "  ⚠️  $f does not exist on disk"
    return 1
  fi
  if git diff --quiet -- "$f" && git diff --cached --quiet -- "$f"; then
    # No changes at all
    return 2
  fi
  if ! git diff --quiet -- "$f"; then
    # Has unstaged changes
    git add -- "$f"
    return 0
  fi
  # All changes are already staged
  return 0
}

# Helper: show file status
status_of() {
  local f="$1"
  if [[ ! -e "$f" ]]; then
    echo "missing"
  elif git diff --cached --quiet -- "$f" && ! git diff --quiet -- "$f"; then
    echo "modified-unstaged"
  elif ! git diff --cached --quiet -- "$f" && git diff --quiet -- "$f"; then
    echo "modified-staged"
  elif ! git diff --cached --quiet -- "$f" && ! git diff --quiet -- "$f"; then
    echo "modified-partial"
  else
    echo "unchanged"
  fi
}

# Helper: prompt for a commit
do_commit() {
  local n="$1"
  local type="$2"
  local scope="$3"
  local subject="$4"
  local body="$5"
  shift 5
  local files=("$@")

  echo
  echo "═════════════════════════════════════════════════════════════"
  printf "  Commit %d/%d\n" "$n" "$total"
  printf "  %s(%s): %s\n" "$type" "$scope" "$subject"
  echo "═════════════════════════════════════════════════════════════"
  if [[ -n "$body" ]]; then
    echo "  Body:"
    echo "$body" | sed 's/^/    /'
    echo
  fi
  echo "  Files:"
  for f in "${files[@]}"; do
    s=$(status_of "$f")
    case "$s" in
    modified-staged) mark="✓ staged" ;;
    modified-unstaged) mark="○ unstaged" ;;
    modified-partial) mark="◐ partial" ;;
    unchanged) mark="— unchanged" ;;
    missing) mark="✗ MISSING" ;;
    *) mark="? $s" ;;
    esac
    printf "    %s  %s\n" "$mark" "$f"
  done
  echo
  echo "  [y] apply   [n] skip   [s] show diff   [q] quit"
  read -r -p "  > " ans
  case "$ans" in
  q | Q)
    echo "  → quitting at commit $n"
    exit 0
    ;;
  n | N)
    echo "  → skipped"
    skipped=$((skipped + 1))
    return 0
    ;;
  s | S)
    git diff --cached
    do_commit "$n" "$type" "$scope" "$subject" "$body" "${files[@]}"
    return
    ;;
  esac

  # Stage each file (best effort)
  for f in "${files[@]}"; do
    if try_add "$f"; then
      :
    fi
  done

  # Final confirmation — show staged summary
  echo
  echo "  Staged for this commit:"
  git diff --cached --stat
  echo
  read -r -p "  Commit now? (y/n) " final
  if [[ "$final" != "y" ]]; then
    git reset HEAD -- . >/dev/null
    echo "  → aborted, staged reset"
    return 0
  fi

  if [[ -n "$body" ]]; then
    git commit -m "$type($scope): $subject" -m "$body"
  else
    git commit -m "$type($scope): $subject"
  fi
  applied=$((applied + 1))
  echo "  → committed"
}

# ──────────────────────────────────────────────────────────────
# 1. F-01: Hono route paths missing /api prefix
# ──────────────────────────────────────────────────────────────
do_commit 1 fix api \
  "route /health, /me, /auth/register under /api/* prefix" \
  "Production catch-all is /api/[...path]. Hono only sees /api/* URLs, so the
unprefixed routes 404'd in production for /api/health, /api/me, /api/auth/register.

Verified by app.test.ts which now asserts the new paths and locks in
authjsAuthSpy.not.toHaveBeenCalled() for the liveness probe (F-03)." \
  src/modules/api/app.ts \
  src/modules/api/app.test.ts

# ──────────────────────────────────────────────────────────────
# 2. F-02: Upstash reset is a Unix timestamp, not a duration
# ──────────────────────────────────────────────────────────────
do_commit 2 fix rate-limit \
  "compute Retry-After as delta-seconds from Upstash reset timestamp" \
  "Upstash Ratelimit's reset field is a Unix timestamp in milliseconds. The
previous handler did err.resetMs / 1000 which yields the current year in
seconds (~1.7B). Retry-After is now (resetMs - Date.now()) / 1000, clamped
to [1, 3600] for orchestrator-friendly bounds.

Test now uses Date.now() + 30_000 (realistic timestamp) and asserts
Retry-After is in [29, 31]." \
  src/shared/http/error-handler.ts \
  src/modules/api/app.test.ts

# ──────────────────────────────────────────────────────────────
# 3. F-03 + F-04: authMiddleware scope + per-deployment rate-limit id
# ──────────────────────────────────────────────────────────────
do_commit 3 fix api \
  "scope authMiddleware to /api/* and add Host suffix to rate-limit id" \
  "Liveness probe (F-03) no longer triggers a Session DB lookup. authMiddleware
is now app.use('/api/*', ...) AFTER the public routes, so /api/health,
/api/readyz, /api/auth/register bypass the session lookup.

Rate-limit identifier (F-04) is now <prefix>:<ip-or-anonymous>:<host>. The
host suffix prevents the shared-bucket DoS surface when proxy headers are
missing." \
  src/modules/api/app.ts \
  src/shared/rate-limit/rate-limit.ts \
  src/modules/api/app.test.ts

# ──────────────────────────────────────────────────────────────
# 4. F-05: fxRateProvider is the real seam
# ──────────────────────────────────────────────────────────────
do_commit 4 refactor api \
  "make fxRateProvider the real seam in createHonoApp" \
  "Previously HonoAppDeps declared fxRateProvider but createHonoApp did not
read it — the field was dead surface. createHonoApp now builds AccountService
from deps.fxRateProvider when deps.accountService is not supplied. Test
mocks that inject accountService directly still work via the ?? short-circuit.

server-hono.ts no longer duplicates the AccountRepositoryPrisma / AccountService
construction." \
  src/modules/api/app.ts \
  src/lib/server-hono.ts \
  src/modules/api/app.accounts.test.ts \
  src/modules/api/app.deps.test.ts \
  src/modules/accounts/index.test.ts

# ──────────────────────────────────────────────────────────────
# 5. F-06: collapse duplicate register calls in tests
# ──────────────────────────────────────────────────────────────
do_commit 5 test auth \
  "collapse duplicate register calls to assert single-hash timing" \
  "BR-AUTH-4 timing equalization requires the duplicate-email path to hash
exactly one throwaway string. The old test pattern invoked svc.register twice
(double the hash count). The new pattern is one try/catch with
toHaveBeenCalledTimes(1) on the hash spy. WEAK_PASSWORD now correctly
asserts the hash was never called (password check happens first)." \
  src/modules/auth/domain/services/auth.service.test.ts \
  src/modules/auth/application/actions/register.action.test.ts

# ──────────────────────────────────────────────────────────────
# 6. readyz action (new) with timer cleanup
# ──────────────────────────────────────────────────────────────
do_commit 6 feat readyz \
  "add /api/readyz action with DB probe and 1s timeout" \
  "Race a prisma.\$queryRaw against a 1s setTimeout. Returns 200 {status: ok,
db: ok} on success, 503 {code: DB_DOWN} on timeout or DB error. The
setTimeout is cleared in finally to prevent timer leak under frequent probes.

Untracked files: src/modules/auth/application/actions/readyz.action.ts
and its companion test." \
  src/modules/auth/application/actions/readyz.action.ts \
  src/modules/auth/application/actions/readyz.action.test.ts

# ──────────────────────────────────────────────────────────────
# 7. F-08: log AppError.cause
# ──────────────────────────────────────────────────────────────
do_commit 7 fix observability \
  "log AppError.cause without leaking to HTTP response" \
  "When the central error handler logs an AppError, the cause chain is now
included as { name, message, stack } (or the raw value for non-Error causes).
The cause is NEVER echoed in the HTTP response body.

New test asserts the response body does NOT contain the cause's message." \
  src/shared/http/error-handler.ts \
  src/shared/http/error-handler.test.ts

# ──────────────────────────────────────────────────────────────
# 8. F-19: dead Sentry.captureConsoleIntegration no-op
# ──────────────────────────────────────────────────────────────
do_commit 8 fix observability \
  "remove dead Sentry.captureConsoleIntegration no-op" \
  "The optional-chain call was a silent no-op (the API does not exist on
@sentry/nextjs v10). Console capture, if needed, is configured at SDK init
in sentry.server.config.ts." \
  instrumentation.ts

# ──────────────────────────────────────────────────────────────
# 9. F-15 + F-20: status code union tightening
# ──────────────────────────────────────────────────────────────
do_commit 9 refactor http \
  "tighten AppErrorStatusCode union and getAccountBalance cast" \
  "ErrorStatus-backed union AppErrorStatusCode = 400 | 401 | 403 | 404 | 409
| 429 | 500 | 502 | 503 is the compile-time gate for the response cast. The
getAccountBalance route cast drops the unreachable 500 arm (the action
re-throws, never returns 500 through c.json)." \
  src/shared/http/error-handler.ts \
  src/modules/api/app.ts

# ──────────────────────────────────────────────────────────────
# 10. F-09 + F-12 + F-13: accounts cleanup
# ──────────────────────────────────────────────────────────────
do_commit 10 refactor accounts \
  "stop exporting infra from domain barrel and unify list/count filter" \
  "accounts/index.ts no longer re-exports AccountRepositoryPrisma,
FxRateProviderUnconfigured, or FxRateProviderStub. The Ports & Adapters rule
is now respected at the barrel boundary.

AccountService.count accepts the same ListAccountsOptions shape as list. The
action builds the filter once and passes it to both. A count failure is now
isolated: the list is returned with total=undefined instead of failing the
whole view (list-accounts.action.ts:60-72)." \
  src/modules/accounts/index.ts \
  src/modules/accounts/domain/services/account.service.ts \
  src/modules/accounts/application/actions/list-accounts.action.ts \
  src/modules/accounts/application/actions/list-accounts.action.test.ts \
  src/modules/accounts/index.test.ts \
  src/modules/api/app.ts \
  src/lib/server-hono.ts \
  src/modules/api/app.accounts.test.ts \
  src/modules/api/app.deps.test.ts

# ──────────────────────────────────────────────────────────────
# 11. F-11: drop redundant c.set in requireSession
# ──────────────────────────────────────────────────────────────
do_commit 11 refactor api \
  "drop redundant c.set in requireSession" \
  "The Variables: { user: AuthUser } generic on createMiddleware already
carries the narrowed type to downstream handlers. The c.set('user', user)
line after the runtime guard was a no-op." \
  src/modules/api/middlewares/require-session.ts

# ──────────────────────────────────────────────────────────────
# 12. N-1: remove new Date() defaults from value objects
# ──────────────────────────────────────────────────────────────
do_commit 12 refactor domain \
  "remove new Date() defaults from value objects" \
  "OpeningBalance.historical(date, amountMinor) and Session.isSessionActive
(expires) no longer default now to new Date(). Both now require an explicit
clock. OpeningBalance.historical takes a Clock and uses clock.now(). Test
files updated to pass a fixedClock for determinism.

The system-clock.ts:4-5 claim that the production systemClock is the ONLY
place new Date() leaks is now true for the domain layer." \
  src/modules/accounts/domain/value-objects/opening-balance.ts \
  src/modules/auth/domain/entities/session.ts \
  src/modules/accounts/domain/services/account.service.ts \
  src/modules/auth/domain/services/auth.service.ts \
  src/modules/api/app.ts \
  src/lib/server-hono.ts

# ──────────────────────────────────────────────────────────────
# 13. F-14: consolidate Prisma delegate interfaces
# ──────────────────────────────────────────────────────────────
do_commit 13 refactor db \
  "consolidate Prisma delegate interfaces in shared prisma-types" \
  "New src/shared/db/prisma-types.ts is the single source of truth for
PrismaUserDelegate, PrismaFinancialAccountDelegate, and the asPrismaDelegateView
helper. Inline duplicates in account.repository.prisma.ts,
account.repository.prisma.test.ts, and user.repository.ts are removed.

The narrow view remains any-typed (documented in prisma-types.ts:8-17) — a
deliberate trade-off, not a limitation. The structural cast in
asPrismaDelegateView works for both production PrismaClient and test fakes." \
  src/shared/db/prisma-types.ts \
  src/modules/accounts/infrastructure/repositories/account.repository.prisma.ts \
  src/modules/auth/infrastructure/repositories/user.repository.ts \
  src/modules/accounts/infrastructure/repositories/account.repository.prisma.test.ts

# ──────────────────────────────────────────────────────────────
# 14. N-3: test the structural cast
# ──────────────────────────────────────────────────────────────
do_commit 14 test db \
  "cover asPrismaDelegateView structural cast" \
  "Three tests pin the safety-critical cast: a minimal mock, a missing-field
mock (compile-time @ts-expect-error), and a wider PrismaClient-shaped mock
(downward cast accepted)." \
  src/shared/db/prisma-types.test.ts

# ──────────────────────────────────────────────────────────────
# 15. F-16: drop dead test code
# ──────────────────────────────────────────────────────────────
do_commit 15 test accounts \
  "drop dead fixtures and tautological assertions" \
  "app.test.ts honoApp.request is function replaced with a real smoke test
(200 with { data: { status: 'ok' } }). app.deps.test.ts void defaultSvc
extraction removed. account.service.test.ts unused resultToReturn and
FX_UNAVAILABLE's redundant details/cause: undefined removed." \
  src/modules/api/app.test.ts \
  src/modules/api/app.deps.test.ts \
  src/modules/accounts/domain/services/account.service.test.ts

# ──────────────────────────────────────────────────────────────
# 16. F-10: ADR-0007 EN/ES mirror sync
# ──────────────────────────────────────────────────────────────
do_commit 16 docs adr \
  "sync algorithm description in ADR-0007 mirror" \
  "The Spanish 'Notas de implementación' section previously described the
old fs.cp revert algorithm. Now mirrors the English section: mv + cp -R
+ rm .tmp shell-out (reverted fs.cp/fs.rm), with the 2026-06-19
FileProvider incident narrative." \
  docs/adr/0007-obsidian-mirror.md \
  Documents-es/docs/adr/0007-obsidian-mirror.md

# ──────────────────────────────────────────────────────────────
# 17. New untracked files: Clock port + AuthUser type seam
# ──────────────────────────────────────────────────────────────
do_commit 17 feat shared \
  "add Clock port and AuthUser type seam" \
  "src/shared/clock/{clock.port.ts, system-clock.ts} — the Clock port and
the production systemClock implementation. systemClock is the only place
new Date() is allowed to leak in the domain layer.

src/modules/api/middlewares/variables.ts — the AuthUser interface extracted
to a types-only seam to avoid the circular import between authMiddleware
and requireSession." \
  src/shared/clock/clock.port.ts \
  src/shared/clock/system-clock.ts \
  src/modules/api/middlewares/variables.ts

# ──────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────
echo
echo "═════════════════════════════════════════════════════════════"
echo "  Judgment Day commit plan complete"
echo "    Applied: $applied"
echo "    Skipped: $skipped"
echo "═════════════════════════════════════════════════════════════"
echo
echo "Next steps:"
echo "  1. git log --oneline -17  # review the commits"
echo "  2. pnpm test              # confirm tests still pass"
echo "  3. git push -u origin develop  # push to remote (when ready)"
echo "  4. gh pr create --base develop  # if you want a PR (you said no auto-PR)"
echo
