import { useEffect, useState } from 'react';
import SearchInput from '../common/SearchInput';
import StatusBadge from '../common/StatusBadge';
import api from '../../services/api';
import { useHostel } from '../../context/HostelContext';
import { formatPKR } from '../../utils/formatters';

/**
 * Finds a resident fee account (= admission). Preloads admissionId when given.
 * onSelect(account) receives { admission_id, full_name, outstanding, advance, ... }
 */
export default function AccountPicker({ value, onSelect, admissionId }) {
  const { hostelId } = useHostel();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!admissionId || value) return;
    api.get(`/admissions/${admissionId}`).then(({ data }) => {
      const a = data.data;
      onSelect({ admission_id: a.id, admission_no: a.admission_no, full_name: a.full_name, registration_no: a.registration_no, hostel_name: a.hostel_name,
        room_number: a.room_number, bed_number: a.bed_number, status: a.status, outstanding: a.balance.outstanding, advance: a.balance.advance, hostel_id: a.hostel_id });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissionId]);

  useEffect(() => {
    if (search.length < 2) return setResults([]);
    setLoading(true);
    api.get('/fees/accounts', { params: { search, hostel_id: hostelId || undefined, limit: 8 } })
      .then(({ data }) => setResults(data.data))
      .finally(() => setLoading(false));
  }, [search, hostelId]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">{value.full_name} <StatusBadge status={value.status} /></div>
          <div className="text-xs text-slate-500">{value.registration_no} · {value.admission_no} · {value.hostel_name}{value.room_number ? ` · ${value.room_number}/${value.bed_number}` : ''}</div>
          <div className="mt-1 text-xs"><span className="text-red-600">Outstanding {formatPKR(value.outstanding)}</span>{value.advance > 0 && <span className="ml-3 text-brand-700">Advance {formatPKR(value.advance)}</span>}</div>
        </div>
        <button type="button" onClick={() => onSelect(null)} className="text-xs font-medium text-brand-700">Change</button>
      </div>
    );
  }
  return (
    <div>
      <SearchInput placeholder="Search resident by name, reg. no, mobile, CNIC..." value={search} onChange={setSearch} />
      {search.length >= 2 && (
        <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {loading && <li className="px-4 py-3 text-sm text-slate-500">Searching...</li>}
          {!loading && !results.length && <li className="px-4 py-3 text-sm text-slate-500">No matching residents with a fee account.</li>}
          {results.map((r) => (
            <li key={r.admission_id}>
              <button type="button" onClick={() => onSelect(r)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                <span>
                  <span className="block text-sm font-medium text-slate-800">{r.full_name}</span>
                  <span className="block text-xs text-slate-500">{r.registration_no} · {r.hostel_name}{r.room_number ? ` · ${r.room_number}/${r.bed_number}` : ''}</span>
                </span>
                <span className="text-right text-xs"><span className="block text-red-600">{formatPKR(r.outstanding)}</span><StatusBadge status={r.status} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
