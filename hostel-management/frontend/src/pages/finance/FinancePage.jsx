import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line, ComposedChart } from 'recharts';
import { Wallet, Receipt, Undo2, TrendingUp, FileText, AlertCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import ErrorState from '../../components/common/ErrorState';
import Toolbar, { FilterDate } from '../../components/common/Toolbar';
import { PageLoader } from '../../components/common/Spinner';
import { DonutChart, CHART_COLORS } from '../../components/dashboard/DashboardCharts';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useHostel } from '../../context/HostelContext';
import { formatPKR, formatPKRCompact, formatDate, monthISO, todayISO } from '../../utils/formatters';
import { statusLabel } from '../../utils/status';

const PALETTE = ['#0f766e', '#d97706', '#0284c7', '#7c3aed', '#dc2626', '#65a30d', '#db2777', '#475569', '#0d9488', '#ca8a04', '#94a3b8'];
const axis = { tick: { fontSize: 12, fill: CHART_COLORS.axis }, tickLine: false, axisLine: false };

/** Revenue vs expenses, net income, category-wise and hostel-wise breakdowns. */
export default function FinancePage() {
  useDocumentTitle('Financial Summary');
  const { hostelId } = useHostel();
  const [range, setRange] = useState({ from: `${monthISO()}-01`, to: todayISO() });
  const { data, loading, error, reload } = useFetch('/finance/summary', { ...range, hostel_id: hostelId });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Financial Summary" description="Revenue (fees collected) vs expenses and refunds." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Financial Summary' }]} />
      <Card className="mb-6" bodyClassName="p-0">
        <Toolbar className="border-0">
          <FilterDate label="From" value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} />
          <FilterDate label="To" value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} />
          <span className="text-xs text-slate-500">Cards and breakdowns use this period. The trend chart shows the last 12 months.</span>
        </Toolbar>
      </Card>
      {loading && !data ? <PageLoader /> : error ? <Card><ErrorState message={error} onRetry={reload} /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Billed" value={formatPKR(data.totals.invoiced)} icon={FileText} tone="slate" />
            <StatCard label="Collected" value={formatPKR(data.totals.collected)} icon={Wallet} tone="brand" />
            <StatCard label="Expenses" value={formatPKR(data.totals.expenses)} icon={Receipt} tone="amber" />
            <StatCard label="Refunds" value={formatPKR(data.totals.refunds)} icon={Undo2} tone="violet" />
            <StatCard label="Net income" value={formatPKR(data.totals.net)} icon={TrendingUp} tone={data.totals.net >= 0 ? 'brand' : 'red'} />
            <StatCard label="Outstanding (all)" value={formatPKR(data.totals.outstanding)} icon={AlertCircle} tone="red" />
          </div>

          <Card title="Revenue vs expenses" subtitle="Last 12 months" className="mt-6">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                <XAxis dataKey="month" {...axis} />
                <YAxis {...axis} tickFormatter={formatPKRCompact} width={78} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v) => formatPKR(v)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: '#475569' }}>{v}</span>} />
                <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expenses" name="Expenses" fill={CHART_COLORS.expense} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line type="monotone" dataKey="net" name="Net income" stroke="#0f172a" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Expenses by category" subtitle={`${formatDate(data.from)} – ${formatDate(data.to)}`}>
              <DonutChart data={data.byCategory.map((c, i) => ({ name: c.category, value: Number(c.amount), color: PALETTE[i % PALETTE.length] }))} centerValue={formatPKRCompact(data.totals.expenses)} centerLabel="expenses" format={formatPKR} />
            </Card>
            <Card title="Collections by method" subtitle="Cash, bank and mobile wallets">
              <DonutChart data={data.byMethod.map((m, i) => ({ name: statusLabel(m.payment_method), value: Number(m.amount), color: PALETTE[i % PALETTE.length] }))} centerValue={formatPKRCompact(data.totals.collected)} centerLabel="collected" format={formatPKR} />
            </Card>
            <Card title="Monthly figures" bodyClassName="p-0">
              <DataTable dense rows={[...data.monthly].reverse()} rowKey="ym" columns={[
                { key: 'month', header: 'Month' },
                { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatPKRCompact(r.revenue) },
                { key: 'expenses', header: 'Expenses', align: 'right', render: (r) => formatPKRCompact(r.expenses) },
                { key: 'net', header: 'Net', align: 'right', render: (r) => <span className={r.net < 0 ? 'text-red-600' : ''}>{formatPKRCompact(r.net)}</span> },
              ]} />
            </Card>
          </div>

          <Card title="Hostel-wise" subtitle="For the selected period" className="mt-6" bodyClassName="p-0">
            <DataTable rows={data.byHostel} emptyTitle="No hostels" columns={[
              { key: 'hostel', header: 'Hostel', className: 'font-medium text-slate-800' },
              { key: 'revenue', header: 'Collected', align: 'right', render: (r) => formatPKR(r.revenue) },
              { key: 'expenses', header: 'Expenses', align: 'right', render: (r) => formatPKR(r.expenses) },
              { key: 'refunds', header: 'Refunds', align: 'right', render: (r) => formatPKR(r.refunds) },
              { key: 'net', header: 'Net income', align: 'right', render: (r) => <span className={`font-semibold ${r.net < 0 ? 'text-red-600' : 'text-brand-700'}`}>{formatPKR(r.net)}</span> },
              { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => formatPKR(r.outstanding) },
            ]} />
            {data.byHostel.length > 1 && (
              <div className="border-t border-slate-100 p-4">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.byHostel} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="hostel" {...axis} />
                    <YAxis {...axis} tickFormatter={formatPKRCompact} width={78} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v) => formatPKR(v)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: '#475569' }}>{v}</span>} />
                    <Bar dataKey="revenue" name="Collected" fill={CHART_COLORS.primary} maxBarSize={36} />
                    <Bar dataKey="expenses" name="Expenses" fill={CHART_COLORS.expense} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
