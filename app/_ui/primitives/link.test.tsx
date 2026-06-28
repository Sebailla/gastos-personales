// @vitest-environment jsdom
/** T-UI-024: Link primitive — Next.js Link wrapper with focus ring. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Link } from './link';

describe('Link', () => {
  it('renders an <a> with the given href via Next.js Link', () => {
    render(<Link href="/accounts">Accounts</Link>);
    const link = screen.getByRole('link', { name: 'Accounts' });
    expect(link).toHaveAttribute('href', '/accounts');
  });

  it('renders a focus-visible ring class (REQ-UI-4)', () => {
    render(<Link href="/x">X</Link>);
    expect(screen.getByRole('link').className).toContain('focus-visible:ring-2');
  });
});
