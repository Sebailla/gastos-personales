/**
 * Slice 5 — Visual snapshot suite for the design-system primitives.
 *
 * Per design §13.5: every presentational primitive is rendered in
 * its primary state (and populated branch where applicable). The
 * snapshot files live at `tests/visual/__snapshots__/` (per
 * `vitest.config.ts:resolveSnapshotPath`).
 *
 * The primitives exercised here are the slice-1 design-system
 * surfaces the orchestrator explicitly named in tasks.md §Slice 5
 * (Card, Badge, EmptyState, Skeleton, Breadcrumb, Pagination,
 * Dialog, Combobox, Button, Input, Select, Textarea, FieldError).
 *
 * This file is a SMOKE TEST — it renders one trivial primitive and
 * snapshots it. Real snapshots live in the per-primitive test
 * files (one snapshot per primitive, plus the populated branch
 * where the primitive has multiple meaningful states).
 *
 * Why a separate setup file instead of one per-primitive test:
 * - Keeps the per-primitive test file focused on the snapshot
 *   contract for ITS primitive
 * - Keeps the snapshot directory discipline (`tests/visual/
 *   __snapshots__/`) consistent across all 13 primitives
 * - One centralized place for the snapshot serializer (we use the
 *   default Vitest serializer because the primitives have stable
 *   markup — no random ids, no class-name hashes that drift).
 *
 * TDD: T-UI-406 (infra scaffold).
 */

// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Button } from '../../app/_ui/primitives/button';

describe('visual snapshot suite — slice 5 smoke (T-UI-406)', () => {
  it('renders the Button primitive (placeholder so the per-primitive tests own the contract)', () => {
    // The per-primitive tests (tests/visual/{card,badge,...}.test.tsx)
    // own the actual snapshot contracts. This file is the smoke
    // marker that the visual suite is wired up correctly (Vitest
    // picks up tests/visual/**, the snapshot directory exists,
    // snapshot comparisons resolve).
    const { container } = render(<Button>Click me</Button>);
    expect(container.firstChild).toMatchSnapshot('button-placeholder');
  });
});
