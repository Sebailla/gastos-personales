# Tailwind v4 Content-Scanner Hazards

> Why this page exists. The PR #113 incident (2026-07-01) was caused
> by a single JSDoc comment containing the shorthand
> `bg-ui-glass-{1,2}` + `backdrop-blur-[var(--ui-glass-blur-{sm,lg})]`
> in `app/_ui/primitives/glass-card.test.tsx`. Tailwind v4's content
> scanner extracted those brace-expansion tokens as if they were real
> classes, emitted them into the generated CSS, and PostCSS crashed
> with `Unexpected token CurlyBracketBlock` at build time — leaving
> `/es` returning HTTP 500 in dev mode.
>
> PR #113 fixed the immediate symptom. PR #115 added this page + the
> `pnpm run check:tailwind-scanner` guard to prevent recurrence.

## The Hazard

Tailwind v4 uses a **content scanner** to find utility classes in your
source files. It greps `.ts`, `.tsx`, `.md`, `.mdx` (and other text
formats) for tokens that _look like_ utility classes — anything that
matches `[a-z]+(-[a-z]+)*` patterns.

The scanner **does not parse your code as code**. It treats string
literals, JSDoc comments, regex patterns, and prose alike. Anything
that _looks_ like a class is extracted.

The hazard: **brace-expansion notation**. Tailwind v4 does NOT
support `{a,b}` braces in class names (that was a v3 feature that was
removed in v4). But the content scanner does not know that, and will:

1. Find the literal text `bg-ui-glass-{1,2}` in your source.
2. Emit a CSS rule with that selector into the generated stylesheet.
3. PostCSS tries to parse `{1,2}` as a CSS value.
4. PostCSS fails: `Unexpected token CurlyBracketBlock`.

The build still completes (warning, not error) and the affected route
returns HTTP 500.

## The Rule

**Never write brace-expansion utility-class tokens in source files.**

Use prose or two literal class names instead:

```diff
-`bg-ui-glass-{1,2}` + `backdrop-blur-[var(--ui-glass-blur-{sm,lg})]`
+`bg-ui-glass-1` (or `bg-ui-glass-2`) +
+`backdrop-blur-[var(--ui-glass-blur-sm)]` (or `-[lg]`)
```

Applies to: JSDoc comments, prose documentation, regex literals that
document the pattern (avoid these too), Markdown docs, anywhere a
utility-class-shaped token can be mistaken for a real class.

## The Guard

`scripts/check-tailwind-content-scanner.ts` greps the codebase for
the hazard pattern and fails CI / pre-commit on any match outside the
allowlist fixture.

Run it locally:

```bash
pnpm run check:tailwind-scanner
```

It is wired into:

- **Pre-commit** (`.husky/pre-commit`): runs after `lint-staged` + `gga run`. Catches hazards before they reach a commit.
- **CI lint job** (`.github/workflows/ci.yml`): runs in parallel with
  ESLint. Catches hazards that slipped past pre-commit (e.g.
  `--no-verify` push, branch protection bypass).

Exit codes:

- `0` — no hazards found.
- `1` — one or more hazards found (with file:line:match list on stderr).
- `2` — unexpected failure (full stack trace on stderr).

## Allowlist

Some hazards are intentional:

- **Regex literals in tests** that document the absence of a class,
  e.g. `expect(classAttr).not.toMatch(/bg-ui-glass-{1,2}/)`.
- **Code comments** that document the Tailwind scanner's behaviour for
  future contributors.
- **Design system token descriptions** in `app/_ui/README.md` that
  use brace notation to enumerate variants (the actual classes are
  written as literals everywhere they are used).
- **Historical branch / file-name descriptions** in `docs/archive`
  that document shipped SDD changes; those files are not in
  Tailwind's active content scan path for the current build.

Add intentional hazards to
`scripts/__fixtures__/tailwind-scanner-allowlist.txt` with a
justification comment:

```
# bg-ui-glass-{1,2} appears in `not.toMatch` regex in
# app/_ui/primitives/glass-card.test.tsx:52; intentional.
bg-ui-glass-{1,2}
```

## Adding a new allowlist entry

1. Run `pnpm run check:tailwind-scanner` to see the violation.
2. Confirm the match is a false positive (a description, a regex
   literal, a doc-comment example) — **not** a real CSS class.
3. Add the exact match string to the allowlist fixture with a one-line
   comment explaining why it is intentional.
4. Re-run `pnpm run check:tailwind-scanner` to confirm the violation
   is gone.

If the match is a real CSS class, **fix the code** instead — rewrite
the class as a literal name.

## Related

- PR #113 — `fix(tests): escape Tailwind scanner from glass-card.test.tsx JSDoc` (the original incident).
- PR #114 — `chore(next): align next-env.d.ts reference path with next 16.2.9` (sibling cleanup).
- PR #115 — `chore(build): add tailwind content-scanner guard` (this page + the script).
