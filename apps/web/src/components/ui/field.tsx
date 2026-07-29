import type { ReactNode } from 'react';

type FieldProps = Readonly<{
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
}>;

/**
 * label と補助説明、error 文言を入力へ近接して並べる。
 * 入力には同じ `id` を渡し、hint や error がある場合は `aria-describedby` で
 * `${id}-hint` / `${id}-error` を参照する。
 */
export const Field = ({ children, error, hint, id, label }: FieldProps) => {
  return (
    <div className="grid gap-1.5">
      <label className="font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-sm text-text-muted" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
};
