// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Badge primitive (T-UI-408).
// Per design §13.5: snapshot each variant. The slice-1 snapshot
// file (badge.test.tsx) covers the contract; this integration-layer
// snapshot is the slice-5 drift-detection surface.

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Badge, type BadgeVariant } from '../../app/_ui/primitives/badge';

const VARIANTS: ReadonlyArray<BadgeVariant> = [
  'neutral',
  'accent',
  'success',
  'warning',
  'danger',
];

describe('visual snapshot — Badge primitive (T-UI-408)', () => {
  it.each(VARIANTS)('renders the %s variant', (variant) => {
    const { container } = render(<Badge variant={variant}>{variant}</Badge>);
    expect(container.firstChild).toMatchSnapshot(variant);
  });
});
