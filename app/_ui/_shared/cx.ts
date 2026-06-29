/**
 * Tiny className merge helper. Concatenates truthy class strings
 * with single-space separators. Avoids the `clsx` dependency
 * since the v1 primitives only need a small subset of its
 * behavior (no array/object flattening required — every primitive
 * passes a static list of class names).
 *
 * Returns '' when every input is falsy so consumers can pass
 * `cx('base', isLoading && 'extra')` without a runtime null.
 */
export function cx(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
