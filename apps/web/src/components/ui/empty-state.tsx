import type { ReactNode } from 'react';

type EmptyStateProps = Readonly<{
  action?: ReactNode;
  description: string;
  title: string;
}>;

export const EmptyState = ({ action, description, title }: EmptyStateProps) => {
  return (
    <div className="grid justify-items-center gap-2 rounded-panel bg-surface-subtle px-6 py-12 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-text-muted">{description}</p>
      {action}
    </div>
  );
};
