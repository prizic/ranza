import type { InputHTMLAttributes } from "react";

export interface FormFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  error?: string;
  hint?: string;
  id: string;
  label: string;
}

export function FormField({
  error,
  hint,
  id,
  label,
  ...inputProps
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const descriptionIds = [hintId, errorId].filter(Boolean).join(" ");

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      <input
        {...inputProps}
        aria-describedby={descriptionIds || undefined}
        aria-invalid={error ? true : undefined}
        id={id}
      />
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
