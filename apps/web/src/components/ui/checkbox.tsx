import type { InputHTMLAttributes } from 'react';

type CheckboxProps = Readonly<InputHTMLAttributes<HTMLInputElement>> & {
  label: string;
};

export const Checkbox = ({ className, label, ...props }: CheckboxProps) => {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input
        className={`size-5 shrink-0 accent-accent ${className ?? ''}`.trim()}
        type="checkbox"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
};
