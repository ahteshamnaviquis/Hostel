/** Filter / action row on top of a list card. */
export default function Toolbar({ children, className = '' }) {
  return <div className={`flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>{children}</div>;
}

/** Compact select used inside toolbars. */
export function FilterSelect({ value, onChange, options, placeholder = 'All', className = '', label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label || placeholder}
      className={`h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 ${className}`}
    >
      {placeholder !== null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Compact date input used inside toolbars. */
export function FilterDate({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}
