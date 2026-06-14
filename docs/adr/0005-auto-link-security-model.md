# ADR-0005 — Auto-link on email match (industry-standard)

**Status**: Accepted · **Date**: 2026-06-13 · **Deciders**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`openspec/changes/auth-foundation/design.md` §3 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Context and Problem Statement

When a user signs in with Google, two cases are possible: (1) the Google `email_verified: true` matches an existing `User.email` in our DB (the user signed up locally first and is now linking their Google account), or (2) no match (brand-new Google signup). The first case is the auto-link flow. The security model is: should we silently link the Google account to the existing local user, or refuse the sign-in and force a manual link UI?

## Drivers

- **BR-AUTH-5**: the auto-link happens only when Google's `email_verified` is `true`. If the Google profile's `email_verified` is `false` (or missing), the OAuth flow fails earlier at the Auth.js layer (BR-AUTH-6). The defense-in-depth check in `DefaultProviderPolicy` is documented as a separate invariant.
- **BR-AUTH-10**: the composite `@@unique([provider, providerAccountId])` on `Account` is the only DB-level line of defense against the "same Google account linked to two users" attack. The repository test asserts the `P2002` violation on a second `create` with the same composite key.
- **UX**: the industry-standard behavior (Notion, Linear, Vercel, GitHub) is to auto-link on verified email match; a manual link UI is a follow-up, not an MVP gate.
- **`defaultProvider` immutability** (BR-AUTH-13): `defaultProvider` is set ONLY on the very first registration. Auto-link does NOT mutate `defaultProvider`. The user keeps their original `defaultProvider = 'local'` even after they link Google.

## Considered Options

1. **Auto-link on email match** when `email_verified: true` (industry-standard; Notion, Linear, Vercel, GitHub).
2. **No auto-link** — refuse the sign-in and force a manual link UI. Worse UX; the user has to re-type the email twice.
3. **Auto-link only on `email_verified: true` AND `provider === 'google'`** — narrower than option 1; functionally the same in MVP because Google is the only OAuth provider.
4. **Email-link magic link** instead of OAuth — no `Account` row, but eliminates the auto-link attack surface entirely. Post-MVP (covered by the `email-verification` change).

## Decision Outcome

**Chosen option**: "1. Auto-link on email match when `email_verified: true`", because the composite `@@unique([provider, providerAccountId])` is the BR-AUTH-10 line of defense, `email_verified: true` is the BR-AUTH-5 / BR-AUTH-6 trust signal from Google, and the industry standard UX (Notion, Linear, Vercel) is the user-friendly default. The hardening pass (explicit "this Google account was linked to your existing local account" email notification, a manual "unlink Google" UI, and the `email-verification` change) is tracked as a follow-up.

### Consequences

- **Good**: minimal UX friction; the local user gets a Google login without a separate "link account" flow; `defaultProvider` stays `'local'` (BR-AUTH-13).
- **Bad**: if an attacker controls a Google account whose email matches a real local user's email AND Google's `email_verified` is `true` (a Google-side compromise), the attacker can sign in as the local user. Mitigated by BR-AUTH-5 (`email_verified: true` is required) and BR-AUTH-10 (the composite unique is the DB-level guarantee). A future hardening pass adds an email notification on auto-link so the real user notices.

### Confirmation

Validated by T-018 (`authjs.test.ts` callback shapes) and T-013 (`DefaultProviderPolicy.test.ts`, 5 cases including the "subsequent sign-in preserves existing `defaultProvider`" case). BR-AUTH-10 is validated by the T-017 `Account.findUnique` test (composite lookup) and the future `sdd-verify` testcontainer re-run (the `P2002` violation assertion).
