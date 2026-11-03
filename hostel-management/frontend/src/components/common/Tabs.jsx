/** Underline tabs. tabs: [{ key, label, count? }] */
export default function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`-mb-px flex gap-1 overflow-x-auto border-b border-slate-200 ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
            active === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${active === t.key ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600'}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
