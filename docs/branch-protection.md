# Branch protection rules for `develop` and `main`

> **DELTA-C3.2 of auth-foundation-slice-c (T-029).** This document
> describes the branch-protection rules the maintainer applies
> manually to `develop` (and to `main` once releases start) on
> GitHub. The rules cannot be set from a PR — they require
> repo-admin permissions.

## Rules

The following rules are applied to `develop` (and to `main`):

| Rule                                                | Value      | Reason                                                                                            |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Require a pull request before merging               | ✅ on      | Every change goes through a PR; no direct pushes.                                                 |
| Require approvals                                   | 1          | At least one review from the maintainer (or a delegated reviewer).                                |
| Dismiss stale pull request approvals on new commits | ✅ on      | A new commit invalidates the prior review.                                                        |
| Require status checks to pass before merging        | ✅ on      | See "Required checks" below.                                                                      |
| Require branches to be up to date before merging    | ✅ on      | The PR branch must be a fast-forward of `develop` at merge time.                                  |
| Require linear history                              | ✅ on      | Squash-merge keeps the history clean (AGENTS.md §5.2).                                            |
| Require commit signatures                           | ❌ off     | Not enforced at the platform level; verified in CI by the husky pre-commit gate (AGENTS.md §5.3). |
| Allow force pushes                                  | ❌ off     | No force-pushes (AGENTS.md §5.6).                                                                 |
| Allow deletions                                     | ❌ off     | `develop` and `main` are immutable.                                                               |
| Restrict who can push to matching branches          | maintainer | Only the maintainer can push.                                                                     |

## Required checks

The following CI checks must be green on the PR before merge:

| Check                       | Source                                    | Reason                                                                            |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `lint` (lint + typecheck)   | `.github/workflows/ci.yml` `lint` job     | ESLint + `tsc --noEmit` clean.                                                    |
| `test` (unit + integration) | `.github/workflows/ci.yml` `test` job     | 134+/134 tests verde; coverage on `src/modules/auth/**` ≥ 80% (where measurable). |
| `build` (next build)        | `.github/workflows/ci.yml` `build` job    | `pnpm run build` exits 0.                                                         |
| `security`                  | `.github/workflows/ci.yml` `security` job | All 6 security tests pass.                                                        |

A PR cannot be merged unless all 4 checks are green on the latest
commit of the PR branch.

## How to apply these rules

The maintainer applies these rules manually on GitHub:

1. Navigate to **Settings → Branches → Add branch protection rule**.
2. Branch name pattern: `develop` (and later, `main`).
3. Enable the rules per the table above.
4. Under "Require status checks to pass before merging", search
   for and add: `lint`, `test`, `build`, `security`.
5. Click **Save changes**.

## How to verify

After applying the rules, open a test PR that violates one of the
rules (e.g. a commit with `git commit --no-verify` that fails the
test job). The PR should be blocked at the merge button with a
message listing the failed check.

## Exceptions

- **Hotfix flow**: if a critical bug needs to bypass the review
  requirement, the maintainer can use GitHub's "bypass branch
  protection" privilege. This should be rare and documented in the
  commit message of the hotfix.
