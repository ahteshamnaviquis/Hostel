import Badge from './Badge';
import { statusLabel, statusTone } from '../../utils/status';

/** Badge with consistent colour + label for any status value. */
export default function StatusBadge({ status, label }) {
  if (!status) return <span className="text-slate-400">-</span>;
  return <Badge tone={statusTone(status)}>{label || statusLabel(status)}</Badge>;
}
