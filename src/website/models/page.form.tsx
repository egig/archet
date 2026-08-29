/**
 * The framework's own built-in console form for `Page` (see `../console-forms.ts`, wired into
 * codegen's `BUILTIN_FORMS` — `src/codegen/builtins.ts`), replacing the generated create/edit
 * form for `pages` the same way `auth/models/role.form.tsx` replaces `roles`' — unless a
 * consuming app authors its own `pages.form.tsx`, which takes precedence.
 *
 * The generated form would include a `blocks` multi-select (every `referenceToMany` field renders
 * as one — see `console/client/fields.tsx`), letting someone "attach" existing `Block` rows to a
 * page. That's never the right way to build a page's content — blocks are per-type, ordered, and
 * meant to be authored in place — so this form only edits the page's own metadata (`title`,
 * `slug`, `metaDescription`, `isHome`) and hands off to the Page Builder screen
 * (`console/client/PageBuilderPage.tsx`) for everything else: a brand-new page is created here and
 * immediately opened there; an existing page gets a link there plus the publish/unpublish toggle
 * (`status`/`publishedAt` can't be written through this form at all — `page.model.ts`'s
 * `forbidPublishStateInUpdate` rejects a plain update touching either, on purpose).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { createRow, getRow, updateRow, callOperation, type ModelFormProps } from '../../console/client/index.js';

export default function PageForm({ model, mode, id, fields, onDone }: ModelFormProps) {
  const navigate = useNavigate();
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
      setValues({ title: row.title, slug: row.slug, metaDescription: row.metaDescription, isHome: row.isHome });
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
        const row = await createRow(model.name, values);
        navigate(`/page-builder/${row.id as string}`);
        return;
      }
      await updateRow(model.name, id!, values);
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

      <label className="block text-sm">
        <span className="mb-1 block text-gray-700">{fields.title!.meta.label}</span>
        {fields.title!.render({ value: values.title, onChange: onFieldChange })}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-gray-700">{fields.slug!.meta.label}</span>
        {fields.slug!.render({ value: values.slug, onChange: onFieldChange })}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-gray-700">{fields.metaDescription!.meta.label}</span>
        {fields.metaDescription!.render({ value: values.metaDescription, onChange: onFieldChange })}
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={values.isHome === true}
          onChange={(e) => onFieldChange('isHome', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Home page (served at <code>/</code>)
      </label>

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
          <button
            type="button"
            onClick={() => navigate(`/page-builder/${id}`)}
            className="ml-auto rounded bg-gray-900 px-3 py-1 text-white hover:bg-gray-800"
          >
            Edit content →
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
          {saving ? 'Saving…' : mode === 'create' ? 'Create & edit content' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
