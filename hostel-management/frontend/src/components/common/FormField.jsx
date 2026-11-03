import { forwardRef } from 'react';

/**
 * Labelled input with validation error and optional leading icon.
 * <FormField label="Email" name="email" error={errors.email} icon={Mail} />
 */
const FormField = forwardRef(function FormField(
  { label, name, error, hint, icon: Icon, required, className = '', rightElement, ...inputProps },
  ref
) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        )}
        <input
          ref={ref}
          id={name}
          name={name}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`h-10 w-full rounded-lg border bg-white text-sm text-slate-800 placeholder:text-slate-400
            transition-colors focus:outline-none focus:ring-2
            ${Icon ? 'pl-9' : 'pl-3'} ${rightElement ? 'pr-10' : 'pr-3'}
            ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-brand-600 focus:ring-brand-100'}`}
          {...inputProps}
        />
        {rightElement && <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightElement}</div>}
      </div>
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${name}-hint`} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
});

export default FormField;
