import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = Readonly<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-border-control bg-surface text-text hover:bg-surface-subtle',
  ghost: 'text-accent hover:bg-surface-subtle hover:underline',
  danger: 'bg-danger text-on-accent hover:brightness-90',
};

export const Button = ({ className, variant = 'primary', ...props }: ButtonProps) => {
  const classes = [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 transition-[background-color,color,filter] duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} {...props} />;
};
