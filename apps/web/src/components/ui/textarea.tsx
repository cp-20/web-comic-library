import type { TextareaHTMLAttributes } from 'react';

type TextareaProps = Readonly<TextareaHTMLAttributes<HTMLTextAreaElement>>;

export const Textarea = ({ className, rows = 4, ...props }: TextareaProps) => {
  const classes = [
    'w-full rounded-control border border-border-control bg-surface px-3 py-2 placeholder:text-text-muted',
    'disabled:bg-surface-subtle disabled:text-text-muted',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <textarea className={classes} rows={rows} {...props} />;
};
