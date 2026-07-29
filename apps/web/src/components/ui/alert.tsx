import type { ReactNode } from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

type AlertProps = Readonly<{
  children: ReactNode;
  variant?: AlertVariant;
}>;

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-accent',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
};

export const Alert = ({ children, variant = 'info' }: AlertProps) => {
  return (
    <div
      className={`rounded-panel border border-border-subtle border-l-4 bg-surface px-4 py-3 ${variantClasses[variant]}`}
      role={variant === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
};
