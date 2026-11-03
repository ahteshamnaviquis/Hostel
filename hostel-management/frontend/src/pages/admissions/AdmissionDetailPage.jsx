import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, LogIn, LogOut, XCircle, CreditCard, Plus, Printer, Trash2, FilePlus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/common/DataTable';
import Tabs from '../../components/common/Tabs';
import IconButton from '../../components/common/IconButton';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorState from '../../components/common/ErrorState';
import { PageLoader } from '../../components/common/Spinner';
import { InfoGrid } from '../../components/common/Fields';
import { TransferModal, CheckInModal, CancelAdmissionModal, CheckoutModal, FeeStructureModal } from '../../components/admissions/AdmissionModals';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatDateTime, formatPKR, humanize } from '../../utils/formatters';

export default function AdmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const { data: a, loading, error, reload } = useFetch(`/admissions/${id}`);
  const { data: feeTypes } = useFetch('/fee-types');
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('allocations');
  const [stopLine, setStopLine] = useState(null);
  useDocumentTitle(a ? `Admission ${a.admission_no}` : 'Admission');

  if (loading && !a) return <PageLoader />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  const open = ['pending', 'active'].includes(a.status);
  const canPay = hasPermission('payments.manage');
  const done = () => { setModal(null); reload(); };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`${a.full_name}`}
        description={`${a.admission_no} · ${a.hostel_name}${a.room_number ? ` · Room ${a.room_number} / ${a.bed_number}` : ''}`}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Admissions', to: '/admissions' }, { label: a.admission_no }]}
        actions={
          <>
            {a.status === 'pending' && <Button icon={LogIn} onClick={() => setModal('checkin')}>Check-in</Button>}
            {open && <Button variant="secondary" icon={ArrowRightLeft} onClick={() => setModal('transfer')}>Transfer room</Button>}
            {canPay && a.status !== 'cancelled' && <Button variant="secondary" icon={CreditCard} onClick={() => navigate(`/fees?collect=${a.id}`)}>Collect payment</Button>}
            {canPay && a.status !== 'cancelled' && <Button variant="secondary" icon={FilePlus} onClick={() => navigate(`/fees?invoice=${a.id}`)}>Add charges</Button>}
            {a.status === 'active' && <Button variant="danger" icon={LogOut} onClick={() => setModal('checkout')}>Check-out</Button>}
            {open && !a.payments.some((p) => p.status === 'posted') && <Button variant="ghost" icon={XCircle} onClick={() => setModal('cancel')}>Cancel</Button>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Status" value={<StatusBadge status={a.status} />} tone="slate" />
        <StatCard label="Outstanding" value={formatPKR(a.balance.outstanding)} tone={a.balance.outstanding > 0 ? 'red' : 'slate'} />
        <StatCard label="Paid" value={formatPKR(a.balance.paid)} tone="brand" />
        <StatCard label="Deposit held" value={formatPKR(a.balance.depositHeld)} tone="violet" hint={`Charged ${formatPKR(a.balance.depositCharged)}`} />
        <StatCard label="Advance credit" value={formatPKR(a.balance.advance)} tone="amber" />
      </div>

      <Card title="Admission details" className="mb-6">
        <InfoGrid cols={4} items={[
          { label: 'Resident', value: <Link className="text-brand-700" to={`/residents/${a.resident_id}`}>{a.full_name} ({a.registration_no})</Link> },
          { label: 'CNIC / Mobile', value: `${a.cnic || '-'} · ${a.mobile}` },
          { label: 'Room / Bed', value: a.room_number ? `${a.building_name} · ${a.room_number} / ${a.bed_number}` : '-' },
          { label: 'Monthly rent', value: formatPKR(a.monthly_rent) },
          { label: 'Admission date', value: formatDate(a.admission_date) },
          { label: 'Check-in date', value: formatDate(a.check_in_date) },
          { label: 'Expected leaving', value: formatDate(a.expected_leaving_date) },
          { label: 'Security deposit / Admission fee', value: `${formatPKR(a.security_deposit)} / ${formatPKR(a.admission_fee)}` },
          { label: 'Checked out', value: a.checkout_date ? `${formatDate(a.checkout_date)} by ${a.checked_out_by_name || '-'}` : '-', hidden: !a.checkout_date },
          { label: 'Checkout reason', value: a.checkout_reason, hidden: !a.checkout_date },
          { label: 'Settlement', value: a.checkout_date ? `Deposit adjusted ${formatPKR(a.deposit_adjusted)} · Refunded ${formatPKR(a.refund_amount)} · Dues left ${formatPKR(a.outstanding_amount)}` : '', hidden: !a.checkout_date },
          { label: 'Remarks', value: a.remarks },
          { label: 'Created', value: `${formatDateTime(a.created_at)} by ${a.created_by_name || '-'}` },
        ]} />
      </Card>

      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs active={tab} onChange={setTab} tabs={[
            { key: 'allocations', label: 'Allocation history', count: a.allocations.length },
            { key: 'transfers', label: 'Transfers', count: a.transfers.length },
            { key: 'charges', label: 'Fee structure', count: a.fee_structures.filter((f) => f.status === 'active').length },
            { key: 'invoices', label: 'Invoices', count: a.invoices.length },
            { key: 'payments', label: 'Payments & refunds', count: a.payments.length + a.refunds.length },
          ]} />
        </div>
        {tab === 'allocations' && (
          <DataTable rows={a.allocations} columns={[
            { key: 'bed', header: 'Room / Bed', render: (r) => `${r.building_name} · ${r.room_number} / ${r.bed_number}` },
            { key: 'start_date', header: 'From', render: (r) => formatDate(r.start_date) },
            { key: 'end_date', header: 'To', render: (r) => formatDate(r.end_date) },
            { key: 'monthly_rent', header: 'Rent', align: 'right', render: (r) => formatPKR(r.monthly_rent) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'release_reason', header: 'Notes', className: 'max-w-[260px] truncate text-xs text-slate-500' },
            { key: 'allocated_by_name', header: 'By' },
          ]} />
        )}
        {tab === 'transfers' && (
          <DataTable rows={a.transfers} emptyTitle="No room transfers" columns={[
            { key: 'transfer_date', header: 'Date', render: (r) => formatDate(r.transfer_date) },
            { key: 'from_bed', header: 'From' },
            { key: 'to_bed', header: 'To' },
            { key: 'reason', header: 'Reason' },
            { key: 'transferred_by_name', header: 'By' },
          ]} />
        )}
        {tab === 'charges' && (
          <div>
            {open && canPay && <div className="flex justify-end p-4 pb-0"><Button size="sm" icon={Plus} onClick={() => setModal('fee')}>Add / change charge</Button></div>}
            <DataTable rows={a.fee_structures} emptyTitle="No fee structure" columns={[
              { key: 'fee_type_name', header: 'Charge', className: 'font-medium text-slate-800' },
              { key: 'frequency', header: 'Frequency', render: (r) => humanize(r.frequency) },
              { key: 'amount', header: 'Amount', align: 'right', render: (r) => (r.is_deduction ? `- ${formatPKR(r.amount)}` : formatPKR(r.amount)) },
              { key: 'effective_from', header: 'From', render: (r) => formatDate(r.effective_from) },
              { key: 'effective_to', header: 'To', render: (r) => formatDate(r.effective_to) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'actions', header: '', align: 'right', render: (r) => (open && canPay && r.status === 'active' && r.frequency === 'monthly' ? <IconButton icon={Trash2} tone="red" label="Stop this charge" onClick={() => setStopLine(r)} /> : null) },
            ]} />
          </div>
        )}
        {tab === 'invoices' && (
          <DataTable rows={a.invoices} emptyTitle="No invoices" onRowClick={canPay ? (r) => navigate(`/fees?tab=invoices&view=${r.id}`) : undefined} columns={[
            { key: 'invoice_no', header: 'Invoice', className: 'font-mono text-xs' },
            { key: 'invoice_type', header: 'Type', render: (r) => humanize(r.invoice_type) },
            { key: 'billing_month', header: 'Month' },
            { key: 'due_date', header: 'Due', render: (r) => formatDate(r.due_date) },
            { key: 'total_amount', header: 'Total', align: 'right', render: (r) => formatPKR(r.total_amount) },
            { key: 'paid_amount', header: 'Paid', align: 'right', render: (r) => formatPKR(r.paid_amount) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        )}
        {tab === 'payments' && (
          <div className="space-y-6 pb-4">
            <DataTable rows={a.payments} emptyTitle="No payments" columns={[
              { key: 'receipt_no', header: 'Receipt', className: 'font-mono text-xs' },
              { key: 'payment_date', header: 'Date', render: (r) => formatDate(r.payment_date) },
              { key: 'payment_method', header: 'Method', render: (r) => <StatusBadge status={r.payment_method} /> },
              { key: 'amount', header: 'Amount', align: 'right', render: (r) => formatPKR(r.amount) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'print', header: '', align: 'right', render: (r) => <IconButton icon={Printer} label="Print receipt" onClick={() => navigate(`/print/receipt/${r.id}`)} /> },
            ]} />
            {a.refunds.length > 0 && (
              <DataTable rows={a.refunds} columns={[
                { key: 'refund_no', header: 'Refund', className: 'font-mono text-xs' },
                { key: 'refund_date', header: 'Date', render: (r) => formatDate(r.refund_date) },
                { key: 'refund_type', header: 'Type', render: (r) => humanize(r.refund_type) },
                { key: 'payment_method', header: 'Method', render: (r) => <StatusBadge status={r.payment_method} /> },
                { key: 'amount', header: 'Amount', align: 'right', render: (r) => formatPKR(r.amount) },
              ]} />
            )}
          </div>
        )}
      </Card>

      {modal === 'transfer' && <TransferModal open admission={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'checkin' && <CheckInModal open admission={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'cancel' && <CancelAdmissionModal open admission={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'checkout' && <CheckoutModal open admission={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'fee' && <FeeStructureModal open admission={a} feeTypes={feeTypes} onClose={() => setModal(null)} onDone={done} />}
      <ConfirmDialog
        open={Boolean(stopLine)}
        title="Stop this charge?"
        message={`${stopLine?.fee_type_name} (${formatPKR(stopLine?.amount)}) will not be included in future monthly invoices.`}
        confirmLabel="Stop charge"
        onCancel={() => setStopLine(null)}
        onConfirm={async () => {
          try {
            await api.delete(`/admissions/${a.id}/fee-structures/${stopLine.id}`);
            toast.success('Charge stopped');
            reload();
          } catch (e) {
            toast.error(e.userMessage);
          }
          setStopLine(null);
        }}
      />
    </div>
  );
}
