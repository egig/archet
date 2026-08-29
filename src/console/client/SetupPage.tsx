import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ApiRequestError } from './api.js';
import { useAuth } from './auth.js';

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">Create the root admin</h1>
        <p className="mb-6 text-sm text-gray-500">This is a one-time setup step — this account gets full access.</p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-gray-700">Email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-gray-700">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-gray-700">Confirm password</span>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </label>

        <hr className="mb-4 border-gray-200" />
        <p className="mb-3 text-sm text-gray-500">
          This also sets up <span className="font-medium text-gray-700">Ratchet</span>, the built-in assistant — it needs a model
          provider to talk to.
        </p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-gray-700">Provider</span>
          <select
            value={providerKind}
            onChange={(e) => setProviderKind(e.target.value as 'anthropic' | 'openai')}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI-compatible</option>
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-gray-700">API key</span>
          <input
            type="password"
            required
            value={providerApiKey}
            onChange={(e) => setProviderApiKey(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-gray-700">Base URL (optional)</span>
          <input
            type="url"
            placeholder="https://..."
            value={providerUrl}
            onChange={(e) => setProviderUrl(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </label>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create root admin'}
        </button>
      </form>
    </div>
  );
}
