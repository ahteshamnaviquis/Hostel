const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  blue: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  slate: 'bg-slate-100 text-slate-700',
  violet: 'bg-violet-50 text-violet-700',
};

/**
 * Summary metric tile used on dashboards.
 * <StatCard label="Total Rooms" value="186" icon={DoorOpen} tone="brand" hint="+4 this month" />
 */
export default function StatCard({ label, value, icon: Icon, tone = 'brand', hint }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {Icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
