import { useHostel } from '../../context/HostelContext';
import { SelectField } from './Fields';
import { FilterSelect } from './Toolbar';

/** Hostel dropdown for forms (only hostels the user can access). */
export function HostelField({ value, onChange, error, required = true, name = 'hostel_id', label = 'Hostel', disabled, onlyActive = true }) {
  const { hostels, activeHostels } = useHostel();
  const list = onlyActive ? activeHostels : hostels;
  return (
    <SelectField
      label={label}
      name={name}
      value={value}
      onChange={onChange}
      error={error}
      required={required}
      disabled={disabled || list.length === 1}
      options={list.map((h) => ({ value: String(h.id), label: `${h.name} (${h.city})` }))}
      placeholder={list.length === 1 ? null : 'Select hostel...'}
    />
  );
}

/** Hostel filter for list toolbars (hidden when the user has a single hostel). */
export function HostelFilter({ value, onChange }) {
  const { hostels } = useHostel();
  if (hostels.length <= 1) return null;
  return <FilterSelect value={value} onChange={onChange} placeholder="All hostels" label="Hostel" options={hostels.map((h) => ({ value: String(h.id), label: h.name }))} />;
}
