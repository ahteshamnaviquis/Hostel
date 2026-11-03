import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Printer, Play, FileBarChart } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { FilterDate, FilterSelect } from '../../components/common/Toolbar';
import { PageLoader } from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api, { cleanParams, downloadFile } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { useAuth } from '../../context/AuthContext';
import { PAYMENT_METHODS } from '../../utils/constants';
import { formatDate, formatDateTime, formatNumber, formatPKR, formatPercent, monthISO, todayISO } from '../../utils/formatters';
import { statusLabel } from '../../utils/status';

const STATUS_FILTERS = {
  status: { label: 'Resident status', options: ['active', 'pending', 'checked_out', 'suspended', 'cancelled'] },
  room_status: { label: 'Room status', options: ['available', 'partially_occupied', 'fully_occupied', 'maintenance', 'inactive'] },
  admission_status: { label: 'Admission status', options: ['active', 'pending', 'checked_out', 'cancelled'] },
  complaint_status: { label: 'Complaint status', options: ['open', 'in_progress', 'resolved', 'rejected'] },
};

const formatCell = (value, type) => {
  if (value === null || value === undefined || value === '') return '-';
  if (type === 'money') return formatPKR(value);
  if (type === 'date') return formatDate(value);
  if (type === 'datetime') return formatDateTime(value);
  if (type === 'percent') return formatPercent(value);
  if (type === 'number') return formatNumber(value);
  return String(value).replace(/_/g, ' ');
};

export default function ReportsPage() {
  useDocumentTitle('Reports');
  const toast = useToast();
  const { hostelId, selectedHostel } = useHostel();
  const { user } = useAuth();
  const { data: reports, loading: listLoading } = useFetch('/reports');
  const { data: categories } = useFetch('/expense-categories');
  const [key, setKey] = useState('');
  const [filters, setFilters] = useState({ from: `${monthISO()}-01`, to: todayISO(), status: '', category_id: '', payment_method: '' });
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  const current = reports?.find((r) => r.key === key);
  const groups = useMemo(() => (reports || []).reduce((acc, r) => ({ ...acc, [r.group]: [...(acc[r.group] || []), r] }), {}), [reports]);
  useEffect(() => { if (reports?.length && !key) setKey(reports[0].key); }, [reports, key]);

  const params = () => {
    const f = current?.filters || [];
    return cleanParams({
      hostel_id: f.includes('hostel') ? hostelId : '',
      from: f.includes('dates') ? filters.from : '',
      to: f.includes('dates') ? filters.to : '',
      status: f.some((x) => STATUS_FILTERS[x]) ? filters.status : '',
      category_id: f.includes('category') ? filters.category_id : '',
      payment_method: f.includes('payment_method') ? filters.payment_method : '',
    });
  };

  const run = async () => {
    if (!current) return;
    setRunning(true);
    setError('');
    try {
      const { data } = await api.get(`/reports/${key}`, { params: params() });
      setReport(data.data);
    } catch (e) {
      setError(e.userMessage);
      setReport(null);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    setReport(null);
    setFilters((f) => ({ ...f, status: '' }));
  }, [key]);
  useEffect(() => {
    if (current) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hostelId]);

  const exportAs = async (format) => {
    setExporting(format);
    try {
      await downloadFile(`/reports/${key}`, { ...params(), format }, `${key}.${format}`);
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setExporting('');
    }
  };

  if (listLoading) return <PageLoader />;
  const statusFilter = current?.filters.find((f) => STATUS_FILTERS[f]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="no-print">
        <PageHeader title="Reports" description="Printable and exportable reports. Hostel filter follows the hostel selected in the top bar." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Reports' }]} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card title="Available reports" className="no-print lg:col-span-1" bodyClassName="p-2">
          {Object.entries(groups).map(([group, list]) => (
            <div key={group} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
              {list.map((r) => (
                <button key={r.key} onClick={() => setKey(r.key)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${key === r.key ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <FileBarChart className="h-4 w-4 shrink-0" /> {r.title}
                </button>
              ))}
            </div>
          ))}
        </Card>

        <div className="space-y-6 lg:col-span-3">
          {current && (
            <Card className="no-print" bodyClassName="flex flex-wrap items-end gap-3 p-4">
              {current.filters.includes('dates') && <><FilterDate label="From" value={filters.from} onChange={(v) => setFilters((f) => ({ ...f, from: v }))} /><FilterDate label="To" value={filters.to} onChange={(v) => setFilters((f) => ({ ...f, to: v }))} /></>}
              {statusFilter && <FilterSelect value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} placeholder={`Any ${STATUS_FILTERS[statusFilter].label.toLowerCase()}`} options={STATUS_FILTERS[statusFilter].options.map((s) => ({ value: s, label: statusLabel(s) }))} />}
              {current.filters.includes('category') && <FilterSelect value={filters.category_id} onChange={(v) => setFilters((f) => ({ ...f, category_id: v }))} placeholder="All categories" options={(categories || []).map((c) => ({ value: String(c.id), label: c.name }))} />}
              {current.filters.includes('payment_method') && <FilterSelect value={filters.payment_method} onChange={(v) => setFilters((f) => ({ ...f, payment_method: v }))} placeholder="All methods" options={PAYMENT_METHODS} />}
              <Button icon={Play} onClick={run} loading={running}>Run report</Button>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Button variant="secondary" icon={FileText} loading={exporting === 'pdf'} disabled={!report} onClick={() => exportAs('pdf')}>PDF</Button>
                <Button variant="secondary" icon={FileSpreadsheet} loading={exporting === 'xlsx'} disabled={!report} onClick={() => exportAs('xlsx')}>Excel</Button>
                <Button variant="secondary" icon={Printer} disabled={!report} onClick={() => window.print()}>Print</Button>
              </div>
            </Card>
          )}

          <Card bodyClassName="p-0" className="print:border-0 print:shadow-none">
            {running && !report ? <PageLoader message="Running report..." /> : error ? <ErrorState message={error} onRetry={run} /> : !report ? <EmptyState icon={FileBarChart} title="Choose a report" /> : (
              <>
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">{report.title}</h2>
                  <p className="text-xs text-slate-500">
                    {current?.filters.includes('hostel') ? (selectedHostel?.name || report.hostelName) : 'All hostels'}
                    {report.from && ` · ${formatDate(report.from)} to ${formatDate(report.to)}`} · Generated {formatDateTime(new Date().toISOString().slice(0, 19).replace('T', ' '))} by {user.fullName}
                  </p>
                </div>
                {report.summary?.length > 0 && (
                  <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-3 lg:grid-cols-5">
                    {report.summary.map((s) => (
                      <div key={s.label} className="bg-white px-4 py-3">
                        <div className="text-xs text-slate-500">{s.label}</div>
                        <div className="text-base font-semibold tabular-nums text-slate-900">{formatCell(s.value, s.type)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <DataTable
                  dense
                  rows={report.rows}
                  rowKey={(r, i) => i}
                  emptyTitle="No records for the selected filters"
                  columns={report.columns.map((c) => ({ key: c.key, header: c.label, align: ['money', 'number', 'percent'].includes(c.type) ? 'right' : undefined, render: (r) => formatCell(r[c.key], c.type) }))}
                />
                <p className="px-5 py-3 text-xs text-slate-400">{report.rows.length} row(s)</p>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
