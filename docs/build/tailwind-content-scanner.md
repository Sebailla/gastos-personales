# Tailwind v4 Content-Scanner Hazards

> Why this page exists. The PR #113 incident (2026-07-01, `{a,b}`
> brace-expansion in a JSDoc) and PR #117 incident (2026-07-02, `a/b`
> slash separator in a Markdown task description) both crashed
> PostCSS at build time and returned HTTP 500 on `/es` in dev mode.
> PR #118 cleaned up the 37 existing hazards; this guard prevents
> future occurrences.

## The Hazard

Tailwind v4 uses a **content scanner** to find utility classes in your
source files. It greps `.ts`, `.tsx`, `.md`, `.mdx` (and other text
formats) for tokens that look like utility classes.

The scanner **does not parse your code as code**. It treats string
literals, JSDoc comments, regex patterns, and prose alike.

Two patterns that the scanner extracts but that are NOT valid CSS in
v4:

1. **Brace-expansion** (`{a,b}`): valid in v3, removed in v4. Tailwind
   emits the literal text as a selector. PostCSS fails with
   `Unexpected token CurlyBracketBlock`.

2. **Slash separator** (`a/b`): used informally to mean "either a or
   b" (e.g. `--ui-glass-blur-sm/lg` for "small or large blur"). Not
   valid inside `var(...)`. PostCSS fails with `Unexpected token
Delim('/')`.

The build still completes (warning, not error) and the affected
route returns HTTP 500.

## The Rule

**Never write brace-expansion or slash-separated utility-class-shaped
tokens in source files.**

Use prose or two literal names instead:

```diff
-`--ui-rounded-{sm,md,lg,full}`
+`--ui-rounded-sm` (or `-md`, `-lg`, `-full`)
```

```diff
-`backdrop-blur-[var(--ui-glass-blur-sm/lg)]`
+`backdrop-blur-[var(--ui-glass-blur-sm)]` (or `-[lg]`)
```

Applies to: JSDoc comments, prose documentation, regex literals,
Markdown docs, anywhere a utility-class-shaped token can be mistaken
for a real class.

## The Guard

The CI lint job (`.github/workflows/ci.yml`) runs a `grep -rnE` over
`app/`, `openspec/`, `Documents-es/` and fails the build on any match
across three patterns:

```bash
grep -rnE \
  -e "\-\-[a-z][a-z0-9-]+\{[a-z0-9, _-]+\}" \
  -e "\b[a-z][a-z0-9-]+-\{[a-z0-9, _-]+\}" \
  -e "var\(--[a-z][a-z0-9-]+/[a-z][a-z0-9-]+\)" \
  --include="*.tsx" --include="*.ts" \
  --include="*.md" --include="*.mdx" \
  --exclude-dir=node_modules --exclude-dir=.next \
  app/ openspec/ Documents-es/
```

The three patterns cover:

- Pattern 1: CSS variable with brace-expansion (`--xxx-{a,b}`)
- Pattern 2: utility-class-shaped token with brace-expansion (`xxx-{a,b}`)
- Pattern 3: `var(...)` with slash separator (`var(--xxx-yyy/zzz)`)

This is a one-line grep — no Node script, no allowlist, no pre-commit
hook. It runs only in CI; local commits don't get blocked by this
check. (The previous Node-script approach in PR #115 was closed
because the overhead did not justify the benefit.)

## Related

- PR #113 — `fix(tests): escape Tailwind scanner from glass-card.test.tsx JSDoc` (first occurrence).
- PR #117 — `docs(openspec): fix sm/lg typo in T-PR3-01 task description` (second occurrence).
- PR #118 — `docs(openspec): rewrite brace-expansion utility-class tokens as prose` (cleanup of all 37 existing hazards).
- PR #119 — `chore(build): add tailwind content-scanner guard` (this page + the CI grep).
