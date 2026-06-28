// @vitest-environment jsdom
/** T-UI-014: Card + CardHeader + CardBody + CardFooter compound pattern. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from './card';

describe('Card compound', () => {
  it('renders an <article> with the sub-components as children', () => {
    render(
      <Card>
        <CardHeader title="Account detail" />
        <CardBody>
          <p>key-value rows</p>
        </CardBody>
        <CardFooter>
          <button>Edit</button>
        </CardFooter>
      </Card>,
    );
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
    expect(article.tagName).toBe('ARTICLE');
  });

  it('CardHeader renders an <h2> with the title and optional badge + actions', () => {
    render(
      <CardHeader
        title="Account"
        badge={<span data-testid="badge">Active</span>}
        actions={<button>Edit</button>}
      />,
    );
    const h2 = screen.getByRole('heading', { level: 2, name: 'Account' });
    expect(h2).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('Active');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});