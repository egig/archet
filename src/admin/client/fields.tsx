import { useEffect, useState, type ReactNode } from 'react';
import type { AdminFieldMeta } from '../serialize-model.js';
import { listRows } from './api.js';
import { useModels } from './models.js';

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none';

export interface ReferenceOption {
  id: string;
  label: string;
}

/** Fetches up to 100 rows of a reference field's target model to populate a `<select>` — a
 * plain fetched-into-a-dropdown list, not a searchable/paginated combobox; fine for admin-scale
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
  field: AdminFieldMeta;
  inputKey: string;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  error?: string;
  /** create vs update — a `writeAs` (e.g. password) field is required on create but optional
   * (blank = leave unchanged) on update. */
  mode: 'create' | 'update';
}

export function FieldInput({ field, inputKey, value, onChange, error, mode }: FieldInputProps) {
  const referenceOptions = useReferenceOptions(field.kind === 'reference' ? field.targetModel : undefined);
  const required = field.writeAs ? mode === 'create' && field.required : field.required;

  const errorEl = error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null;
  const wrap = (input: ReactNode) => (
    <div>
      {input}
      {errorEl}
    </div>
  );

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
        <select
          required={required}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(inputKey, e.target.value)}
          className={inputClass}
          disabled={referenceOptions === null}
        >
          <option value="">{referenceOptions === null ? 'Loading…' : !required ? '—' : 'Select…'}</option>
          {referenceOptions?.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>,
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
