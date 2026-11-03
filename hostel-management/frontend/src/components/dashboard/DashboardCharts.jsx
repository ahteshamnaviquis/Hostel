import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { formatPKR, formatPKRCompact, formatNumber } from '../../utils/formatters';

// Chart palette (kept in one place so all charts stay consistent)
export const CHART_COLORS = {
  primary: '#0f766e', // brand-700
  secondary: '#5eead4', // brand-300
  muted: '#cbd5e1', // slate-300
  expense: '#d97706', // amber-600
  grid: '#e2e8f0', // slate-200
  axis: '#64748b', // slate-500
};

const axisProps = { tick: { fontSize: 12, fill: CHART_COLORS.axis }, tickLine: false, axisLine: false };
// Legend labels in readable neutral text (not the series colour)
const legendProps = {
  iconType: 'circle',
  wrapperStyle: { fontSize: 12 },
  formatter: (value) => <span style={{ color: '#475569' }}>{value}</span>,
};
const tooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 };

/** Stacked bars: occupied vs available beds per hostel. */
export function HostelOccupancyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="hostel" {...axisProps} interval={0} tickFormatter={(v) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => formatNumber(v)} />
        <Legend {...legendProps} />
        <Bar dataKey="occupied" name="Occupied" stackId="beds" fill={CHART_COLORS.primary} maxBarSize={44} />
        <Bar dataKey="available" name="Available" stackId="beds" fill={CHART_COLORS.muted} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Monthly fee collection vs expenses. */
export function MonthlyFinanceChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={formatPKRCompact} width={78} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatPKR(v)} />
        <Legend {...legendProps} />
        <Area type="monotone" dataKey="collected" name="Fee Collected" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#collectedFill)" />
        <Area type="monotone" dataKey="expenses" name="Expenses" stroke={CHART_COLORS.expense} strokeWidth={2} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Donut chart with a centre label and legend.
 * data: [{ name, value, color }], format: value formatter for legend/tooltip
 */
export function DonutChart({ data, centerValue, centerLabel, format = formatNumber }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const chartData = total ? data : [{ name: 'No data', value: 1, color: '#e2e8f0' }];
  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={86} paddingAngle={total ? 2 : 0} stroke="none" isAnimationActive={false}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            {total > 0 && <Tooltip contentStyle={tooltipStyle} formatter={(v) => format(v)} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-900">{centerValue}</span>
          <span className="text-xs text-slate-500">{centerLabel}</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums text-slate-800">{format(entry.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Donut: occupied vs available beds with occupancy % in the centre. */
export function BedsDonutChart({ occupied, available, maintenance = 0 }) {
  const total = occupied + available + maintenance;
  const percent = total ? Math.round((occupied / total) * 100) : 0;
  const data = [
    { name: 'Occupied', value: occupied, color: CHART_COLORS.primary },
    { name: 'Available', value: available, color: CHART_COLORS.muted },
  ];
  if (maintenance) data.push({ name: 'Maintenance / Unavailable', value: maintenance, color: CHART_COLORS.expense });
  return <DonutChart data={data} centerValue={`${percent}%`} centerLabel="occupied" format={(v) => `${formatNumber(v)} beds`} />;
}

/** Horizontal bars: revenue per hostel. */
export function HostelRevenueChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} />
        <XAxis type="number" {...axisProps} tickFormatter={formatPKRCompact} />
        <YAxis type="category" dataKey="hostel" {...axisProps} width={110} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => formatPKR(v)} />
        <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
