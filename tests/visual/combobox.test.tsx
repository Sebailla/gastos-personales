// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Combobox primitive (T-UI-414).
// Per design §13.5: render open + closed + with options. The
// primitive has no open/closed state — the `<select>` is always
// open by default; this test snapshots three meaningful
// variations (empty options, single option, multiple options).

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Combobox } from '../../app/_ui/primitives/combobox';

describe('visual snapshot — Combobox primitive (T-UI-414)', () => {
  it('renders Combobox with three options counts', () => {
    const empty = render(
      <Combobox
        id="snap-combobox-empty"
        value={null}
        onChange={() => undefined}
        options={[]}
        aria-label="Empty combobox"
      />,
    );
    const single = render(
      <Combobox
        id="snap-combobox-single"
        value="a"
        onChange={() => undefined}
        options={[{ value: 'a', label: 'Alpha' }]}
        aria-label="Single combobox"
      />,
    );
    const many = render(
      <Combobox
        id="snap-combobox-many"
        value="b"
        onChange={() => undefined}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Bravo' },
          { value: 'c', label: 'Charlie' },
        ]}
        aria-label="Many combobox"
      />,
    );
    expect(empty.container.firstChild).toMatchSnapshot('empty');
    expect(single.container.firstChild).toMatchSnapshot('single');
    expect(many.container.firstChild).toMatchSnapshot('many');
  });
});
