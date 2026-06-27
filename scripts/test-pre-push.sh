#!/usr/bin/env bash
# test-pre-push.sh
#
# Tests for the pre-push hook branch-delete detection bug fix.
# Runs the .husky/pre-push script directly with simulated git
# hook args and stdin to validate:
#   - All-delete pushes pass through without checks
#   - Normal pushes on feat/* branches validate branch name
#   - Normal pushes on develop are rejected (not in allowed prefixes)
#   - Pushes to main are rejected (protected)
#
# Uses two test seams exposed by the hook:
#   MOCK_CURRENT_BRANCH — overrides the branch-name read so we
#     can exercise the branch-name validation paths without
#     switching worktrees mid-test.
#   MOCK_SKIP_COVERAGE — short-circuits the coverage gate so the
#     tests run in seconds, not minutes.
#
# Run from the repo root:
#   bash scripts/test-pre-push.sh

set -u

cd "$(git rev-parse --show-toplevel)"

PASS=0
FAIL=0

run_hook() {
  local label="$1"
  local mock_branch="$2"
  local mock_skip_coverage="$3"
  local expected_exit="$4"
  local expected_stdout="$5"
  local stdin_content="$6"
  shift 6
  local args=("$@")

  local actual_exit
  local actual_stdout
  actual_stdout=$(printf '%s' "$stdin_content" \
    | MOCK_CURRENT_BRANCH="$mock_branch" \
      MOCK_SKIP_COVERAGE="$mock_skip_coverage" \
      bash .husky/pre-push "${args[@]}" 2>&1)
  actual_exit=$?

  if [ "$actual_exit" -eq "$expected_exit" ]; then
    if [ -z "$expected_stdout" ] || printf '%s' "$actual_stdout" | grep -qF "$expected_stdout"; then
      PASS=$((PASS + 1))
      echo "  PASS: $label (exit=$actual_exit)"
    else
      FAIL=$((FAIL + 1))
      echo "  FAIL: $label"
      echo "    expected stdout to contain: $expected_stdout"
      echo "    actual stdout: $actual_stdout"
    fi
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $label"
    echo "    expected exit: $expected_exit"
    echo "    actual exit:   $actual_exit"
    echo "    stdout: $actual_stdout"
  fi
}

echo "=== Pre-push hook tests ==="

REMOTE_ARGS=("origin" "git@github.com:user/repo.git")
ZERO_SHA="0000000000000000000000000000000000000000"

# --- all-delete cases (must short-circuit, no branch check) ---

# 1. Single delete.
run_hook \
  "all-delete: single refspec with remote_sha=0" \
  "" "" \
  0 "" \
  "refs/heads/feat/x abc123 refs/heads/feat/x $ZERO_SHA" \
  "${REMOTE_ARGS[@]}"

# 2. Multiple deletes.
run_hook \
  "all-delete: multiple refspecs all with remote_sha=0" \
  "" "" \
  0 "" \
  $'refs/heads/feat/a sha1 refs/heads/feat/a '"$ZERO_SHA"$'\nrefs/heads/fix/b sha2 refs/heads/fix/b '"$ZERO_SHA" \
  "${REMOTE_ARGS[@]}"

# --- branch-name validation paths (use MOCK_CURRENT_BRANCH) ---

# 3. Bug fix verification: delete FROM develop. Pre-fix, this
#    was rejected with "branch name 'develop' does not match".
#    Post-fix, all-deletes short-circuit BEFORE branch check.
run_hook \
  "delete from develop (bug fix)" \
  "develop" "" \
  0 "" \
  "refs/heads/feat/x abc123 refs/heads/feat/x $ZERO_SHA" \
  "${REMOTE_ARGS[@]}"

# 4. Mixed push (one delete + one update) — runs branch check.
#    Branch is feat/*, coverage skipped. Expected: branch check
#    passes (exit 0 from the script if coverage also passes — but
#    coverage is mocked to skip, so exit 0).
run_hook \
  "mixed push on feat/* — branch OK, coverage skipped" \
  "feat/anything" "1" \
  0 "" \
  $'refs/heads/feat/x sha1 refs/heads/feat/x '"$ZERO_SHA"$'\nrefs/heads/feat/y sha2 refs/heads/feat/y sha3' \
  "${REMOTE_ARGS[@]}"

# 5. Normal push on develop — branch-name check REJECTS.
run_hook \
  "update push from develop — rejected (no feat/ prefix)" \
  "develop" "" \
  1 "does not match the convention" \
  "refs/heads/develop abc123 refs/heads/develop def456" \
  "${REMOTE_ARGS[@]}"

# 6. Push to main — protected branch REJECTS (branch check fires
#    BEFORE the prefix check; main is in `protected_branches`).
run_hook \
  "update push from main — rejected (protected)" \
  "main" "" \
  1 "is a protected branch" \
  "refs/heads/main abc123 refs/heads/main def456" \
  "${REMOTE_ARGS[@]}"

# 7. Normal push on feat/* with coverage mocked-skipped — passes
#    all checks (exit 0).
run_hook \
  "update push on feat/* — passes" \
  "feat/auth-foundation" "1" \
  0 "" \
  "refs/heads/feat/auth-foundation abc123 refs/heads/feat/auth-foundation def456" \
  "${REMOTE_ARGS[@]}"

# 8. Empty stdin (no refspecs). Git can call pre-push with no
#    stdin in some corner cases. The hook treats this as "not
#    all deletes" and proceeds to branch-name validation.
run_hook \
  "empty stdin — proceeds to branch check" \
  "develop" "" \
  1 "does not match the convention" \
  "" \
  "${REMOTE_ARGS[@]}"

# 9. Whitespace-only stdin — same as empty.
run_hook \
  "whitespace-only stdin — proceeds to branch check" \
  "develop" "" \
  1 "does not match the convention" \
  $'\n  \n' \
  "${REMOTE_ARGS[@]}"

# 10. The original bug: pre-fix, the script matched `--delete` in $@
#     (which git never passes — only `<remote> <url>`), so
#     `git push origin --delete <branch>` was rejected with
#     "branch name 'develop' does not match the convention"
#     when run from a worktree on develop. Post-fix, the script
#     reads STDIN (where git writes refspecs with `remote_sha`
#     == 40 zeros for deletes), so even with `--delete` in $@
#     AND an empty STDIN (corner case), the delete path
#     short-circuits BEFORE the branch check.
#
#     This test pins the regression: if a future refactor
#     accidentally re-introduces the `$@` match, this case
#     fails because the script falls through to the branch
#     check (which then rejects "develop").
run_hook \
  "delete with --delete flag in \$@ (regression guard) — exit 0" \
  "develop" "" \
  0 "" \
  "refs/heads/feat/x abc123 refs/heads/feat/x $ZERO_SHA" \
  "origin" "git@github.com:user/repo.git" "--delete"

echo
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
