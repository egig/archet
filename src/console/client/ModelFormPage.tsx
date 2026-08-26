import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import type { ConsoleFieldMeta, ConsoleModelMeta } from '../serialize-model.js';
import { useModels } from './models.js';
import { useAuth } from './auth.js';
import { ApiRequestError, createRow, getRow, hasPermission, updateRow } from './api.js';
import { FieldInput, type FileFieldValue } from './fields.js';
import { OperationButton } from './OperationButton.js';
import { datetimeLocalToIso, isoToDatetimeLocal } from './format.js';

type FormValues = Record<string, string | boolean | FileFieldValue>;

function inputKeyFor(f: ConsoleFieldMeta): string {
  return f.writeAs ?? f.key;
}

function effectiveRequired(f: ConsoleFieldMeta, mode: 'create' | 'update'): boolean {
  return f.writeAs ? mode === 'create' && f.required : f.required;
}

function initialValues(model: ConsoleModelMeta, row: Record<string, unknown> | null): FormValues {
  const values: FormValues = {};
  for (const f of model.fields) {
    if (f.sensitive && !f.writeAs) continue; // never writable through a declared key
    const key = inputKeyFor(f);
    const raw = row ? row[f.key] : (f.default as unknown);
    if (f.kind === 'boolean') {
      values[key] = Boolean(raw);
    } else if (f.kind === 'datetime') {
      values[key] = isoToDatetimeLocal(raw);
    } else if (f.kind === 'json') {
      values[key] = raw === undefined || raw === null ? '' : JSON.stringify(raw, null, 2);
    } else if (f.kind === 'file') {
      // an existing record's `{ url, filename, mimeType, size }` (display-only — buildPayload
      // never resubmits this, only a fresh upload's `{ key, ... }`); absent entirely for "no file yet".
      if (raw && typeof raw === 'object') values[key] = raw as FileFieldValue;
    } else if (f.writeAs) {
      values[key] = ''; // password et al: never round-tripped from a read
    } else {
      values[key] = raw === undefined || raw === null ? '' : String(raw);
    }
  }
  return values;
}

function buildPayload(model: ConsoleModelMeta, values: FormValues, mode: 'create' | 'update'): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of model.fields) {
    if (f.sensitive && !f.writeAs) continue;
    const key = inputKeyFor(f);
    const raw = values[key];
    const required = effectiveRequired(f, mode);

    if (f.writeAs && mode === 'update' && (raw === '' || raw === undefined)) continue; // leave unchanged

    switch (f.kind) {
      case 'boolean':
        payload[key] = Boolean(raw);
        break;
      case 'integer':
        if (raw === '' || raw === undefined) {
          if (required) payload[key] = raw;
          break;
        }
        payload[key] = Number(raw);
        break;
      case 'json':
        if (raw === '' || raw === undefined) {
          if (required) payload[key] = raw;
          break;
        }
        payload[key] = JSON.parse(raw as string);
        break;
      case 'datetime':
        if (raw === '' || raw === undefined) {
          if (required) payload[key] = raw;
          break;
        }
        payload[key] = datetimeLocalToIso(raw as string);
        break;
      case 'file': {
        // only a fresh upload (has `key`) is ever resubmitted — an untouched existing file
        // (display-only `{ url, ... }`) is left out entirely, same "leave unchanged" convention
        // as writeAs/password on update; on create, omitting a required file is caught server-side.
        const stored = raw as FileFieldValue | undefined;
        if (stored?.key) payload[key] = { key: stored.key, filename: stored.filename, mimeType: stored.mimeType, size: stored.size };
        break;
      }
      default:
        if ((raw === '' || raw === undefined) && !required) break;
        payload[key] = raw;
    }
  }
  return payload;
}

export interface ModelFormPageProps {
  /** called after a successful save, or when Cancel is clicked — the caller decides what "done"
   * means (e.g. `ModelFormDialog` navigates back to the page the dialog is layered over). */
  onDone: () => void;
}

export function ModelFormPage({ onDone }: ModelFormPageProps) {
  const { model: modelName, id } = useParams<{ model: string; id?: string }>();
  const { getModel, loading: modelsLoading } = useModels();
  const { user } = useAuth();
  const model = modelName ? getModel(modelName) : undefined;
  const mode: 'create' | 'update' = id ? 'update' : 'create';

  const [values, setValues] = useState<FormValues>({});
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(mode === 'update');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;
    if (mode === 'create') {
      setValues(initialValues(model, null));
      return;
    }
    let cancelled = false;
    setLoading(true);
    getRow(model.name, id!)
      .then((fetchedRow) => {
        if (cancelled) return;
        setValues(initialValues(model, fetchedRow));
        setRow(fetchedRow);
      })
      .catch((err: unknown) => !cancelled && setFormError(err instanceof Error ? err.message : 'failed to load record'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.name, id]);

  if (modelsLoading || loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!model) return <p className="text-sm text-red-600">Unknown model.</p>;

  function handleChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value as string | boolean | FileFieldValue }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const payload = buildPayload(model!, values, mode);
      if (mode === 'create') {
        await createRow(model!.name, payload);
      } else {
        await updateRow(model!.name, id!, payload);
      }
      onDone();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setFormError('One of the JSON fields is not valid JSON.');
      } else if (err instanceof ApiRequestError) {
        setFormError(err.fields ? null : err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setFormError(err instanceof Error ? err.message : 'save failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function refetchRow() {
    if (mode !== 'update') return;
    const fetchedRow = await getRow(model!.name, id!);
    setValues(initialValues(model!, fetchedRow));
    setRow(fetchedRow);
  }

  const detailOperations =
    mode === 'update'
      ? model.operations.filter((op) => op.placement.includes('detail') && hasPermission(user?.permissions ?? [], model.name, op.name))
      : [];

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-gray-900">
        {mode === 'create' ? `New ${model.label.replace(/s$/, '')}` : `Edit ${model.label.replace(/s$/, '')}`}
      </h1>

      {formError && <p className="mb-4 text-sm text-red-600">{formError}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {model.fields
          .filter((f) => !f.sensitive || f.writeAs)
          .map((f) => {
            const key = inputKeyFor(f);
            return (
              <label key={key} className="block text-sm">
                <span className="mb-1 block text-gray-700">
                  {f.label}
                  {effectiveRequired(f, mode) && <span className="text-red-500"> *</span>}
                </span>
                <FieldInput
                  field={f}
                  inputKey={key}
                  value={values[key]}
                  onChange={handleChange}
                  error={fieldErrors[key] ?? (f.writeAs ? fieldErrors[f.key] : undefined)}
                  mode={mode}
                  modelName={model.name}
                />
              </label>
            );
          })}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>

      {detailOperations.length > 0 && (
        <div className="mt-4 flex gap-4 border-t border-gray-200 pt-4">
          {detailOperations.map((op) => (
            <OperationButton
              key={op.name}
              modelName={model.name}
              id={id!}
              row={row}
              operation={op}
              onDone={() => void refetchRow()}
              className="text-sm text-gray-600 hover:underline"
            />
          ))}
        </div>
      )}
    </div>
  );
}
