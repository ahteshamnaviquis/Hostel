import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import Button from '../../components/common/Button';
import ErrorState from '../../components/common/ErrorState';
import { PageLoader } from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate, formatDateTime, formatPKR, formatMonth, humanize } from '../../utils/formatters';

/** Printable payment receipt (A5-friendly). */
export default function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: r, loading, error, reload } = useFetch(`/payments/${id}/receipt`);
  useDocumentTitle(r ? `Receipt ${r.receipt_no}` : 'Receipt');
  useEffect(() => {
    if (r && new URLSearchParams(window.location.search).get('print') === '1') setTimeout(() => window.print(), 300);
  }, [r]);

  if (loading && !r) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const row = (label, value) => (
    <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-slate-500">{label}</span><span className="text-right font-medium text-slate-800">{value || '-'}</span></div>
  );

  return (
    <div className="min-h-full bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-2xl justify-between px-4">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
        <Button icon={Printer} onClick={() => window.print()}>Print receipt</Button>
      </div>
      <div className="mx-auto max-w-2xl bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{r.hostel_name}</h1>
            <p className="text-sm text-slate-600">{r.hostel_address}{r.hostel_city ? `, ${r.hostel_city}` : ''}</p>
            <p className="text-sm text-slate-600">{[r.hostel_contact, r.hostel_email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Receipt</p>
            <p className="font-mono text-lg font-bold text-slate-900">{r.receipt_no}</p>
            {r.status === 'reversed' && <p className="mt-1 rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">REVERSED</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-8 py-4 sm:grid-cols-2">
          <div>
            {row('Resident', r.full_name)}
            {row('Father name', r.father_name)}
            {row('Registration no', r.registration_no)}
            {row('Room / Bed', r.room ? `${r.room.room_number} / ${r.room.bed_number}` : '-')}
          </div>
          <div>
            {row('Payment date', formatDate(r.payment_date))}
            {row('Payment method', r.payment_method_label)}
            {row('Reference', r.reference_no)}
            {row('Admission', r.admission_no)}
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Fee details</th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2 text-right">Amount paid</th>
            </tr>
          </thead>
          <tbody>
            {r.allocations.map((a) => (
              <tr key={a.invoice_id} className="border-b border-slate-100">
                <td className="px-3 py-2">{a.description}{a.billing_month && <span className="text-slate-500"> ({formatMonth(a.billing_month)})</span>}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.invoice_no}<div className="font-sans text-slate-500">{humanize(a.invoice_type)}</div></td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPKR(a.amount)}</td>
              </tr>
            ))}
            {r.unallocated_amount > 0 && (
              <tr className="border-b border-slate-100"><td className="px-3 py-2" colSpan={2}>Advance (credit for future fees)</td><td className="px-3 py-2 text-right tabular-nums">{formatPKR(r.unallocated_amount)}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 text-base font-bold"><td className="px-3 py-2" colSpan={2}>Amount paid</td><td className="px-3 py-2 text-right">{formatPKR(r.amount)}</td></tr>
            <tr className="text-sm"><td className="px-3 py-1 text-slate-500" colSpan={2}>Remaining balance</td><td className="px-3 py-1 text-right font-semibold">{formatPKR(r.remaining_balance)}</td></tr>
          </tfoot>
        </table>

        {r.remarks && <p className="mt-4 text-sm text-slate-600">Remarks: {r.remarks}</p>}
        {r.status === 'reversed' && <p className="mt-2 text-sm text-red-700">Reversed on {formatDateTime(r.reversed_at)} by {r.reversed_by_name}: {r.reversal_reason}</p>}

        <div className="mt-10 flex items-end justify-between text-sm">
          <div>
            <p className="text-slate-500">Received by</p>
            <p className="font-medium text-slate-800">{r.received_by_name}</p>
          </div>
          <div className="text-center">
            <div className="w-48 border-t border-slate-400 pt-1 text-xs text-slate-500">Signature & stamp</div>
          </div>
        </div>
        <p className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
          {r.settings.footer} · All amounts in {r.settings.currency} · Generated by {r.settings.appName}
        </p>
      </div>
    </div>
  );
}
