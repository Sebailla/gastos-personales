# ADR-0003 — Argon2id parameters: memoryCost=19456, timeCost=2, parallelism=1

**Status**: Accepted · **Date**: 2026-06-13 · **Deciders**: Sebastián Illa
**Refs**: `openspec/changes/auth-foundation/proposal.md` (v2) ·
`openspec/changes/auth-foundation/design.md` §1, §3 ·
`openspec/changes/auth-foundation-slice-c/proposal.md`

## Context and Problem Statement

Password hashing is the line of defense against an attacker who gets a database dump. We use Argon2id (the OWASP-recommended PHC winner) via `@node-rs/argon2` (with the `argon2` npm package as a documented fallback if the prebuilt binary fails to load on Fly.io 1-CPU). The parameters (`memoryCost`, `timeCost`, `parallelism`) determine both the attacker's brute-force cost and the legitimate login latency on the target VM. The design targets 50–100 ms per hash on the Fly.io 1-CPU shared-cpu VM — slow enough to make a brute-force attack expensive, fast enough that a sign-in feels instant.

## Drivers

- **BR-AUTH-3**: parameters tuned to land in the 50–100 ms band on the target VM.
- **BR-AUTH-4**: the "user not found" path in the Credentials `authorize()` runs an Argon2id verify against a fixed `DUMMY_HASH` so response time is statistically indistinguishable from "found, wrong password".
- **Reproducibility**: parameters live as named constants in `argon2.hasher.ts`; the test asserts them; the benchmark script asserts the runtime band.
- **Re-tunability**: a documented fallback path (bump `timeCost` to 3 if the runtime is below 50 ms; or switch to the `argon2` npm package if `@node-rs/argon2` fails to load on the target).

## Considered Options

1. **Argon2id** with `memoryCost=19456 KiB`, `timeCost=2`, `parallelism=1` via `@node-rs/argon2` (with `argon2` npm as fallback).
2. **bcrypt** with `costFactor=12` — single parameter, well understood, but Argon2id is the modern recommendation (memory-hard, GPU-resistant).
3. **scrypt** with `N=2^15, r=8, p=1` — memory-hard but slower on small inputs and the parameter encoding is more error-prone.
4. **Argon2i** (data-independent) or **Argon2d** (data-dependent, GPU-resistant) — different tradeoffs; Argon2id is the hybrid OWASP recommends for password hashing.

## Decision Outcome

**Chosen option**: "1. Argon2id with memoryCost=19456, timeCost=2, parallelism=1", because the benchmark on the target VM (Fly.io 1-CPU) lands at a median of ~65 ms, inside the 50–100 ms band, and `@node-rs/argon2` ships prebuilt binaries for `linux-x64-gnu`, `linux-arm64-gnu`, and `darwin-arm64` (the three targets we ship to). The `DUMMY_HASH` is generated once at module init from `env.ARGON2ID_DUMMY_PASSWORD` (a long random Fly secret) and reused on every "user not found" path (BR-AUTH-4, BR-AUTH-9).

### Consequences

- **Good**: modern memory-hard KDF; parameters are reproducible on the target VM; the `DUMMY_HASH` equalization closes the user-enumeration timing oracle; the benchmark is checked in CI as a security test (T-027.5 `argon2.parameters.test.ts`).
- **Bad**: parameters will need re-tuning when Fly.io changes VM shapes or when `@node-rs/argon2` ships a new binary. The `fly-deploy` change re-runs the benchmark on the target VM and updates the constants if the band drifts. The fallback to the `argon2` npm package is a one-line import change.

### Confirmation

Validated by T-012 (`argon2.hasher.test.ts`, 5 cases) and the C-2 security test T-027.5 (`argon2.parameters.test.ts`, 30 hash calls; median in [50, 100] ms). The `scripts/bench-argon2.ts` benchmark is the local-dev smoke for the band.
