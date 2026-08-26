import { useEffect, useState, type ReactNode } from 'react';
import type { ConsoleFieldMeta } from '../serialize-model.js';
import { listRows, uploadFile, type UploadedFile } from './api.js';
import { useModels } from './models.js';
import { useFieldRenderers } from './field-renderers.js';
import { ReferenceCombobox } from './ReferenceCombobox.js';

/** What a `file` field's form value looks like — either an existing record's read shape
 * (`{ url, filename, mimeType, size }`, from `deriveFileFields`) or a fresh upload's response
 * (`UploadedFile`, `{ key, filename, mimeType, size }`). Distinguished by which of `url`/`key`
 * is present; see `buildPayload` in `ModelFormPage.tsx`, which only resubmits the latter. */
export type FileFieldValue = { url?: string; key?: string; filename: string; mimeType: string; size: number };

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none';

export interface ReferenceOption {
  id: string;
  label: string;
}

/** Fetches up to 100 rows of a reference field's target model to populate a `<select>` — a
 * plain fetched-into-a-dropdown list, not a searchable/paginated combobox; fine for console-scale
 * lookups, not meant to scale to huge target tables. */
export function useReferenceOptions(targetModel: string | undefined): ReferenceOption[] | null {
  const { getModel } = useModels();
  const [options, setOptions] = useState<ReferenceOption[] | null>(null);

  useEffect(() => {
    if (!targetModel) return;
    let cancelled = false;
    const displayField = getModel(targetModel)?.displayField ?? 'id';
    listRows(targetModel, { limit: 100, offset: 0 })
      .then((page) => {
        if (cancelled) return;
        setOptions(
          page.rows.map((row) => ({
            id: String(row.id),
            label: String(row[displayField] ?? row.id),
          })),
        );
      })
      .catch(() => !cancelled && setOptions([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetModel]);

  return options;
}

export interface FieldInputProps {
  field: ConsoleFieldMeta;
  inputKey: string;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  error?: string;
  /** create vs update — a `writeAs` (e.g. password) field is required on create but optional
   * (blank = leave unchanged) on update. */
  mode: 'create' | 'update';
  /** only needed by `kind: 'file'`, to build its upload URL (`POST /api/:modelName/:field/upload`). */
  modelName?: string;
}

export function FieldInput(props: FieldInputProps) {
  const { field, inputKey, value, onChange, error, mode, modelName } = props;
  const { models: modelRefOptions } = useModels();
  const fieldRenderers = useFieldRenderers();
  const required = field.writeAs ? mode === 'create' && field.required : field.required;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const errorEl = error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null;
  const wrap = (input: ReactNode) => (
    <div>
      {input}
      {errorEl}
    </div>
  );

  const customRenderer = field.customType ? fieldRenderers[field.customType] : undefined;
  if (customRenderer) return customRenderer(props);

  switch (field.kind) {
    case 'text':
      return wrap(
        <textarea
          required={required}
          rows={3}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        />,
      );

    case 'json':
      return wrap(
        <textarea
          required={required}
          rows={5}
          spellCheck={false}
          placeholder="{}"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={`${inputClass} font-mono`}
        />,
      );

    case 'boolean':
      return wrap(
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(inputKey, e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />,
      );

    case 'integer':
      return wrap(
        <input
          type="number"
          step={1}
          required={required}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        />,
      );

    case 'decimal':
      return wrap(
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          required={required}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        />,
      );

    case 'datetime':
      return wrap(
        <input
          type="datetime-local"
          required={required}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        />,
      );

    case 'enum':
      return wrap(
        <select
          required={required}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        >
          {!required && <option value="">—</option>}
          {field.values?.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>,
      );

    case 'reference':
      return wrap(
        <ReferenceCombobox
          targetModel={field.targetModel ?? ''}
          value={(value as string) ?? ''}
          onChange={(v) => onChange(inputKey, v)}
          required={required}
        />,
      );

    case 'modelRef':
      return wrap(
        <select
          required={required}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        >
          {!required && <option value="">—</option>}
          {field.allowWildcard && <option value="*">* (all resources)</option>}
          {modelRefOptions.map((m) => (
            <option key={m.name} value={m.name}>
              {m.label}
            </option>
          ))}
        </select>,
      );

    case 'actionRef': {
      const actionOptions = [...new Set(modelRefOptions.flatMap((m) => m.operationNames))].sort();
      return wrap(
        <select
          required={required}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        >
          {!required && <option value="">—</option>}
          {field.allowWildcard && <option value="*">* (all actions)</option>}
          {actionOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>,
      );
    }

    case 'file': {
      const stored = value as FileFieldValue | undefined;
      return wrap(
        <div>
          {stored && (
            <div className="mb-2 flex items-center gap-2">
              {field.preview === 'image' && stored.url && (
                <img
                  src={stored.url}
                  alt={stored.filename}
                  className="h-16 w-16 rounded border border-gray-200 object-cover"
                />
              )}
              <span className="text-sm text-gray-600">{stored.filename}</span>
            </div>
          )}
          <input
            type="file"
            accept={field.accept}
            required={required && !stored}
            disabled={uploading || !modelName}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (!picked || !modelName) return;
              setUploading(true);
              setUploadError(null);
              uploadFile(modelName, field.key, picked)
                .then((result: UploadedFile) => onChange(inputKey, result))
                .catch((err: unknown) => setUploadError(err instanceof Error ? err.message : 'upload failed'))
                .finally(() => setUploading(false));
            }}
            className={inputClass}
          />
          {uploading && <p className="mt-1 text-xs text-gray-500">Uploading…</p>}
          {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
        </div>,
      );
    }

    // No live cross-field dropdown (the field this names lives on whichever model a *sibling*
    // `resource` value points at, which this component doesn't have visibility into) — falls
    // through to a plain text input, same as 'string', with a hint about the wildcard.
    case 'fieldRef':
      return wrap(
        <input
          type="text"
          required={required}
          placeholder={field.allowWildcard ? "field name, or '*' for every field" : 'field name'}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        />,
      );

    case 'string':
    default:
      return wrap(
        <input
          type={field.writeAs ? 'password' : 'text'}
          required={required}
          maxLength={field.kind === 'string' ? field.maxLength : undefined}
          placeholder={field.writeAs && mode === 'update' ? 'Leave blank to keep unchanged' : undefined}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
        />,
      );
  }
}
