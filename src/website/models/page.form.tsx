/**
 * The framework's own built-in console form for `Page` (see `../console-forms.ts`, wired into
 * codegen's `BUILTIN_FORMS` — `src/codegen/builtins.ts`), replacing the generated create/edit
 * form for `pages` — unless a consuming app authors its own `pages.form.tsx`, which takes
 * precedence.
 *
 * Why a custom form rather than the generated one: `status`/`publishedAt` must not be editable
 * inline (a plain `update` touching either is rejected by `page.model.ts`'s
 * `forbidPublishStateInUpdate` — publish state changes only through the `publish`/`unpublish`
 * operations), so this form shows them read-only with a publish toggle instead. Everything else —
 * `title`, `slug`, `metaDescription`, `navLocation`, `navOrder`, and the rich-text `body` — is
 * edited here directly through each field's own bound renderer.
 */
import { useEffect, useState } from 'react';
import { createRow, getRow, updateRow, callOperation, type ModelFormProps } from '../../console/client/index.js';

const EDITABLE = ['title', 'slug', 'metaDescription', 'navLocation', 'navOrder', 'body'] as const;

export default function PageForm({ model, mode, id, fields, onDone }: ModelFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<string>('draft');
  const [loading, setLoading] = useState(mode === 'update');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'update' || !id) return;
    let cancelled = false;
    void (async () => {
      const row = await getRow(model.name, id);
      if (cancelled) return;
      setValues({
        title: row.title,
        slug: row.slug,
        metaDescription: row.metaDescription,
        navLocation: row.navLocation,
        navOrder: row.navOrder,
        body: row.body,
      });
      setStatus((row.status as string) ?? 'draft');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  function onFieldChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await createRow(model.name, values);
      } else {
        await updateRow(model.name, id!, values);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await callOperation(model.name, id, status === 'published' ? 'unpublish' : 'publish');
      setStatus(status === 'published' ? 'draft' : 'published');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">{mode === 'create' ? 'New Page' : 'Edit Page'}</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {EDITABLE.map((key) => {
        const field = fields[key];
        if (!field) return null;
        return (
          <label key={key} className="block text-sm">
            <span className="mb-1 block text-gray-700">{field.meta.label}</span>
            {field.render({ value: values[key], onChange: onFieldChange })}
          </label>
        );
      })}

      {mode === 'update' && (
        <div className="flex items-center gap-3 rounded border border-gray-200 p-3 text-sm">
          <span className="text-gray-600">
            Status: <span className="font-medium text-gray-900">{status}</span>
          </span>
          <button
            type="button"
            onClick={() => void togglePublish()}
            disabled={saving}
            className="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
