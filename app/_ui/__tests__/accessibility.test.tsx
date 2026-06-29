// @vitest-environment jsdom
/**
 * Cross-primitive a11y contract test.
 *
 * Every primitive in app/_ui/primitives/ is rendered with the
 * minimal props and asserted for axe-core `critical` + `serious`
 * violations (REQ-UI-4..8 — WCAG 2.2 AA floor). Moderate +
 * minor are logged but not blocking.
 *
 * This is the per-slice a11y gate. Slice 5 (integration-tests)
 * extends this to page-level checks for /accounts, /transactions,
 * /dashboard.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Button } from '../primitives/button';
import { Badge } from '../primitives/badge';

describe('a11y: Button', () => {
  it('has no critical or serious axe violations', async () => {
    const { container } = render(<Button>Save</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('a11y: Badge', () => {
  it('has no critical or serious axe violations', async () => {
    const { container } = render(<Badge variant="success">Active</Badge>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
