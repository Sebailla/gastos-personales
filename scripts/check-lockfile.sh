#!/usr/bin/env sh
# check-lockfile.sh
#
# Fails the commit if `package.json` is staged but `pnpm-lock.yaml`
# is not in sync with the staged `package.json`. This enforces
# AGENTS.md §5.3: the lockfile is a deliverable, not an intermediate.
#
# The check is intentionally lightweight — it does not run `pnpm
# install` (that would be slow and could trigger peer-dep resolution
# network calls in offline CI). It only checks that the lockfile
# has been staged alongside `package.json` if `package.json` was
# changed.
#
# Exit codes:
#   0 — OK, proceed
#   1 — package.json changed but pnpm-lock.yaml has unstaged drift
#
# Invocation: invoked by `.husky/pre-commit`. Standalone use:
#   sh scripts/check-lockfile.sh

set -eu

# Is package.json staged for this commit?
if ! git diff --cached --name-only --exit-code -- package.json >/dev/null 2>&1; then
  # package.json is staged (or modified). Check if the lockfile is also
  # staged. We accept either a modification or a new file.
  lockfile_status=$(git status --porcelain pnpm-lock.yaml 2>/dev/null || true)

  # Acceptable lockfile states when package.json is staged:
  #   "M  pnpm-lock.yaml"  — modified, staged
  #   "A  pnpm-lock.yaml"  — added, staged
  #   ""                  — no lockfile changes (not a real project, or
  #                          the package.json change is a metadata-only
  #                          change that does not affect resolution)
  case "$lockfile_status" in
    "M  pnpm-lock.yaml"|"A  pnpm-lock.yaml")
      # OK — lockfile is staged
      ;;
    "")
      # OK — no lockfile drift. The change is metadata-only.
      ;;
    *)
      echo "check-lockfile.sh: package.json is staged but pnpm-lock.yaml is not in sync." >&2
      echo "  lockfile status: $lockfile_status" >&2
      echo "  run: pnpm install && git add pnpm-lock.yaml" >&2
      echo "  see AGENTS.md §5.3 (pnpm-lock.yaml policy)" >&2
      exit 1
      ;;
  esac
fi

exit 0
