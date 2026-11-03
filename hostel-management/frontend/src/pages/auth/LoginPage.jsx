import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, LogIn, Hotel } from 'lucide-react';
import FormField from '../../components/common/FormField';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import ApiStatus from '../../components/common/ApiStatus';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useAuth } from '../../context/AuthContext';
import { APP_NAME } from '../../utils/constants';
import { canAccess, firstAllowedPath } from '../../utils/navigation';

function validate({ identifier, password }) {
  const errors = {};
  if (!identifier.trim()) errors.identifier = 'Email or username is required';
  else if (identifier.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())) errors.identifier = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return errors;
}

/** Login page: POST /api/auth/login, stores the JWT and opens the first allowed page. */
export default function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, status, user, sessionMessage } = useAuth();
  const [form, setForm] = useState({ identifier: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  if (status === 'authenticated' && user) return <Navigate to={firstAllowedPath(user)} replace />;

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validate(form);
    setErrors(validationErrors);
    setServerError('');
    if (Object.keys(validationErrors).length) return;
    setSubmitting(true);
    try {
      const loggedIn = await login(form.identifier.trim(), form.password, form.remember);
      const from = location.state?.from;
      const target = from && from !== '/login' ? from : firstAllowedPath(loggedIn);
      navigate(canAccess(loggedIn, {}) ? target : '/profile', { replace: true });
    } catch (error) {
      setServerError(error.userMessage);
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Hotel className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold text-slate-900">{APP_NAME}</span>
      </div>

      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Welcome back. Please enter your account details.</p>

      {(serverError || sessionMessage) && (
        <Alert type={serverError ? 'error' : 'warning'} className="mt-6">
          {serverError || sessionMessage}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <FormField
          label="Email or username"
          name="identifier"
          type="text"
          autoComplete="username"
          placeholder="admin@yourhostel.pk"
          icon={Mail}
          value={form.identifier}
          onChange={onChange}
          error={errors.identifier}
          required
        />
        <FormField
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          icon={Lock}
          value={form.password}
          onChange={onChange}
          error={errors.password}
          required
          rightElement={
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <label className="flex items-center gap-2 whitespace-nowrap text-slate-600">
            <input type="checkbox" name="remember" checked={form.remember} onChange={onChange} className="h-4 w-4 rounded border-slate-300 accent-brand-700" />
            Keep me signed in
          </label>
          <span className="text-xs text-slate-500">Forgot password? Contact your Super Admin.</span>
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting} icon={LogIn}>
          Sign in
        </Button>
      </form>

      <div className="mt-8 flex justify-center">
        <ApiStatus />
      </div>
    </div>
  );
}
