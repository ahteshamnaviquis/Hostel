import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';

/** Debounced search box. Calls onChange(value) after typing stops. */
export default function SearchInput({ value = '', onChange, placeholder = 'Search...', className = '' }) {
  const [text, setText] = useState(value);
  const debounced = useDebounce(text);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => setText(value), [value]);
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-8 text-sm placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      {text && (
        <button onClick={() => setText('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
