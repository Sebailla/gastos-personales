/**
 * scripts/sync-obsidian.ts
 *
 * One-way, destructive sync of `Documents-es/` from this repo into the user's
 * Obsidian vault (iCloud-synced). Run via `pnpm docs:obsidian` whenever the
 * Spanish documentation changes; this script refreshes the vault copy in place.
 *
 * Destructive by design: any *.md previously inside the vault's
 * `Documents-es/` folder is wiped before the repo copy is laid down. The
 * script snapshots the previous set and, if user-authored notes would be
 * lost, prints their paths in the JSON summary and on stderr — but it does
 * NOT abort and does NOT attempt to recover them. The vault copy is a
 * consumer, not a source of truth; treat it as throwaway.
 *
 * Exit codes:
 *   0 — OK (sync completed, counts and bytes match the source).
 *   1 — Unexpected failure (unclassified error; full stack trace on stderr).
 *   2 — Source not found or not a directory (`Documents-es/` missing in repo).
 *   3 — Vault project folder not found (iCloud Drive not mounted, or wrong path).
 *   4 — Verification mismatch after copy (counts or bytes don't match source).
 */

import { access, cp, readdir, rm, stat } from 'node:fs/promises';
import { constants as F } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exit codes: named for readability (AGENTS.md §10.1 — no magic numbers).
const EXIT_OK = 0;
const EXIT_UNEXPECTED = 1;
const EXIT_SOURCE_MISSING = 2;
const EXIT_VAULT_PARENT_MISSING = 3;
const EXIT_VERIFICATION_MISMATCH = 4;

// Paths are environment-driven; nothing is hardcoded (AGENTS.md §10.5 —
// environment variables only). OBSIDIAN_VAULT_PATH must point at the
// Obsidian vault *root* (the folder containing per-project subfolders).
// The script appends `Documents-es` to that root.
//
// The .husky/post-commit hook exports OBSIDIAN_VAULT_PATH before
// invoking this script, so end-to-end runs stay zero-config for the
// developer with iCloud Drive mounted. To run the script manually on
// a different machine, export the env var first:
//
//   export OBSIDIAN_VAULT_PATH="/path/to/your/Obsidian vault root"
//   pnpm docs:obsidian
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SOURCE = resolve(REPO_ROOT, 'Documents-es');
const VAULT_ROOT = process.env.OBSIDIAN_VAULT_PATH;
const VAULT_DOCUMENTS_ES = VAULT_ROOT ? resolve(VAULT_ROOT, 'Documents-es') : '';

interface NoteSnapshot {
  rel: string;
  size: number;
}

interface ClassifiedError {
  code: number;
  message: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, F.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function* walkMd(root: string): AsyncGenerator<string> {
  // Yields absolute paths of every *.md under `root`, descending recursively.
  // Skips any `.obsidian/` folder (vault config is never touched).
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(root, e.name);
    if (e.isDirectory()) {
      if (e.name === '.obsidian') continue;
      yield* walkMd(full);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      yield full;
    }
  }
}

async function countMd(root: string): Promise<number> {
  let n = 0;
  for await (const _ of walkMd(root)) n++;
  return n;
}

async function bytesUsed(root: string): Promise<number> {
  // Recursive byte sum. No external deps.
  async function* walkAll(dir: string): AsyncGenerator<number> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '.obsidian') continue;
        yield* walkAll(full);
      } else if (e.isFile()) {
        try {
          yield (await stat(full)).size;
        } catch {
          // Race with concurrent edits: skip and let the post-check catch it.
        }
      }
    }
  }
  let total = 0;
  for await (const sz of walkAll(root)) total += sz;
  return total;
}

async function snapshot(root: string): Promise<Map<string, NoteSnapshot>> {
  const snap = new Map<string, NoteSnapshot>();
  for await (const full of walkMd(root)) {
    const rel = relative(root, full);
    try {
      const size = (await stat(full)).size;
      snap.set(rel, { rel, size });
    } catch {
      // Ignore: file vanished between walk and stat.
    }
  }
  return snap;
}

/**
 * Maps an unknown error into a classified exit code + user-facing message.
 * Classified errors print a single-line message (no stack). Unclassified
 * errors print the stack for diagnosability and fall back to EXIT_UNEXPECTED.
 */
function classifyError(err: unknown): ClassifiedError {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (code === 'ENOENT') {
      // We can't tell from here whether SOURCE or VAULT_PARENT failed without
      // inspecting err.path; the main() pre-checks handle those cases before
      // any copy attempt, so ENOENT here is most likely a vanished intermediate.
      return {
        code: EXIT_VAULT_PARENT_MISSING,
        message: `ENOENT during copy: ${(err as { path?: string }).path ?? 'unknown path'}`,
      };
    }
    if (code === 'ERR_FS_CP_DIR_TO_NON_DIR' || code === 'ERR_FS_CP_EEXIST') {
      return {
        code: EXIT_UNEXPECTED,
        message: `fs.cp failed (${code}): ${(err as { message?: string }).message ?? 'no detail'}`,
      };
    }
  }
  // Verification mismatch comes through as a thrown Error with .name='VerificationError'.
  if (err instanceof Error && err.name === 'VerificationError') {
    return { code: EXIT_VERIFICATION_MISMATCH, message: err.message };
  }
  // Anything else: keep the stack for diagnosis.
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return { code: EXIT_UNEXPECTED, message: `unexpected failure\n${stack}` };
}

async function main(): Promise<void> {
  const t0 = Date.now();

  // 1. OBSIDIAN_VAULT_PATH must be set (no hardcoded fallback; AGENTS.md §10.5).
  if (!VAULT_ROOT) {
    process.stderr.write(
      'sync-obsidian: OBSIDIAN_VAULT_PATH is not set.\n' +
        'Point it at the root of your Obsidian vault (the folder that contains per-project subfolders).\n' +
        'Example: export OBSIDIAN_VAULT_PATH="/Users/me/Library/Mobile Documents/iCloud~md~obsidian/Documents/Proyectos"\n',
    );
    process.exit(EXIT_VAULT_PARENT_MISSING);
  }

  // 2. Source must exist and be a directory.
  if (!(await isDir(SOURCE))) {
    process.stderr.write(`sync-obsidian: source not found or not a directory: ${SOURCE}\n`);
    process.exit(EXIT_SOURCE_MISSING);
  }

  // 2. Vault project folder (gastos-personales/) must exist.
  const VAULT_PARENT = resolve(VAULT_DOCUMENTS_ES, '..');
  if (!(await isDir(VAULT_PARENT))) {
    process.stderr.write(
      `sync-obsidian: vault project folder not found: ${VAULT_PARENT}\n` +
        `Hint: create the folder inside the Obsidian vault, or mount iCloud Drive.\n`,
    );
    process.exit(EXIT_VAULT_PARENT_MISSING);
  }

  // 3. Snapshot any pre-existing *.md (for lost-note detection).
  const beforeSnap = (await exists(VAULT_DOCUMENTS_ES))
    ? await snapshot(VAULT_DOCUMENTS_ES)
    : new Map<string, NoteSnapshot>();
  const sourceMdCount = await countMd(SOURCE);
  const sourceBytes = await bytesUsed(SOURCE);

  // 4. Delete and re-copy. fs.cp is available on Node 16.7+; the project
  //    pins Node >=20, so no platform shim is needed. The previous
  //    shell-out to `cp -R` was removed to drop the platform dependency
  //    (gga finding #2).
  await rm(VAULT_DOCUMENTS_ES, { recursive: true, force: true });
  await cp(SOURCE, VAULT_DOCUMENTS_ES, { recursive: true, force: true });

  // 5. Verify counts and byte totals match.
  const targetMdCount = await countMd(VAULT_DOCUMENTS_ES);
  const targetBytes = await bytesUsed(VAULT_DOCUMENTS_ES);

  if (targetMdCount !== sourceMdCount || targetBytes !== sourceBytes) {
    const msg =
      `sync-obsidian: verification failed\n` +
      `  source .md=${sourceMdCount}, target .md=${targetMdCount}\n` +
      `  source bytes=${sourceBytes}, target bytes=${targetBytes}\n`;
    const e = new Error(msg);
    e.name = 'VerificationError';
    throw e;
  }

  // 6. Diff against the pre-snapshot: any note that was in the vault's old
  //    Documents-es/ but is not in the new copy is a hand-authored note that
  //    this sync has wiped. Warn loudly; do not abort.
  const afterSnap = await snapshot(VAULT_DOCUMENTS_ES);
  const lostManualNotes: string[] = [];
  for (const [rel] of beforeSnap) {
    if (!afterSnap.has(rel)) lostManualNotes.push(rel);
  }

  // 7. Emit single-line JSON summary.
  const summary = {
    status: 'ok' as const,
    sourceMdCount,
    targetMdCount,
    sourceBytes,
    targetBytes,
    lostManualNotes,
    durationMs: Date.now() - t0,
  };
  process.stdout.write(JSON.stringify(summary) + '\n');

  if (lostManualNotes.length > 0) {
    process.stderr.write(
      `sync-obsidian: WARNING ${lostManualNotes.length} hand-authored note(s) were overwritten (paths in JSON summary):\n` +
        lostManualNotes.map((p) => `  - ${p}`).join('\n') +
        '\n',
    );
  }
}

// Run main() only when this file is the entry point. When imported
// (e.g. from unit tests), the side-effecting entry is skipped so the
// pure exports can be exercised in isolation.
const isEntryPoint =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((err: unknown) => {
    const { code, message } = classifyError(err);
    process.stderr.write(`sync-obsidian: ${message}\n`);
    process.exit(code);
  });
}

// Re-exported for unit tests and one-off inspection; not used at runtime.
export {
  EXIT_OK,
  EXIT_UNEXPECTED,
  EXIT_SOURCE_MISSING,
  EXIT_VAULT_PARENT_MISSING,
  EXIT_VERIFICATION_MISMATCH,
  classifyError,
};
