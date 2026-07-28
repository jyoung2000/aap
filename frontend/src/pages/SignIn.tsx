import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { AuthShell } from './auth-shared';

export function SignIn() {
  const { user, signin } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={params.get('next') || '/'} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signin(email, password);
      navigate(params.get('next') || '/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      setError(msg);
      toast.error('Sign in failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold tracking-tightest">Welcome back</h2>
      <p className="mt-1 text-sm text-muted">Sign in to your account to continue.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Email">
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-danger dark:bg-red-950/40" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don't have an account?{' '}
        <Link to="/signup" className="font-medium text-accent-600 hover:underline dark:text-accent-300">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
