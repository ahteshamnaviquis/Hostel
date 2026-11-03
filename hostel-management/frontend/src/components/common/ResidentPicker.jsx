import { useEffect, useState } from 'react';
import SearchInput from './SearchInput';
import api from '../../services/api';

/** Searches active residents of a hostel. value = selected resident object or null. */
export default function ResidentPicker({ hostelId, value, onSelect, error, label = 'Resident', required, status = 'active' }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (search.length < 2) return setResults([]);
    api.get('/residents', { params: { search, hostel_id: hostelId || undefined, status, limit: 8 } }).then(({ data }) => setResults(data.data)).catch(() => setResults([]));
  }, [search, hostelId, status]);

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required && <span className="ml-0.5 text-red-600">*</span>}</span>
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span><b>{value.full_name}</b> <span className="text-slate-500">· {value.registration_no}{value.room_number ? ` · Room ${value.room_number}/${value.bed_number}` : ''}</span></span>
          <button type="button" className="text-xs font-medium text-brand-700" onClick={() => onSelect(null)}>Change</button>
        </div>
      ) : (
        <>
          <SearchInput placeholder="Type name, reg. no, mobile or room..." value={search} onChange={setSearch} />
          {results.length > 0 && (
            <ul className="mt-1 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { onSelect(r); setSearch(''); }} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <b>{r.full_name}</b> <span className="text-slate-500">· {r.registration_no}{r.room_number ? ` · Room ${r.room_number}/${r.bed_number}` : ''} · {r.hostel_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search.length >= 2 && !results.length && <p className="mt-1 text-xs text-slate-500">No active residents match.</p>}
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
