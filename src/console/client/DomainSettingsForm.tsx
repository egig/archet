import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ConsoleFieldMeta } from '../serialize-model.js';
import type { ConsoleDomainMeta } from '../serialize-domain.js';
import { ApiRequestError, getDomainSettings, updateDomainSettings } from './api.js';
import { FieldInput, type FileFieldValue } from './fields.js';
import { queryKeys } from './query-keys.js';
import { datetimeLocalToIso, isoToDatetimeLocal } from './format.js';

type FormValues = Record<string, string | boolean | FileFieldValue>;

// Mirrors ModelFormPage's initialValues/buildPayload, minus the create-vs-update/writeAs/sensitive
// handling a model record has and a Domain's settings never do (ADR 0002: settings are always a
// single patch against the one row a Domain has).
function toFormValues(fields: ConsoleFieldMeta[], values: Record<string, unknown>): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (f.kind === 'boolean') {
      out[f.key] = Boolean(raw);
    } else if (f.kind === 'datetime') {
      out[f.key] = isoToDatetimeLocal(raw);
    } else if (f.kind === 'json') {
      out[f.key] = raw === undefined || raw === null ? '' : JSON.stringify(raw, null, 2);
    } else if (f.kind === 'file') {
      if (raw && typeof raw === 'object') out[f.key] = raw as FileFieldValue;
    } else {
      out[f.key] = raw === undefined || raw === null ? '' : String(raw);
    }
  }
  return out;
}

function toPayload(fields: ConsoleFieldMeta[], values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.key];
    switch (f.kind) {
      case 'boolean':
        payload[f.key] = Boolean(raw);
        break;
      case 'integer':
        if (raw === '' || raw === undefined) break;
        payload[f.key] = Number(raw);
        break;
      case 'json':
        if (raw === '' || raw === undefined) break;
        payload[f.key] = JSON.parse(raw as string);
        break;
      case 'datetime':
        if (raw === '' || raw === undefined) break;
        payload[f.key] = datetimeLocalToIso(raw as string);
        break;
      case 'file': {
        const stored = raw as FileFieldValue | undefined;
        if (stored?.key) {
          payload[f.key] = { key: stored.key, filename: stored.filename, mimeType: stored.mimeType, size: stored.size };
        }
        break;
      }
      default:
        if (raw === '' || raw === undefined) break;
        payload[f.key] = raw;
    }
  }
  return payload;
}

/** The settings form for one Domain — rendered by `SettingsPage` for whichever Domain tab is
 * active. Split out of what used to be `DomainSettingsPage` so the tab container can remount this
 * per Domain (via `key`) instead of every field needing to reset itself on tab switch. */
export function DomainSettingsForm({ domain }: { domain: ConsoleDomainMeta }) {
  const settingsQuery = useQuery({
    queryKey: queryKeys.domainSettings(domain.name),
    queryFn: () => getDomainSettings(domain.name),
  });

  const [values, setValues] = useState<FormValues>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setValues(toFormValues(domain.fields, settingsQuery.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateDomainSettings(domain.name, payload),
  });

  const loadError =
    settingsQuery.error instanceof Error
      ? settingsQuery.error.message
      : settingsQuery.error
        ? 'failed to load settings'
        : null;

  if (settingsQuery.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;

  function handleChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value as string | boolean | FileFieldValue }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSaved(false);
    try {
      const payload = toPayload(domain.fields, values);
      const data = await updateMutation.mutateAsync(payload);
      setValues(toFormValues(domain.fields, data));
      setSaved(true);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setFormError('One of the JSON fields is not valid JSON.');
      } else if (err instanceof ApiRequestError) {
        setFormError(err.fields ? null : err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setFormError(err instanceof Error ? err.message : 'save failed');
      }
    }
  }

  return (
    <div className="max-w-xl">
      {(formError ?? loadError) && <p className="mb-4 text-sm text-red-600">{formError ?? loadError}</p>}
      {saved && <p className="mb-4 text-sm text-green-600">Saved.</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {domain.fields.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="mb-1 block text-gray-700">{f.label}</span>
            <FieldInput field={f} inputKey={f.key} value={values[f.key]} onChange={handleChange} error={fieldErrors[f.key]} mode="update" />
          </label>
        ))}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
