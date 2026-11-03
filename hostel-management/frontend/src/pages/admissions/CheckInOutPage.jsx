import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, LogOut } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect } from '../../components/common/Toolbar';
import Tabs from '../../components/common/Tabs';
import StatusBadge from '../../components/common/StatusBadge';
import { CheckInModal, CheckoutModal } from '../../components/admissions/AdmissionModals';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useHostel } from '../../context/HostelContext';
import { formatDate, formatPKR, todayISO } from '../../utils/formatters';

const daysLeft = (date) => Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${todayISO()}T00:00:00Z`)) / 86400000);

/** Check-in (pending admissions), upcoming check-outs and check-out history. */
export default function CheckInOutPage() {
  useDocumentTitle('Check-in / Check-out');
  const { hostelId } = useHostel();
  const [tab, setTab] = useState('leaving');
  const [within, setWithin] = useState('30');
  const [filters, setFilters] = useState({ search: '', page: 1 });
  const [modal, setModal] = useState(null);
  const params = {
    ...filters,
    hostel_id: hostelId,
    status: tab === 'pending' ? 'pending' : tab === 'history' ? 'checked_out' : tab === 'active' ? 'active' : '',
    leaving_within: tab === 'leaving' ? within : '',
  };
  const { data, meta, loading, error, reload } = useFetch('/admissions', params);

  const columns = [
    { key: 'full_name', header: 'Resident', render: (r) => <div><Link to={`/admissions/${r.id}`} className="font-medium text-slate-800 hover:text-brand-700">{r.full_name}</Link><div className="text-xs text-slate-500">{r.registration_no} · {r.mobile}</div></div> },
    { key: 'room', header: 'Room / Bed', render: (r) => (r.room_number ? `${r.room_number} / ${r.bed_number}` : '-') },
    { key: 'hostel_name', header: 'Hostel' },
    ...(tab === 'history'
      ? [
          { key: 'checkout_date', header: 'Checked out', render: (r) => formatDate(r.checkout_date) },
          { key: 'checkout_reason', header: 'Reason', className: 'max-w-[180px] truncate' },
          { key: 'refund_amount', header: 'Refunded', align: 'right', render: (r) => formatPKR(r.refund_amount) },
          { key: 'outstanding_amount', header: 'Dues left', align: 'right', render: (r) => (r.outstanding_amount > 0 ? <span className="text-red-600">{formatPKR(r.outstanding_amount)}</span> : '-') },
        ]
      : [
          { key: 'admission_date', header: 'Admitted', render: (r) => formatDate(r.admission_date) },
          { key: 'check_in_date', header: 'Checked in', render: (r) => formatDate(r.check_in_date) },
          {
            key: 'expected_leaving_date', header: 'Expected leaving',
            render: (r) => {
              if (!r.expected_leaving_date) return '-';
              const d = daysLeft(r.expected_leaving_date);
              return <span className={d < 0 ? 'text-red-600' : d <= 7 ? 'text-amber-600' : ''}>{formatDate(r.expected_leaving_date)} {r.status === 'active' && <span className="text-xs">({d < 0 ? `${-d} days overdue` : `${d} days`})</span>}</span>;
            },
          },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions', header: '', align: 'right',
            render: (r) =>
              r.status === 'pending' ? <Button size="sm" icon={LogIn} onClick={() => setModal({ type: 'in', a: r })}>Check-in</Button>
                : r.status === 'active' ? <Button size="sm" variant="secondary" icon={LogOut} onClick={() => setModal({ type: 'out', a: r })}>Check-out</Button> : null,
          },
        ]),
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Check-in / Check-out" description="Arrivals, departures and final settlement." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Check-in / Check-out' }]} />
      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs active={tab} onChange={(t) => { setTab(t); setFilters((f) => ({ ...f, page: 1 })); }} tabs={[
            { key: 'leaving', label: 'Leaving soon' }, { key: 'pending', label: 'Pending check-in' }, { key: 'active', label: 'Current residents' }, { key: 'history', label: 'Check-out history' },
          ]} />
        </div>
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Resident, admission or room..." value={filters.search} onChange={(v) => setFilters({ search: v, page: 1 })} />
          {tab === 'leaving' && <FilterSelect value={within} onChange={setWithin} placeholder={null} options={[{ value: '7', label: 'Within 7 days (incl. overdue)' }, { value: '15', label: 'Within 15 days' }, { value: '30', label: 'Within 30 days' }, { value: '90', label: 'Within 90 days' }]} />}
        </Toolbar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} columns={columns} emptyTitle={tab === 'leaving' ? 'No residents leaving soon' : 'Nothing here'} />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      {modal?.type === 'in' && <CheckInModal open admission={modal.a} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal?.type === 'out' && <CheckoutModal open admission={modal.a} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}
