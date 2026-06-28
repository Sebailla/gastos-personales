/**
 * BreadcrumbBar primitive — composes the Breadcrumb primitive.
 * Server Component.
 */

import { Breadcrumb } from '../primitives/breadcrumb';

export interface BreadcrumbBarProps {
  items: ReadonlyArray<{ label: string; href?: string }>;
}

export function BreadcrumbBar({ items }: BreadcrumbBarProps): React.JSX.Element {
  return <Breadcrumb items={items} />;
}