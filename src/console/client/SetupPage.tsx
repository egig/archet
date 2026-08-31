import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ApiRequestError } from './api.js';
import { useAuth } from './auth.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';

/** Shown instead of `/login` until `GET /api/auth/setup` reports a root admin already exists
 * (see `useAuth().setupRequired`). Creates the one `*:*` user via `POST /api/auth/setup` and
 * signs them in, same as a fresh login — and, in the same request, a `Provider` (this form's
 * API key) plus the built-in `Ratchet` `Agent` wired to the new Root role, so the instance has a
 * chat-ready assistant from the first login rather than an empty `Agents` list. */
export function SetupPage() {
  const { loading, setupRequired, completeSetup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [providerKind, setProviderKind] = useState<'anthropic' | 'openai'>('anthropic');
  const [providerApiKey, setProviderApiKey] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !setupRequired) return <Navigate to="/login" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await completeSetup({
        email,
        password,
        providerApiKey,
        providerKind,
        providerUrl: providerUrl.length > 0 ? providerUrl : undefined,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'SETUP_ALREADY_COMPLETE'
          ? 'A root admin was already created — sign in instead.'
          : 'Setup failed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-foreground">Create the root admin</h1>
        <p className="mb-6 text-sm text-muted-foreground">This is a one-time setup step — this account gets full access.</p>

        <div className="mb-3 space-y-1.5">
          <Label htmlFor="setup-email">Email</Label>
          <Input
            id="setup-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="mb-3 space-y-1.5">
          <Label htmlFor="setup-password">Password</Label>
          <Input
            id="setup-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="mb-4 space-y-1.5">
          <Label htmlFor="setup-confirm-password">Confirm password</Label>
          <Input
            id="setup-confirm-password"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <hr className="mb-4 border-border" />
        <p className="mb-3 text-sm text-muted-foreground">
          This also sets up <span className="font-medium text-foreground">Ratchet</span>, the built-in assistant — it needs a
          model provider to talk to.
        </p>

        <div className="mb-3 space-y-1.5">
          <Label htmlFor="setup-provider">Provider</Label>
          <select
            id="setup-provider"
            value={providerKind}
            onChange={(e) => setProviderKind(e.target.value as 'anthropic' | 'openai')}
            className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI-compatible</option>
          </select>
        </div>

        <div className="mb-3 space-y-1.5">
          <Label htmlFor="setup-provider-key">API key</Label>
          <Input
            id="setup-provider-key"
            type="password"
            required
            value={providerApiKey}
            onChange={(e) => setProviderApiKey(e.target.value)}
          />
        </div>

        <div className="mb-4 space-y-1.5">
          <Label htmlFor="setup-provider-url">Base URL (optional)</Label>
          <Input
            id="setup-provider-url"
            type="url"
            placeholder="https://..."
            value={providerUrl}
            onChange={(e) => setProviderUrl(e.target.value)}
          />
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Creating…' : 'Create root admin'}
        </Button>
      </form>
    </div>
  );
}
