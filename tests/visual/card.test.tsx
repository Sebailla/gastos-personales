// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Card primitive (T-UI-407).
// Per design §13.5: render Card in empty + populated states + snapshot
// the rendered HTML. Slice-1 snapshot coverage lives at
// app/_ui/primitives/card.test.tsx — this integration-layer snapshot
// pins the SAME surface for downstream snapshot drift detection.

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
} from '../../app/_ui/primitives/card';

describe('visual snapshot — Card primitive (T-UI-407)', () => {
  it('renders the empty Card + populated Card compound', () => {
    const empty = render(<Card aria-label="Empty card">content</Card>);
    const populated = render(
      <Card aria-labelledby="card-title">
        <CardHeader title="Summary" />
        <CardBody>Body content</CardBody>
        <CardFooter>Footer content</CardFooter>
      </Card>,
    );
    expect(empty.container.firstChild).toMatchSnapshot('empty');
    expect(populated.container.firstChild).toMatchSnapshot('populated');
  });
});
