import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint && !error && <span className="ui-field-hint">{hint}</span>}
      {error && (
        <span className="ui-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ui-textarea ${className}`.trim()} {...props} />;
}
