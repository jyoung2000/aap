import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { AuthShell, passwordStrength } from './auth-shared';

export function SignUp() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  const strength = passwordStrength(password);
  const tooShort = password.length > 0 && password.length < 8;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await signup(email, password);
      toast.success('Account created', 'Welcome to JobPilot.');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign up failed';
      setError(msg);
      toast.error('Sign up failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold tracking-tightest">Create your account</h2>
      <p className="mt-1 text-sm text-muted">Start finding and applying to jobs automatically.</p>

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
        <Field label="Password" help="At least 8 characters.">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              required
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        {password.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex h-1.5 flex-1 gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'h-full flex-1 rounded-full transition-colors',
                    i < strength.score
                      ? strength.score <= 2
                        ? 'bg-warning'
                        : strength.score <= 3
                          ? 'bg-accent-500'
                          : 'bg-success'
                      : 'bg-[rgb(var(--surface-2))]',
                  )}
                />
              ))}
            </div>
            <span className={cn('text-[11.5px]', tooShort ? 'text-warning' : 'text-subtle')}>{strength.label}</span>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-danger dark:bg-red-950/40" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/signin" className="font-medium text-accent-600 hover:underline dark:text-accent-300">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
