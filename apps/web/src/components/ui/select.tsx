import type { SelectHTMLAttributes } from 'react';

type SelectProps = Readonly<SelectHTMLAttributes<HTMLSelectElement>>;

export const Select = ({ className, children, ...props }: SelectProps) => {
  const classes = [
    'min-h-11 w-full rounded-control border border-border-control bg-surface px-3 py-2',
    'disabled:bg-surface-subtle disabled:text-text-muted',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <select className={classes} {...props}>
      {children}
    </select>
  );
};
