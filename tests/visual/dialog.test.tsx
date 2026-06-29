// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Dialog primitive (T-UI-413).
// Per design §13.5: snapshot open + closed. Closed renders null
// (the primitive returns null when !open) — the snapshot captures
// a comment marker so the orchestrator can see the contract.

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Dialog } from '../../app/_ui/primitives/dialog';

describe('visual snapshot — Dialog primitive (T-UI-413)', () => {
  it('renders Dialog open + closed', () => {
    const open = render(
      <Dialog open title="Confirm" description="Are you sure?" onClose={() => undefined}>
        <p>Body content</p>
      </Dialog>,
    );
    const closed = render(
      <Dialog open={false} title="Confirm" onClose={() => undefined}>
        <p>Body content</p>
      </Dialog>,
    );
    // Per design the primitive returns null when !open; we
    // snapshot the empty body so the drift marker is clear.
    expect(open.container).toMatchSnapshot('open');
    expect(closed.container.firstChild).toBeNull();
  });
});
