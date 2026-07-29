import type { InputHTMLAttributes } from 'react';

type InputProps = Readonly<InputHTMLAttributes<HTMLInputElement>>;

export const Input = ({ className, ...props }: InputProps) => {
  const classes = [
    'min-h-11 w-full rounded-control border border-border-control bg-surface px-3 py-2 placeholder:text-text-muted',
    'disabled:bg-surface-subtle disabled:text-text-muted',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <input className={classes} {...props} />;
};
