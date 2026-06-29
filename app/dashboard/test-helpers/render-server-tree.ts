/**
 * Test helper: render a React Server Component tree that
 * contains `<Suspense>` boundaries around async children.
 *
 * `renderToStaticMarkup` and `renderToString` from
 * `react-dom/server` do NOT await async children inside
 * `<Suspense>` — they emit the fallback. The production
 * renderer (`renderToPipeableStream` with `onAllReady`)
 * waits for ALL Suspense boundaries to resolve before
 * closing the stream, which is what we need for
 * deterministic tests of FIX 2's per-card `<Suspense>`.
 *
 * Usage:
 *
 * ```typescript
 * import { renderServerTree } from './test-helpers/render-server-tree';
 *
 * const html = await renderServerTree(<DashboardPage searchParams={...} />);
 * expect(html).toContain('Resumen mensual');
 * ```
 *
 * The helper uses `renderToPipeableStream` with `onAllReady`
 * because that's the closest Node API to Next.js's production
 * renderer (which streams RSCs). It collects every chunk into
 * a buffer and returns the concatenated UTF-8 string.
 */

import { Writable } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';

export async function renderServerTree(tree: React.ReactElement): Promise<string> {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  await new Promise<void>((resolve, reject) => {
    const stream = renderToPipeableStream(tree, {
      onAllReady() {
        writable.on('finish', () => resolve());
        writable.on('error', reject);
        stream.pipe(writable);
      },
      onError(err) {
        reject(err);
      },
    });
  });
  return Buffer.concat(chunks).toString('utf8');
}
