import { BedSingle } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { PageLoader } from '../common/Spinner';
import EmptyState from '../common/EmptyState';
import { formatPKR } from '../../utils/formatters';
import { ROOM_TYPES, labelOf } from '../../utils/constants';

/**
 * Visual picker of rooms with free beds in a hostel.
 * onSelect(bed, room) ; selectedBedId ; excludeBedId (current bed on transfer)
 */
export default function BedPicker({ hostelId, selectedBedId, onSelect, excludeBedId }) {
  const { data: rooms, loading, error } = useFetch('/rooms/available', { hostel_id: hostelId }, { enabled: Boolean(hostelId) });
  if (!hostelId) return <p className="text-sm text-slate-500">Select a resident first.</p>;
  if (loading) return <PageLoader message="Loading available beds..." />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  const list = (rooms || []).map((r) => ({ ...r, free_beds: r.free_beds.filter((b) => b.id !== excludeBedId) })).filter((r) => r.free_beds.length);
  if (!list.length) return <EmptyState icon={BedSingle} title="No available beds" message="All beds in this hostel are occupied or under maintenance." />;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map((room) => (
        <div key={room.id} className={`rounded-xl border p-4 ${room.free_beds.some((b) => b.id === selectedBedId) ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-800">Room {room.room_number}</div>
              <div className="text-xs text-slate-500">{room.building_name} · {room.floor_name} · {labelOf(ROOM_TYPES, room.room_type)}</div>
            </div>
            <div className="text-right text-xs">
              <div className="font-medium text-slate-800">{formatPKR(room.monthly_rent)}/mo</div>
              <div className="text-slate-500">{room.available_beds} of {room.active_beds} free</div>
            </div>
          </div>
          {room.facilities && <div className="mt-2 truncate text-xs text-slate-500">{room.facilities}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {room.free_beds.map((bed) => {
              const active = bed.id === selectedBedId;
              return (
                <button
                  key={bed.id}
                  type="button"
                  onClick={() => onSelect(bed, room)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'border-brand-700 bg-brand-700 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400'
                  }`}
                >
                  <BedSingle className="h-3.5 w-3.5" /> {bed.bed_number}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
