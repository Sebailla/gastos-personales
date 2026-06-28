// @vitest-environment jsdom
/** T-UI-019: Skeleton — aria-hidden=true + animated placeholder. */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders with aria-hidden=true so screen readers skip it', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[aria-hidden="true"]');
    expect(el).toBeInTheDocument();
  });

  it('renders width and height as inline styles', () => {
    const { container } = render(<Skeleton width={200} height={24} />);
    const el = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('24px');
  });
});
