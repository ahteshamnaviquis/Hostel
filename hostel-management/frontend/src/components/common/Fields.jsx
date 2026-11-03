/**
 * Form controls sharing FormField's look: SelectField, TextAreaField, CheckboxField.
 */
const baseInput = (error) =>
  `w-full rounded-lg border bg-white text-sm text-slate-800 transition-colors focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 ${
    error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-brand-600 focus:ring-brand-100'
  }`;

function Wrapper({ label, name, required, error, hint, className, children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

/** options: [{ value, label }] */
export function SelectField({ label, name, error, hint, required, className = '', options = [], placeholder = 'Select...', ...props }) {
  return (
    <Wrapper label={label} name={name} required={required} error={error} hint={hint} className={className}>
      <select id={name} name={name} aria-invalid={Boolean(error)} className={`${baseInput(error)} h-10 px-3`} {...props}>
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function TextAreaField({ label, name, error, hint, required, className = '', rows = 3, ...props }) {
  return (
    <Wrapper label={label} name={name} required={required} error={error} hint={hint} className={className}>
      <textarea id={name} name={name} rows={rows} aria-invalid={Boolean(error)} className={`${baseInput(error)} px-3 py-2`} {...props} />
    </Wrapper>
  );
}

export function CheckboxField({ label, name, checked, onChange, hint, className = '', disabled }) {
  return (
    <label className={`flex items-start gap-2.5 text-sm text-slate-700 ${disabled ? 'opacity-60' : ''} ${className}`}>
      <input
        type="checkbox"
        name={name}
        checked={Boolean(checked)}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-700"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Small "label: value" grid for detail pages. items: [{ label, value }] */
export function InfoGrid({ items, cols = 3 }) {
  const colClass = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${colClass}`}>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{i.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-slate-800">{i.value === null || i.value === undefined || i.value === '' ? '-' : i.value}</dd>
          </div>
        ))}
    </dl>
  );
}
