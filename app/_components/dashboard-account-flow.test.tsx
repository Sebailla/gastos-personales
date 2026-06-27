/**
 * Tests for `AccountFlowCard` — dashboard-ui slice 4
 * (T-RPT-305).
 *
 * Per design §9.2: the dashboard does NOT deep-link to the
 * flow endpoint in v1. The flow card is always empty until a
 * future change adds an account picker (see
 * `openspec/changes/reports/design.md` §9.2 and
 * `openspec/changes/reports/tasks.md` §Slice 4). The smoke
 * test pins the v1 empty-state contract: the heading, the
 * (UTC) label, and the "Sin datos" surface render in every
 * visit.
 *
 * No logic in tests (root AGENTS.md §10.5): the assertion is
 * a direct `toContain` check on the rendered HTML.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountFlowCard } from './dashboard-account-flow';

describe('AccountFlowCard (dashboard-ui T-RPT-305)', () => {
  it('renders the empty state with "Sin datos" + heading + (UTC) label', () => {
    // v1: the dashboard always renders the empty state — the
    // dashboard does NOT deep-link to the flow endpoint.
    const html = renderToStaticMarkup(<AccountFlowCard month="2026-06" />);
    expect(html).toContain('Flujo por cuenta');
    expect(html).toContain('Sin datos');
    expect(html).toContain('2026-06');
    expect(html).toContain('(UTC)');
  });
});
