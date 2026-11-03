import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import api from '../../services/api';
import EmptyState from '../common/EmptyState';
import { timeAgo } from '../../utils/formatters';

const POLL_MS = 60 * 1000;

/** Top-bar notifications: unread badge, dropdown list, polling every minute. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { limit: 8 } });
      setItems(data.data);
      setUnread(data.meta.unread);
    } catch {
      /* ignore polling errors */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const handler = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.is_read) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      load();
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await api.patch('/notifications/read-all').catch(() => {});
    load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <EmptyState icon={Bell} title="You're all caught up" message="Fee, checkout and complaint alerts will appear here." />
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.is_read ? '' : 'bg-brand-50/40'}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-brand-600'}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                      <span className="block text-xs text-slate-600">{n.message}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {timeAgo(n.created_at)}
                        {n.hostel_name ? ` · ${n.hostel_name}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-brand-700 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
