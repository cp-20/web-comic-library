import type { ReactNode } from 'react';

type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

type BadgeProps = Readonly<{
  children: ReactNode;
  variant?: BadgeVariant;
}>;

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-subtle text-text',
  accent: 'bg-accent text-on-accent',
  success: 'bg-success text-on-accent',
  warning: 'bg-warning text-on-accent',
  danger: 'bg-danger text-on-accent',
};

export const Badge = ({ children, variant = 'neutral' }: BadgeProps) => {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
};
