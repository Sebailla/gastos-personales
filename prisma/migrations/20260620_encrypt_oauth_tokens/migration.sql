-- OAuth token encryption at rest (4R-R1 CRITICAL-3).
--
-- The Account.refresh_token, access_token, and id_token columns
-- previously held plaintext Google OAuth tokens. A database
-- read (DBA, backup leak, replica compromise) yielded full
-- account takeover. This migration changes the column type
-- from TEXT to BYTEA and the application boundary to
-- AES-256-GCM envelope encryption.
--
-- Dev: this migration is a no-op for a fresh DB. For an
-- existing dev DB, the backfill script in
-- scripts/backfill-encrypt-oauth-tokens.ts reads each
-- plaintext row, encrypts it with the dev key, and writes it
-- back. The script is idempotent (skips ciphertext rows).
--
-- Production: the same script runs as a one-off job in a
-- controlled window. The application process must NOT be
-- running concurrent writes to Account during the backfill.
-- See docs/adr/0009-oauth-token-encryption.md for the
-- rollout plan and the operational runbook.

-- AlterTable
ALTER TABLE "Account"
  ALTER COLUMN "refresh_token" TYPE BYTEA USING (
    CASE
      WHEN "refresh_token" IS NULL THEN NULL
      ELSE convert_to("refresh_token", 'UTF8')::bytea
    END
  ),
  ALTER COLUMN "access_token" TYPE BYTEA USING (
    CASE
      WHEN "access_token" IS NULL THEN NULL
      ELSE convert_to("access_token", 'UTF8')::bytea
    END
  ),
  ALTER COLUMN "id_token" TYPE BYTEA USING (
    CASE
      WHEN "id_token" IS NULL THEN NULL
      ELSE convert_to("id_token", 'UTF8')::bytea
    END
  );
