import { Link } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  Building,
  DoorOpen,
  BedDouble,
  Users,
  BedSingle,
  Gauge,
  Wallet,
  AlertCircle,
  Receipt,
  TrendingUp,
  UserPlus,
  CreditCard,
  Plus,
  ArrowRightLeft,
  MessageSquareWarning,
  LogOut,
  FileText,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/common/Card';
import Alert from '../../components/common/Alert';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import {
  HostelOccupancyChart,
  MonthlyFinanceChart,
  BedsDonutChart,
  HostelRevenueChart,
} from '../../components/dashboard/DashboardCharts';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate, formatNumber, formatPKR, formatPercent } from '../../utils/formatters';
// SAMPLE DATA - UI preview only. Replaced with live API data in CHUNK 3.
import {
  sampleStats as stats,
  sampleHostelOccupancy,
  sampleMonthlyFinance,
  sampleHostelRevenue,
  sampleRecentAdmissions,
  sampleRecentPayments,
  sampleRecentActivities,
} from '../../utils/sampleData';

const ACTIVITY_ICONS = {
  transfer: ArrowRightLeft,
  complaint: MessageSquareWarning,
  fee: FileText,
  checkout: LogOut,
};

const QUICK_ACTIONS = [
  { label: 'Add Hostel', to: '/hostels', icon: Building2 },
  { label: 'Add Administrator', to: '/administrators', icon: ShieldCheck },
  { label: 'New Admission', to: '/admissions', icon: UserPlus },
  { label: 'Collect Payment', to: '/fees', icon: CreditCard },
  { label: 'Add Expense', to: '/expenses', icon: Receipt },
  { label: 'View Reports', to: '/reports', icon: TrendingUp },
];

export default function DashboardPage() {
  useDocumentTitle('Dashboard');

  const statCards = [
    { label: 'Total Hostels', value: formatNumber(stats.totalHostels), icon: Building2, tone: 'brand' },
    { label: 'Administrators', value: formatNumber(stats.totalAdministrators), icon: ShieldCheck, tone: 'slate' },
    { label: 'Buildings', value: formatNumber(stats.totalBuildings), icon: Building, tone: 'slate' },
    { label: 'Total Rooms', value: formatNumber(stats.totalRooms), icon: DoorOpen, tone: 'blue' },
    { label: 'Room Capacity', value: formatNumber(stats.totalCapacity), icon: BedDouble, tone: 'blue', hint: 'Total beds' },
    { label: 'Residents', value: formatNumber(stats.totalResidents), icon: Users, tone: 'violet' },
    { label: 'Occupied Beds', value: formatNumber(stats.occupiedBeds), icon: BedSingle, tone: 'brand' },
    { label: 'Available Beds', value: formatNumber(stats.availableBeds), icon: BedSingle, tone: 'amber' },
    { label: 'Occupancy', value: formatPercent(stats.occupancyPercent), icon: Gauge, tone: 'brand' },
    { label: 'Fee Collected', value: formatPKR(stats.feeCollected), icon: Wallet, tone: 'brand', hint: 'This month' },
    { label: 'Pending Fees', value: formatPKR(stats.pendingFees), icon: AlertCircle, tone: 'red' },
    { label: 'Total Expenses', value: formatPKR(stats.totalExpenses), icon: Receipt, tone: 'amber', hint: 'This month' },
    { label: 'Monthly Revenue', value: formatPKR(stats.monthlyRevenue), icon: TrendingUp, tone: 'violet', hint: 'November 2026' },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Super Admin Dashboard"
        description="Overview of all hostels, occupancy and finances."
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Dashboard' }]}
        actions={
          <Link
            to="/hostels"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
          >
            <Plus className="h-4 w-4" /> Add Hostel
          </Link>
        }
      />

      <Alert type="warning" title="Sample data" className="mb-6">
        This dashboard shows sample figures to preview the layout. Live database statistics arrive in CHUNK 3.
      </Alert>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Hostel-wise Occupancy" subtitle="Occupied vs available beds" className="xl:col-span-2">
          <HostelOccupancyChart data={sampleHostelOccupancy} />
        </Card>
        <Card title="Occupied vs Available Beds" subtitle="All hostels">
          <BedsDonutChart occupied={stats.occupiedBeds} available={stats.availableBeds} />
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Monthly Fee Collection & Expenses" subtitle="Last 6 months (PKR)" className="xl:col-span-2">
          <MonthlyFinanceChart data={sampleMonthlyFinance} />
        </Card>
        <Card title="Hostel-wise Revenue" subtitle="This month (PKR)">
          <HostelRevenueChart data={sampleHostelRevenue} />
        </Card>
      </div>

      {/* Recent records */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Recent Admissions" bodyClassName="p-0">
          <DataTable
            rows={sampleRecentAdmissions}
            columns={[
              { key: 'name', header: 'Resident', className: 'font-medium text-slate-800' },
              { key: 'hostel', header: 'Hostel' },
              { key: 'room', header: 'Room / Bed' },
              { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
            ]}
          />
        </Card>
        <Card title="Recent Payments" bodyClassName="p-0">
          <DataTable
            rows={sampleRecentPayments}
            columns={[
              { key: 'receipt', header: 'Receipt', className: 'font-mono text-xs' },
              { key: 'name', header: 'Resident', className: 'font-medium text-slate-800' },
              { key: 'method', header: 'Method', render: (row) => <Badge tone="slate">{row.method}</Badge> },
              { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatPKR(row.amount) },
            ]}
          />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Recent Activities" className="xl:col-span-2">
          <ul className="divide-y divide-slate-100">
            {sampleRecentActivities.map((activity) => {
              const Icon = ACTIVITY_ICONS[activity.type] || FileText;
              return (
                <li key={activity.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{activity.text}</p>
                    <p className="text-xs text-slate-500">{activity.time}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map(({ label, to, icon: Icon }) => (
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
