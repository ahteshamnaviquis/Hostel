import { useState } from 'react';
import { User, KeyRound } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Card from '../components/common/Card';
import FormField from '../components/common/FormField';
import Button from '../components/common/Button';
import StatusBadge from '../components/common/StatusBadge';
import { InfoGrid } from '../components/common/Fields';
import useForm from '../hooks/useForm';
import useDocumentTitle from '../hooks/useDocumentTitle';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils/formatters';

/** Own profile + password change (all roles). */
export default function ProfilePage() {
  useDocumentTitle('My Profile');
  const { user, setUser, replaceToken } = useAuth();
  const toast = useToast();
  const profile = useForm({ full_name: user.fullName, phone: user.phone || '' });
  const pwd = useForm({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profile.values.full_name.trim()) return profile.setErrors({ full_name: 'Full name is required' });
    setSaving(true);
    try {
      const { data } = await api.put('/auth/profile', profile.values);
      setUser(data.data);
      toast.success('Profile updated');
    } catch (error) {
      profile.applyServerErrors(error);
      toast.error(error.userMessage);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    const v = pwd.values;
    const errs = {};
    if (!v.current_password) errs.current_password = 'Current password is required';
    if (v.new_password.length < 8 || !/[A-Za-z]/.test(v.new_password) || !/\d/.test(v.new_password)) errs.new_password = 'At least 8 characters with letters and numbers';
    if (v.new_password !== v.confirm_password) errs.confirm_password = 'Passwords do not match';
    if (Object.keys(errs).length) return pwd.setErrors(errs);
    setChanging(true);
    try {
      const { data } = await api.put('/auth/change-password', { current_password: v.current_password, new_password: v.new_password });
      replaceToken(data.data.token);
      pwd.reset();
      toast.success('Password changed. Other sessions have been signed out.');
    } catch (error) {
      pwd.applyServerErrors(error);
      toast.error(error.userMessage);
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My Profile" description="Manage your account details and password." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Profile' }]} />
      <Card className="mb-6">
        <InfoGrid
          cols={4}
          items={[
            { label: 'Email', value: user.email },
            { label: 'Username', value: user.username },
            { label: 'Role', value: <StatusBadge status={user.role} /> },
            { label: 'Last login', value: formatDateTime(user.lastLoginAt) },
            { label: 'Assigned hostels', value: user.hostels.map((h) => h.name).join(', ') || 'None' },
            { label: 'Permissions', value: user.role === 'super_admin' ? 'Full access' : `${user.permissions.length} permission(s)` },
          ]}
        />
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Profile details" action={<User className="h-4 w-4 text-slate-400" />}>
          <form onSubmit={saveProfile} className="space-y-4" noValidate>
            <FormField label="Full name" required {...profile.field('full_name')} />
            <FormField label="Phone" placeholder="0300-1234567" {...profile.field('phone')} />
            <Button type="submit" loading={saving}>
              Save profile
            </Button>
          </form>
        </Card>
        <Card title="Change password" action={<KeyRound className="h-4 w-4 text-slate-400" />}>
          <form onSubmit={changePassword} className="space-y-4" noValidate>
            <FormField label="Current password" type="password" autoComplete="current-password" required {...pwd.field('current_password')} />
            <FormField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters with letters and numbers" required {...pwd.field('new_password')} />
            <FormField label="Confirm new password" type="password" autoComplete="new-password" required {...pwd.field('confirm_password')} />
            <Button type="submit" loading={changing}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
