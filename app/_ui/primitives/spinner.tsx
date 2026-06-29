/**
 * Spinner primitive — inline SVG with `role="status"` and
 * `aria-label` (default "Loading"). CSS-only animation: the
 * `animate-spin` Tailwind utility rotates the ring; no JS loop.
 *
 * Spec: design §3.2.8.
 */

export interface SpinnerProps {
  /** Accessible label for the loading state. Defaults to "Loading". */
  'aria-label'?: string;
  /** Visual size in pixels. Defaults to 20. */
  size?: number;
}

export function Spinner({
  'aria-label': ariaLabel = 'Loading',
  size = 20,
}: SpinnerProps): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      style={{ display: 'inline-block', width: size, height: size }}
      className="animate-spin text-ui-accent"
      data-testid="ui-spinner"
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
