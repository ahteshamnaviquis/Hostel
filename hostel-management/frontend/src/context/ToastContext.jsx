import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { Icon: CheckCircle2, color: 'text-emerald-600' },
  error: { Icon: AlertCircle, color: 'text-red-600' },
  info: { Icon: Info, color: 'text-sky-600' },
};

/** Success / error messages shown in the bottom-right corner. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (type, message) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-3), { id, type, message }]);
      setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3500);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6" aria-live="polite">
        {toasts.map(({ id, type, message }) => {
          const { Icon, color } = STYLES[type];
          return (
            <div key={id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} aria-hidden="true" />
              <p className="flex-1 text-sm text-slate-700">{message}</p>
              <button onClick={() => dismiss(id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
