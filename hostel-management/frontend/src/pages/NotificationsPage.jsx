import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Tabs from '../components/common/Tabs';
import Pagination from '../components/common/Pagination';
import EmptyState from '../components/common/EmptyState';
import { PageLoader } from '../components/common/Spinner';
import useFetch from '../hooks/useFetch';
import useDocumentTitle from '../hooks/useDocumentTitle';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime, humanize } from '../utils/formatters';

export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const { data, meta, loading, reload } = useFetch('/notifications', { page, limit: 20, unread: tab === 'unread' });

  const open = async (n) => {
    if (!n.is_read) await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    if (n.link) navigate(n.link);
    else reload();
  };

  const runReminders = async () => {
    setRunning(true);
    try {
      const { data: res } = await api.post('/notifications/run-reminders');
      toast.success(res.message);
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notifications"
        description="Fee reminders, overdue payments, upcoming checkouts, admissions, complaints and maintenance alerts."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Notifications' }]}
        actions={
          <>
            {isSuperAdmin && (
              <Button variant="secondary" icon={RefreshCw} loading={running} onClick={runReminders}>
                Run reminder check
              </Button>
            )}
            <Button variant="secondary" icon={CheckCheck} onClick={async () => { await api.patch('/notifications/read-all'); reload(); }}>
              Mark all read
            </Button>
          </>
        }
      />
      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs tabs={[{ key: 'all', label: 'All' }, { key: 'unread', label: 'Unread', count: meta?.unread }]} active={tab} onChange={(t) => { setTab(t); setPage(1); }} />
        </div>
        {loading && !data ? (
          <PageLoader />
        ) : !data?.length ? (
          <EmptyState icon={Bell} title="No notifications" message="You're all caught up." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={`flex w-full gap-3 px-5 py-4 text-left hover:bg-slate-50 ${n.is_read ? '' : 'bg-brand-50/40'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-slate-200' : 'bg-brand-600'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{n.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{humanize(n.type)}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{n.message}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {formatDateTime(n.created_at)}
                      {n.hostel_name ? ` · ${n.hostel_name}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={meta} onPageChange={setPage} />
      </Card>
    </div>
  );
}
