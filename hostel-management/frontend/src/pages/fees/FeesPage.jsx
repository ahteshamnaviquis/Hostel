import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, FilePlus, CalendarPlus, Undo2, Printer, RotateCcw, Eye, AlarmClock } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect, FilterDate } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import IconButton from '../../components/common/IconButton';
import Tabs from '../../components/common/Tabs';
import Modal from '../../components/common/Modal';
import FormField from '../../components/common/FormField';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { CollectPaymentModal, CreateInvoiceModal, GenerateMonthlyModal, RefundModal, InvoiceDetailModal } from '../../components/fees/FeeModals';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { PAYMENT_METHODS, REFUND_TYPES } from '../../utils/constants';
import { formatDate, formatPKR, formatMonth, humanize } from '../../utils/formatters';

const INVOICE_STATUS = [
  { value: 'outstanding', label: 'Outstanding' }, { value: 'overdue', label: 'Overdue' }, { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partially paid' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' },
];

export default function FeesPage() {
  useDocumentTitle('Fees & Payments');
  const navigate = useNavigate();
  const toast = useToast();
  const { hostelId, defaultHostelId } = useHostel();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'accounts');
  const [filters, setFilters] = useState({ search: '', status: params.get('status') || '', payment_method: '', from: '', to: '', billing_month: '', refund_type: '', page: 1 });
  const [modal, setModal] = useState(params.get('collect') ? { type: 'pay', admissionId: params.get('collect') } : params.get('invoice') ? { type: 'invoice', admissionId: params.get('invoice') } : null);
  const [viewInvoice, setViewInvoice] = useState(params.get('view') || null);
  const [reverse, setReverse] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [finesOpen, setFinesOpen] = useState(false);

  useEffect(() => {
    if (params.get('collect') || params.get('invoice') || params.get('view')) setParams(tab !== 'accounts' ? { tab } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urls = { accounts: '/fees/accounts', invoices: '/invoices', payments: '/payments', refunds: '/refunds' };
  const query = { ...filters, hostel_id: hostelId, only_due: tab === 'accounts' && filters.status === 'due' };
  if (tab === 'accounts') delete query.status;
  const { data, meta, loading, error, reload } = useFetch(urls[tab], query);
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  const switchTab = (t) => {
    setTab(t);
    setFilters({ search: '', status: '', payment_method: '', from: '', to: '', billing_month: '', refund_type: '', page: 1 });
  };
  const closeModal = () => setModal(null);
  const done = () => reload();

  const doReverse = async () => {
    if (!reason.trim()) return toast.error('Please give a reason');
    setBusy(true);
    try {
      await api.post(`/payments/${reverse.id}/reverse`, { reason });
      toast.success('Payment reversed');
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setBusy(false);
      setReverse(null);
      setReason('');
    }
  };

  const applyFines = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post('/invoices/apply-late-fines', { hostel_id: defaultHostelId });
      toast.success(res.message);
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setBusy(false);
      setFinesOpen(false);
    }
  };

  const totals = meta?.totals;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Fees & Payments"
        description="Invoices, collections, receipts, dues and refunds (PKR)."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Fees & Payments' }]}
        actions={
          <>
            <Button variant="secondary" icon={CalendarPlus} onClick={() => setModal({ type: 'generate' })}>Generate monthly fees</Button>
            <Button variant="secondary" icon={FilePlus} onClick={() => setModal({ type: 'invoice' })}>New invoice</Button>
            <Button variant="secondary" icon={Undo2} onClick={() => setModal({ type: 'refund' })}>Refund</Button>
            <Button icon={CreditCard} onClick={() => setModal({ type: 'pay' })}>Collect payment</Button>
          </>
        }
      />

      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {tab === 'accounts' && <>
            <StatCard label="Total outstanding" value={formatPKR(totals.outstanding)} tone="red" />
            <StatCard label="Overdue" value={formatPKR(totals.overdue)} tone="amber" />
            <StatCard label="Advance credit held" value={formatPKR(totals.advance)} tone="violet" />
          </>}
          {tab === 'invoices' && <>
            <StatCard label="Invoiced" value={formatPKR(totals.total)} tone="slate" />
            <StatCard label="Paid" value={formatPKR(totals.paid)} tone="brand" />
            <StatCard label="Outstanding" value={formatPKR(totals.outstanding)} tone="red" />
          </>}
          {tab === 'payments' && <StatCard label="Collected (filtered)" value={formatPKR(totals.collected)} tone="brand" hint="Excludes reversed payments and deposit adjustments" />}
        </div>
      )}

      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs active={tab} onChange={switchTab} tabs={[{ key: 'accounts', label: 'Resident balances' }, { key: 'invoices', label: 'Invoices' }, { key: 'payments', label: 'Payments' }, { key: 'refunds', label: 'Refunds' }]} />
        </div>
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Resident, reg. no, receipt / invoice no..." value={filters.search} onChange={set('search')} />
          {tab === 'accounts' && <FilterSelect value={filters.status} onChange={set('status')} placeholder="All accounts" options={[{ value: 'due', label: 'With dues only' }]} />}
          {tab === 'invoices' && <>
            <FilterSelect value={filters.status} onChange={set('status')} placeholder="All statuses" options={INVOICE_STATUS} />
            <input type="month" value={filters.billing_month} onChange={(e) => set('billing_month')(e.target.value)} aria-label="Billing month" className="h-10 rounded-lg border border-slate-300 px-2.5 text-sm" />
            <Button variant="ghost" size="sm" icon={AlarmClock} onClick={() => setFinesOpen(true)} disabled={!defaultHostelId} title={!defaultHostelId ? 'Select a hostel in the top bar' : undefined}>Apply late fines</Button>
          </>}
          {tab === 'payments' && <>
            <FilterSelect value={filters.payment_method} onChange={set('payment_method')} placeholder="All methods" options={[...PAYMENT_METHODS, { value: 'deposit_adjustment', label: 'Deposit adjustment' }]} />
            <FilterSelect value={filters.status} onChange={set('status')} placeholder="All statuses" options={[{ value: 'posted', label: 'Posted' }, { value: 'reversed', label: 'Reversed' }]} />
          </>}
          {tab === 'refunds' && <FilterSelect value={filters.refund_type} onChange={set('refund_type')} placeholder="All types" options={REFUND_TYPES} />}
          {tab !== 'accounts' && <><FilterDate label="From" value={filters.from} onChange={set('from')} /><FilterDate label="To" value={filters.to} onChange={set('to')} /></>}
        </Toolbar>

        {tab === 'accounts' && (
          <DataTable rows={data} loading={loading} error={error} onRetry={reload} rowKey="admission_id" emptyTitle="No resident accounts" columns={[
            { key: 'full_name', header: 'Resident', render: (r) => <div><Link to={`/admissions/${r.admission_id}`} className="font-medium text-slate-800 hover:text-brand-700">{r.full_name}</Link><div className="text-xs text-slate-500">{r.registration_no} · {r.mobile}</div></div> },
            { key: 'room', header: 'Room / Bed', render: (r) => (r.room_number ? `${r.room_number} / ${r.bed_number}` : '-') },
            { key: 'hostel_name', header: 'Hostel' },
            { key: 'monthly_rent', header: 'Rent', align: 'right', render: (r) => formatPKR(r.monthly_rent) },
            { key: 'oldest_due', header: 'Oldest due', render: (r) => formatDate(r.oldest_due) },
            { key: 'overdue', header: 'Overdue', align: 'right', render: (r) => (r.overdue > 0 ? <span className="text-amber-600">{formatPKR(r.overdue)}</span> : '-') },
            { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => (r.outstanding > 0 ? <span className="font-semibold text-red-600">{formatPKR(r.outstanding)}</span> : <span className="text-emerald-600">Clear</span>) },
            { key: 'advance', header: 'Advance', align: 'right', render: (r) => (r.advance > 0 ? formatPKR(r.advance) : '-') },
            { key: 'status', header: 'Stay', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'actions', header: '', align: 'right', render: (r) => <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'pay', admissionId: r.admission_id })}>Collect</Button> },
          ]} />
        )}
        {tab === 'invoices' && (
          <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No invoices" onRowClick={(r) => setViewInvoice(r.id)} columns={[
            { key: 'invoice_no', header: 'Invoice', className: 'font-mono text-xs' },
            { key: 'full_name', header: 'Resident', render: (r) => <div><div className="font-medium text-slate-800">{r.full_name}</div><div className="text-xs text-slate-500">{r.registration_no}</div></div> },
            { key: 'type', header: 'Type / Month', render: (r) => <div>{humanize(r.invoice_type)}<div className="text-xs text-slate-500">{r.billing_month ? formatMonth(r.billing_month) : formatDate(r.invoice_date)}</div></div> },
            { key: 'due_date', header: 'Due', render: (r) => formatDate(r.due_date) },
            { key: 'total_amount', header: 'Total', align: 'right', render: (r) => formatPKR(r.total_amount) },
            { key: 'paid_amount', header: 'Paid', align: 'right', render: (r) => formatPKR(r.paid_amount) },
            { key: 'balance', header: 'Balance', align: 'right', render: (r) => (r.status === 'cancelled' ? '-' : formatPKR(r.balance)) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.is_overdue ? 'overdue' : r.status} /> },
            { key: 'actions', header: '', align: 'right', render: (r) => <IconButton icon={Eye} label="View invoice" onClick={(e) => { e.stopPropagation(); setViewInvoice(r.id); }} /> },
          ]} />
        )}
        {tab === 'payments' && (
          <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No payments" columns={[
            { key: 'receipt_no', header: 'Receipt', className: 'font-mono text-xs' },
            { key: 'payment_date', header: 'Date', render: (r) => formatDate(r.payment_date) },
            { key: 'full_name', header: 'Resident', render: (r) => <div><div className="font-medium text-slate-800">{r.full_name}</div><div className="text-xs text-slate-500">{r.registration_no}</div></div> },
            { key: 'payment_method', header: 'Method', render: (r) => <div><StatusBadge status={r.payment_method} />{r.reference_no && <div className="text-xs text-slate-500">{r.reference_no}</div>}</div> },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className={r.status === 'reversed' ? 'text-slate-400 line-through' : 'font-medium'}>{formatPKR(r.amount)}</span> },
            { key: 'unallocated_amount', header: 'Advance left', align: 'right', render: (r) => (r.unallocated_amount > 0 ? formatPKR(r.unallocated_amount) : '-') },
            { key: 'received_by_name', header: 'Received by' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: '', align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1">
                  <IconButton icon={Printer} label="Print receipt" onClick={() => navigate(`/print/receipt/${r.id}`)} />
                  {r.status === 'posted' && r.payment_method !== 'deposit_adjustment' && <IconButton icon={RotateCcw} label="Reverse payment" tone="red" onClick={() => setReverse(r)} />}
                </div>
              ),
            },
          ]} />
        )}
        {tab === 'refunds' && (
          <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No refunds" columns={[
            { key: 'refund_no', header: 'Refund', className: 'font-mono text-xs' },
            { key: 'refund_date', header: 'Date', render: (r) => formatDate(r.refund_date) },
            { key: 'full_name', header: 'Resident', className: 'font-medium text-slate-800' },
            { key: 'refund_type', header: 'Type', render: (r) => humanize(r.refund_type) },
            { key: 'payment_method', header: 'Method', render: (r) => <StatusBadge status={r.payment_method} /> },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => formatPKR(r.amount) },
            { key: 'reason', header: 'Reason', className: 'max-w-[200px] truncate' },
            { key: 'processed_by_name', header: 'By' },
          ]} />
        )}
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>

      {modal?.type === 'pay' && <CollectPaymentModal open admissionId={modal.admissionId} onClose={closeModal} onDone={done} />}
      {modal?.type === 'invoice' && <CreateInvoiceModal open admissionId={modal.admissionId} onClose={closeModal} onDone={() => { closeModal(); done(); }} />}
      {modal?.type === 'generate' && <GenerateMonthlyModal open onClose={closeModal} onDone={done} />}
      {modal?.type === 'refund' && <RefundModal open onClose={closeModal} onDone={() => { closeModal(); done(); }} />}
      <InvoiceDetailModal invoiceId={viewInvoice} onClose={() => setViewInvoice(null)} onChanged={reload} />
      <Modal open={Boolean(reverse)} onClose={() => setReverse(null)} size="sm" title={`Reverse payment ${reverse?.receipt_no}?`} footer={<><Button variant="secondary" onClick={() => setReverse(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={doReverse}>Reverse payment</Button></>}>
        <p className="mb-4 text-sm text-slate-600">The payment of {formatPKR(reverse?.amount)} will be marked reversed and its invoices become unpaid again. The record is kept for audit.</p>
        <FormField label="Reason" required name="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
      <ConfirmDialog open={finesOpen} title="Apply late payment fines?" message="Adds the late fine from Settings to every overdue invoice of the selected hostel that does not already have one." confirmLabel="Apply fines" variant="primary" loading={busy} onCancel={() => setFinesOpen(false)} onConfirm={applyFines} />
    </div>
  );
}
