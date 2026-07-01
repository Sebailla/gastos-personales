// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Skeleton primitive (T-UI-410).
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { Skeleton } from '../../app/_ui/primitives/skeleton';

describe('visual snapshot — Skeleton primitive (T-UI-410)', () => {
  it('renders the Skeleton primitive', () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
