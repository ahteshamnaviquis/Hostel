import { Link } from 'react-router-dom';
import {
  Building2, ShieldCheck, Building, DoorOpen, BedDouble, Users, BedSingle, Gauge, Wallet, AlertCircle, Receipt, TrendingUp,
  UserPlus, CreditCard, Plus, ArrowRightLeft, MessageSquareWarning, LogOut, LogIn, FileText, CalendarClock, CalendarCheck,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/common/Card';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { PageLoader } from '../../components/common/Spinner';
import { HostelOccupancyChart, MonthlyFinanceChart, BedsDonutChart, HostelRevenueChart, DonutChart, CHART_COLORS } from '../../components/dashboard/DashboardCharts';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useHostel } from '../../context/HostelContext';
import { formatDate, formatNumber, formatPKR, formatPercent, formatMonth, timeAgo } from '../../utils/formatters';
import { statusLabel } from '../../utils/status';

const ROOM_STATUS_COLORS = {
  available: '#14b8a6', partially_occupied: '#0f766e', fully_occupied: '#134e4a', maintenance: '#d97706', inactive: '#cbd5e1',
};

const MOVEMENT_ICONS = { check_in: LogIn, check_out: LogOut };

/** Real-time dashboard for Super Admin (all hostels) and Hostel Admin (assigned hostels). */
export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const { hostelId, selectedHostel } = useHostel();
  const { data, loading, error, reload } = useFetch('/dashboard', { hostel_id: hostelId });

  if (loading && !data) return <PageLoader message="Loading dashboard..." />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  const { stats, charts, recent } = data;
  const scopeLabel = selectedHostel ? selectedHostel.name : isSuperAdmin ? 'All hostels' : 'Your hostels';
  const monthName = formatMonth(stats.month);
  const unavailable = Math.max(0, stats.capacity - stats.occupiedBeds - stats.availableBeds);

  const superCards = [
    { label: 'Total Hostels', value: formatNumber(stats.hostels), icon: Building2, tone: 'brand', hint: `${stats.active_hostels} active` },
    { label: 'Administrators', value: formatNumber(stats.administrators), icon: ShieldCheck, tone: 'slate', hint: 'Active hostel admins' },
    { label: 'Buildings', value: formatNumber(stats.buildings), icon: Building, tone: 'slate' },
  ];
  const cards = [
    ...(isSuperAdmin && !hostelId ? superCards : []),
    { label: 'Total Rooms', value: formatNumber(stats.rooms), icon: DoorOpen, tone: 'blue' },
    { label: 'Total Capacity', value: formatNumber(stats.capacity), icon: BedDouble, tone: 'blue', hint: 'Beds' },
    { label: 'Occupied Beds', value: formatNumber(stats.occupiedBeds), icon: BedSingle, tone: 'brand' },
    { label: 'Available Beds', value: formatNumber(stats.availableBeds), icon: BedSingle, tone: 'amber' },
    { label: 'Occupancy', value: formatPercent(stats.occupancyPercent), icon: Gauge, tone: 'brand' },
    { label: 'Total Residents', value: formatNumber(stats.residents), icon: Users, tone: 'violet', hint: 'Currently staying' },
    { label: 'New Admissions', value: formatNumber(stats.new_admissions), icon: UserPlus, tone: 'brand', hint: monthName },
    { label: 'Leaving Soon', value: formatNumber(stats.leaving_soon), icon: CalendarClock, tone: 'amber', hint: 'Next 7 days' },
    { label: 'Fee Collected', value: formatPKR(stats.fee_collected_month), icon: Wallet, tone: 'brand', hint: `${monthName} · total ${formatPKR(stats.fee_collected_total)}` },
    { label: 'Pending Fees', value: formatPKR(stats.pending_fees), icon: AlertCircle, tone: 'red', hint: `${stats.overdue_invoices} overdue invoice(s)` },
    { label: 'Monthly Expenses', value: formatPKR(stats.expenses_month), icon: Receipt, tone: 'amber', hint: `Total ${formatPKR(stats.expenses_total)}` },
    { label: 'Monthly Revenue', value: formatPKR(stats.monthlyRevenue), icon: TrendingUp, tone: 'violet', hint: `Net ${formatPKR(stats.monthlyRevenue - stats.expenses_month - stats.refunds_month)}` },
    { label: 'Open Complaints', value: formatNumber(stats.open_complaints), icon: MessageSquareWarning, tone: stats.open_complaints ? 'red' : 'slate' },
  ];

  const quickActions = [
    { label: 'Add Hostel', to: '/hostels?new=1', icon: Building2, show: isSuperAdmin },
    { label: 'Add Administrator', to: '/administrators?new=1', icon: ShieldCheck, show: isSuperAdmin },
    { label: 'Register Resident', to: '/residents/new', icon: Users, show: hasPermission('residents.manage') },
    { label: 'New Admission', to: '/admissions/new', icon: UserPlus, show: hasPermission('admissions.manage') },
    { label: 'Collect Payment', to: '/fees?collect=1', icon: CreditCard, show: hasPermission('payments.manage') },
    { label: 'Add Expense', to: '/expenses?new=1', icon: Receipt, show: hasPermission('expenses.manage') },
    { label: 'Mark Attendance', to: '/attendance', icon: CalendarCheck, show: hasPermission('attendance.manage') },
    { label: 'View Reports', to: '/reports', icon: TrendingUp, show: hasPermission('reports.view') },
  ].filter((a) => a.show);

  const feeTotal = Number(charts.feeStatus.paid) + Number(charts.feeStatus.pending);
  const roomStatusData = charts.roomStatus.map((r) => ({ name: statusLabel(r.status), value: Number(r.count), color: ROOM_STATUS_COLORS[r.status] || CHART_COLORS.muted }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={isSuperAdmin ? 'Super Admin Dashboard' : 'Hostel Dashboard'}
        description={`Welcome back, ${user.fullName}. Showing ${scopeLabel}.`}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Dashboard' }]}
        actions={
          isSuperAdmin ? (
            <Link to="/hostels?new=1" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
              <Plus className="h-4 w-4" /> Add Hostel
            </Link>
          ) : hasPermission('admissions.manage') ? (
            <Link to="/admissions/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
              <Plus className="h-4 w-4" /> New Admission
            </Link>
          ) : null
        }
      />

      {stats.hostels === 0 && (
        <Card className="mb-6">
          <EmptyState
            icon={Building2}
            title={isSuperAdmin ? 'No hostels yet' : 'No hostel assigned'}
            message={isSuperAdmin ? 'Create your first hostel to get started.' : 'Ask the Super Admin to assign a hostel to your account.'}
            action={isSuperAdmin && <Link to="/hostels?new=1" className="text-sm font-medium text-brand-700">Add a hostel</Link>}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {isSuperAdmin && !hostelId ? (
          <Card title="Hostel-wise Occupancy" subtitle="Occupied vs available beds" className="xl:col-span-2">
            {charts.hostelOccupancy.length ? <HostelOccupancyChart data={charts.hostelOccupancy} /> : <EmptyState title="No hostels" />}
          </Card>
        ) : (
          <Card title="Room Occupancy" subtitle="Rooms by status" className="xl:col-span-2">
            <div className="grid gap-6 md:grid-cols-2">
              <DonutChart data={roomStatusData} centerValue={formatNumber(stats.rooms)} centerLabel="rooms" format={(v) => `${formatNumber(v)} rooms`} />
              <div className="space-y-3 self-center text-sm">
                {[
                  ['Capacity', stats.capacity], ['Occupied beds', stats.occupiedBeds], ['Available beds', stats.availableBeds],
                  ['Unavailable (maintenance)', unavailable], ['Occupancy', formatPercent(stats.occupancyPercent)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-medium text-slate-800">{typeof v === 'number' ? formatNumber(v) : v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
        <Card title="Occupied vs Available Beds" subtitle={scopeLabel}>
          <BedsDonutChart occupied={stats.occupiedBeds} available={stats.availableBeds} maintenance={unavailable} />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Monthly Fee Collection & Expenses" subtitle="Last 6 months (PKR)" className="xl:col-span-2">
          <MonthlyFinanceChart data={charts.monthlyFinance} />
        </Card>
        {isSuperAdmin && !hostelId ? (
          <Card title="Hostel-wise Revenue" subtitle={`${monthName} (PKR)`}>
            {charts.hostelRevenue.some((h) => h.revenue > 0) ? <HostelRevenueChart data={charts.hostelRevenue} /> : <EmptyState title="No payments this month" />}
          </Card>
        ) : (
          <Card title="Fees: Paid vs Pending" subtitle="All invoices">
            <DonutChart
              data={[
                { name: 'Paid', value: Number(charts.feeStatus.paid), color: CHART_COLORS.primary },
                { name: 'Pending', value: Number(charts.feeStatus.pending), color: '#ef4444' },
              ]}
              centerValue={feeTotal ? `${Math.round((charts.feeStatus.paid / feeTotal) * 100)}%` : '0%'}
              centerLabel="collected"
              format={formatPKR}
            />
          </Card>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Recent Admissions" bodyClassName="p-0" action={<Link to="/admissions" className="text-xs font-medium text-brand-700">View all</Link>}>
          <DataTable
            rows={recent.admissions}
            emptyTitle="No admissions yet"
            columns={[
              { key: 'full_name', header: 'Resident', className: 'font-medium text-slate-800', render: (r) => <Link to={`/admissions/${r.id}`} className="hover:text-brand-700">{r.full_name}</Link> },
              { key: 'hostel_name', header: 'Hostel' },
              { key: 'room_bed', header: 'Room / Bed' },
              { key: 'admission_date', header: 'Date', render: (r) => formatDate(r.admission_date) },
            ]}
          />
        </Card>
        <Card title="Recent Payments" bodyClassName="p-0" action={<Link to="/fees?tab=payments" className="text-xs font-medium text-brand-700">View all</Link>}>
          <DataTable
            rows={recent.payments}
            emptyTitle="No payments yet"
            columns={[
              { key: 'receipt_no', header: 'Receipt', className: 'font-mono text-xs', render: (r) => <Link to={`/print/receipt/${r.id}`} className="hover:text-brand-700">{r.receipt_no}</Link> },
              { key: 'full_name', header: 'Resident', className: 'font-medium text-slate-800' },
              { key: 'payment_method', header: 'Method', render: (r) => <StatusBadge status={r.payment_method} /> },
              { key: 'amount', header: 'Amount', align: 'right', render: (r) => formatPKR(r.amount) },
            ]}
          />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Room Transfers" bodyClassName="p-0">
          <DataTable
            rows={recent.transfers}
            dense
            emptyTitle="No transfers"
            columns={[
              { key: 'full_name', header: 'Resident', className: 'font-medium text-slate-800' },
              { key: 'beds', header: 'From → To', render: (r) => <span className="text-xs">{r.from_bed} → {r.to_bed}</span> },
              { key: 'transfer_date', header: 'Date', render: (r) => formatDate(r.transfer_date) },
            ]}
          />
        </Card>
        <Card title="Complaints" bodyClassName="p-0" action={<Link to="/complaints" className="text-xs font-medium text-brand-700">View all</Link>}>
          <DataTable
            rows={recent.complaints}
            dense
            emptyTitle="No complaints"
            columns={[
              { key: 'subject', header: 'Subject', className: 'max-w-[160px] truncate font-medium text-slate-800' },
              { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        </Card>
        <Card title="Check-ins & Check-outs" bodyClassName="p-0">
          <DataTable
            rows={recent.movements}
            rowKey={(r) => `${r.type}-${r.id}`}
            dense
            emptyTitle="No movements yet"
            columns={[
              {
                key: 'type', header: 'Type',
                render: (r) => {
                  const Icon = MOVEMENT_ICONS[r.type];
                  return <span className="inline-flex items-center gap-1.5 text-xs"><Icon className="h-3.5 w-3.5" /> {r.type === 'check_in' ? 'Check-in' : 'Check-out'}</span>;
                },
              },
              { key: 'full_name', header: 'Resident', className: 'font-medium text-slate-800' },
              { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
            ]}
          />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Recent Activities" className="xl:col-span-2">
          {recent.activities.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.activities.map((a) => {
                const Icon = a.action.startsWith('allocation') ? ArrowRightLeft : a.action.startsWith('complaint') ? MessageSquareWarning : a.action.includes('checkout') ? LogOut : FileText;
                return (
                  <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{a.description}</p>
                      <p className="text-xs text-slate-500">
                        {a.user_name || 'System'} · {timeAgo(a.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map(({ label, to, icon: Icon }) => (
              <Link
                key={label}
                to={to}
                className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-3 text-center text-xs font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
              >
                <Icon className="h-5 w-5 text-brand-700" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
