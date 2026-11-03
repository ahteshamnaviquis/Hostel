import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Save } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterDate, FilterSelect } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';
import EmptyState from '../../components/common/EmptyState';
import Alert from '../../components/common/Alert';
import { PageLoader } from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { formatDate, formatPercent, todayISO, monthISO, formatMonth } from '../../utils/formatters';

const STATUSES = [
  { value: 'present', label: 'P', title: 'Present', active: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'absent', label: 'A', title: 'Absent', active: 'bg-red-600 text-white border-red-600' },
  { value: 'leave', label: 'L', title: 'Leave', active: 'bg-sky-600 text-white border-sky-600' },
  { value: 'late', label: 'Late', title: 'Late entry', active: 'bg-amber-500 text-white border-amber-500' },
];

/** Chooses which hostel to work on when "All hostels" is selected. */
function useWorkingHostel() {
  const { defaultHostelId, activeHostels } = useHostel();
  const [local, setLocal] = useState('');
  const id = defaultHostelId || local;
  const picker = !defaultHostelId && (
    <FilterSelect value={local} onChange={setLocal} placeholder="Select hostel..." options={activeHostels.map((h) => ({ value: String(h.id), label: h.name }))} />
  );
  return [id, picker];
}

function DailySheet() {
  const toast = useToast();
  const [hostelId, picker] = useWorkingHostel();
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const { data, meta, loading, error, reload } = useFetch('/attendance/sheet', { hostel_id: hostelId, date, search }, { enabled: Boolean(hostelId) });
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMarks(Object.fromEntries(data.map((r) => [r.resident_id, { status: r.status || '', entry_time: r.entry_time?.slice(0, 5) || '', remarks: r.remarks || '' }])));
  }, [data]);

  const setMark = (id, patch) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  const markAll = (status) => setMarks((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, status: v.status || status }])));
  const counts = useMemo(() => Object.values(marks).reduce((acc, m) => ({ ...acc, [m.status || 'unmarked']: (acc[m.status || 'unmarked'] || 0) + 1 }), {}), [marks]);

  const save = async () => {
    const records = Object.entries(marks).filter(([, m]) => m.status).map(([id, m]) => ({ resident_id: Number(id), status: m.status, entry_time: m.status === 'late' ? m.entry_time || null : null, remarks: m.remarks }));
    if (!records.length) return toast.error('Mark at least one resident');
    setSaving(true);
    try {
      const { data: res } = await api.post('/attendance', { hostel_id: hostelId, attendance_date: date, records });
      toast.success(res.message);
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Toolbar>
        {picker}
        <FilterDate label="Date" value={date} onChange={(v) => v <= todayISO() && setDate(v)} />
        <SearchInput className="sm:w-60" placeholder="Name, reg. no or room..." value={search} onChange={setSearch} />
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" size="sm" icon={CheckCheck} onClick={() => markAll('present')} disabled={!data?.length}>Mark unmarked present</Button>
          <Button size="sm" icon={Save} loading={saving} onClick={save} disabled={!data?.length}>Save attendance</Button>
        </div>
      </Toolbar>
      {!hostelId ? <EmptyState title="Select a hostel" message="Choose a hostel to mark attendance." /> : loading && !data ? <PageLoader /> : (
        <>
          {data?.length > 0 && (
            <div className="flex flex-wrap gap-4 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-600">
              <span>Residents: <b>{meta.total}</b></span>
              {['present', 'absent', 'leave', 'late', 'unmarked'].map((k) => <span key={k}>{k[0].toUpperCase() + k.slice(1)}: <b>{counts[k] || 0}</b></span>)}
              {data.some((r) => r.attendance_id) && <span className="text-brand-700">Saved earlier today - saving again updates the same records (no duplicates).</span>}
            </div>
          )}
          <DataTable rows={data} error={error} onRetry={reload} rowKey="resident_id" emptyTitle="No residents staying on this date" columns={[
            { key: 'full_name', header: 'Resident', render: (r) => <div><div className="font-medium text-slate-800">{r.full_name}</div><div className="text-xs text-slate-500">{r.registration_no}</div></div> },
            { key: 'room', header: 'Room / Bed', render: (r) => (r.room_number ? `${r.room_number} / ${r.bed_number}` : '-') },
            {
              key: 'status', header: 'Attendance',
              render: (r) => (
                <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${r.full_name}`}>
                  {STATUSES.map((s) => (
                    <button key={s.value} type="button" role="radio" aria-checked={marks[r.resident_id]?.status === s.value} title={s.title}
                      onClick={() => setMark(r.resident_id, { status: s.value })}
                      className={`h-8 min-w-8 rounded-md border px-2 text-xs font-semibold ${marks[r.resident_id]?.status === s.value ? s.active : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              ),
            },
            { key: 'entry_time', header: 'Entry time', render: (r) => marks[r.resident_id]?.status === 'late' ? <input type="time" value={marks[r.resident_id]?.entry_time || ''} onChange={(e) => setMark(r.resident_id, { entry_time: e.target.value })} className="h-8 rounded-md border border-slate-300 px-2 text-sm" aria-label="Entry time" /> : <span className="text-slate-300">-</span> },
            { key: 'remarks', header: 'Remarks', render: (r) => <input value={marks[r.resident_id]?.remarks || ''} onChange={(e) => setMark(r.resident_id, { remarks: e.target.value })} className="h-8 w-48 rounded-md border border-slate-300 px-2 text-sm" placeholder="Optional" aria-label="Remarks" /> },
          ]} />
        </>
      )}
    </>
  );
}

function MonthlyReport() {
  const [hostelId, picker] = useWorkingHostel();
  const [month, setMonth] = useState(monthISO());
  const { data, loading, error, reload } = useFetch('/attendance/monthly', { hostel_id: hostelId, month }, { enabled: Boolean(hostelId) });
  return (
    <>
      <Toolbar>
        {picker}
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2.5 text-sm" aria-label="Month" />
        <span className="text-sm text-slate-500">{formatMonth(month)}</span>
      </Toolbar>
      {!hostelId ? <EmptyState title="Select a hostel" /> : (
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} rowKey="resident_id" emptyTitle="No attendance recorded this month" columns={[
          { key: 'full_name', header: 'Resident', render: (r) => <div><div className="font-medium text-slate-800">{r.full_name}</div><div className="text-xs text-slate-500">{r.registration_no}</div></div> },
          { key: 'present', header: 'Present', align: 'right' },
          { key: 'absent', header: 'Absent', align: 'right', render: (r) => <span className={r.absent > 0 ? 'text-red-600' : ''}>{r.absent}</span> },
          { key: 'leave', header: 'Leave', align: 'right' },
          { key: 'late', header: 'Late', align: 'right' },
          { key: 'marked', header: 'Days marked', align: 'right' },
          { key: 'attendance_percent', header: 'Attendance', align: 'right', render: (r) => <span className={r.attendance_percent < 75 ? 'font-semibold text-red-600' : 'font-semibold'}>{formatPercent(r.attendance_percent)}</span> },
        ]} />
      )}
    </>
  );
}

function History() {
  const { hostelId } = useHostel();
  const [filters, setFilters] = useState({ from: '', to: '', status: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/attendance/history', { ...filters, hostel_id: hostelId });
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  return (
    <>
      <Toolbar>
        <FilterSelect value={filters.status} onChange={set('status')} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s.value, label: s.title }))} />
        <FilterDate label="From" value={filters.from} onChange={set('from')} />
        <FilterDate label="To" value={filters.to} onChange={set('to')} />
      </Toolbar>
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No records" columns={[
        { key: 'attendance_date', header: 'Date', render: (r) => formatDate(r.attendance_date) },
        { key: 'full_name', header: 'Resident', render: (r) => `${r.full_name} (${r.registration_no})` },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'entry_time', header: 'Entry', render: (r) => r.entry_time?.slice(0, 5) || '-' },
        { key: 'remarks', header: 'Remarks' },
        { key: 'marked_by_name', header: 'Marked by' },
      ]} />
      <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}

export default function AttendancePage() {
  useDocumentTitle('Attendance');
  const [tab, setTab] = useState('daily');
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Attendance" description="Daily roll call: present, absent, leave and late entries." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Attendance' }]} />
      <Alert type="info" className="mb-4">Only residents who are checked in on the selected date appear on the sheet. One record per resident per day.</Alert>
      <Card bodyClassName="p-0">
        <div className="px-4"><Tabs active={tab} onChange={setTab} tabs={[{ key: 'daily', label: 'Daily attendance' }, { key: 'monthly', label: 'Monthly report' }, { key: 'history', label: 'History' }]} /></div>
        {tab === 'daily' && <DailySheet />}
        {tab === 'monthly' && <MonthlyReport />}
        {tab === 'history' && <History />}
      </Card>
    </div>
  );
}
