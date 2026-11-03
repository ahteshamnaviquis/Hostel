import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const STYLES = {
  success: { box: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
  error: { box: 'bg-red-50 text-red-800 border-red-200', Icon: AlertCircle },
  warning: { box: 'bg-amber-50 text-amber-800 border-amber-200', Icon: AlertTriangle },
  info: { box: 'bg-sky-50 text-sky-800 border-sky-200', Icon: Info },
};

/** Inline success / error / warning / info message. */
export default function Alert({ type = 'info', title, children, className = '' }) {
  const { box, Icon } = STYLES[type];
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${box} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}
