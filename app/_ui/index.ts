/**
 * Public barrel for the `ui` capability.
 *
 * Per design §2.3 + §7.4: this file is documentation-only. Runtime
 * imports use path-based imports (e.g.
 * `import { Button } from '../_ui/primitives/button'`) because
 * Next.js App Router does not support top-level barrel re-exports
 * of Server Components the same way `@/lib/foo` works for plain
 * modules.
 *
 * Re-exports are grouped by primitive family so the docs surface
 * matches the directory tree.
 */

// Tokens — declared as a CSS import comment so the bundler doesn't
// try to import a non-module asset. The actual CSS file is
// `@import`-ed in `app/globals.css`.
// import './tokens.css';  // intentionally not imported here

// Primitives — form controls.
export { Button } from './primitives/button';
export type { ButtonProps } from './primitives/button';
export { Input } from './primitives/input';
export type { InputProps } from './primitives/input';
export { Textarea } from './primitives/textarea';
export type { TextareaProps } from './primitives/textarea';
export { Select } from './primitives/select';
export type { SelectProps, SelectOption } from './primitives/select';
export { Checkbox } from './primitives/checkbox';
export type { CheckboxProps } from './primitives/checkbox';
export { RadioGroup } from './primitives/radio-group';
export type { RadioGroupProps, RadioGroupItem } from './primitives/radio-group';
export { Combobox } from './primitives/combobox';
export type { ComboboxProps, ComboboxOption } from './primitives/combobox';
export { FormField } from './primitives/form-field';
export type { FormFieldProps } from './primitives/form-field';
export { FieldError } from './primitives/field-error';
export type { FieldErrorProps } from './primitives/field-error';

// Primitives — surface components.
export { Card, CardHeader, CardBody, CardFooter } from './primitives/card';
export type { CardProps, CardHeaderProps, CardBodyProps, CardFooterProps } from './primitives/card';
export { Badge, directionVariant } from './primitives/badge';
export type { BadgeProps, BadgeVariant, Direction } from './primitives/badge';
export { EmptyState } from './primitives/empty-state';
export type { EmptyStateProps } from './primitives/empty-state';
export { Spinner } from './primitives/spinner';
export type { SpinnerProps } from './primitives/spinner';
export { Skeleton } from './primitives/skeleton';
export type { SkeletonProps } from './primitives/skeleton';
export { Pagination } from './primitives/pagination';
export type { PaginationProps } from './primitives/pagination';
export { Dialog } from './primitives/dialog';
export type { DialogProps } from './primitives/dialog';
export { Breadcrumb } from './primitives/breadcrumb';
export type { BreadcrumbProps, BreadcrumbItem } from './primitives/breadcrumb';
export { Link } from './primitives/link';
export type { LinkProps } from './primitives/link';

// Layout shell primitives.
export { PageHeader } from './layout/page-header';
export type { PageHeaderProps } from './layout/page-header';
export { PageContainer } from './layout/page-container';
export type { PageContainerProps } from './layout/page-container';
export { BreadcrumbBar } from './layout/breadcrumb-bar';
export type { BreadcrumbBarProps } from './layout/breadcrumb-bar';
export { Sidebar } from './layout/sidebar';
export type { SidebarProps } from './layout/sidebar';
export { Topbar } from './layout/topbar';
export type { TopbarProps } from './layout/topbar';
