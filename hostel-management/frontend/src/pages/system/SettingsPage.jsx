import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import ErrorState from '../../components/common/ErrorState';
import { CheckboxField, SelectField } from '../../components/common/Fields';
import { PageLoader } from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, humanize } from '../../utils/formatters';

const GROUP_TITLES = {
  general: ['General', 'Application name, currency and date format'],
  receipt: ['Receipts & invoices', 'Numbering prefixes and receipt footer'],
  fees: ['Fee generation', 'Due dates, generation day and late fines'],
  notifications: ['Notifications', 'In-app reminders (email / SMS / WhatsApp can be added later)'],
};
const DATE_FORMATS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'];

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const toast = useToast();
  const { refresh } = useAuth();
  const { data, loading, error, reload } = useFetch('/settings');
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.map((s) => [s.setting_key, s.value])));
  }, [data]);
  const groups = useMemo(() => (data || []).reduce((acc, s) => ({ ...acc, [s.setting_group]: [...(acc[s.setting_group] || []), s] }), {}), [data]);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const { data: res } = await api.put('/settings', { settings: values });
      toast.success(res.message);
      reload();
      refresh();
    } catch (e) {
      setErrors(e.fieldErrors);
      toast.error(e.userMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <PageLoader />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;

  const renderField = (s) => {
    const common = { name: s.setting_key, error: errors[s.setting_key], hint: s.description };
    const label = humanize(s.setting_key);
    if (s.value_type === 'boolean') {
      return <CheckboxField key={s.setting_key} label={s.description || label} checked={values[s.setting_key]} onChange={(e) => setValues((v) => ({ ...v, [s.setting_key]: e.target.checked }))} />;
    }
    if (s.setting_key === 'date_format') {
      return <SelectField key={s.setting_key} label={label} placeholder={null} options={DATE_FORMATS.map((f) => ({ value: f, label: f }))} value={values[s.setting_key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [s.setting_key]: e.target.value }))} {...common} />;
    }
    return (
      <FormField key={s.setting_key} label={label} type={s.value_type === 'number' ? 'number' : 'text'} min={s.value_type === 'number' ? 0 : undefined}
        value={values[s.setting_key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [s.setting_key]: e.target.value }))} {...common} />
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="System Settings" description="Platform-wide configuration. Hostel information is managed on each hostel's page." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Settings' }]} actions={<Button icon={Save} loading={saving} onClick={save}>Save settings</Button>} />
      <div className="space-y-6">
        {Object.entries(groups).map(([group, list]) => (
          <Card key={group} title={GROUP_TITLES[group]?.[0] || humanize(group)} subtitle={GROUP_TITLES[group]?.[1]}>
            <div className={`grid grid-cols-1 gap-4 ${group === 'notifications' ? '' : 'sm:grid-cols-2'}`}>{list.map(renderField)}</div>
            {list.some((s) => s.updated_by_name) && (
              <p className="mt-4 text-xs text-slate-400">Last changed {formatDateTime(list.reduce((a, s) => (s.updated_at > a ? s.updated_at : a), ''))}</p>
            )}
          </Card>
        ))}
      </div>
      <div className="mt-6 flex justify-end"><Button icon={Save} loading={saving} onClick={save}>Save settings</Button></div>
    </div>
  );
}
