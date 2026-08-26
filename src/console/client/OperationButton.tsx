import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ConsoleFieldMeta, ConsoleOperationMeta } from '../serialize-model.js';
import { ApiRequestError, callOperation } from './api.js';
import { Dialog } from './Dialog.js';
import { FieldInput, type FileFieldValue } from './fields.js';
import { datetimeLocalToIso } from './format.js';

type ParamValues = Record<string, string | boolean | FileFieldValue>;

/** Evaluates `operation.visibleWhen` (core/model.ts's `OperationVisibilityRule`, Q13) against the
 * row the console already has — a flat single-field comparison, since the rule has to be
 * JSON-serializable metadata rather than code (see `ConsoleOperationMeta`). No rule, or no row yet
 * (still loading), always renders the button. */
function isOperationVisible(operation: ConsoleOperationMeta, row: Record<string, unknown> | null): boolean {
  const rule = operation.visibleWhen;
  if (!rule || !row) return true;
  const actual = row[rule.field];
  if (rule.equals !== undefined) return actual === rule.equals;
  if (rule.notEquals !== undefined) return actual !== rule.notEquals;
  if (rule.in !== undefined) return rule.in.includes(actual);
  return true;
}

function initialParamValues(fields: ConsoleFieldMeta[]): ParamValues {
  const values: ParamValues = {};
  for (const f of fields) {
    values[f.key] = f.kind === 'boolean' ? false : '';
  }
  return values;
}

/** Builds the request body from a param form's values — every param is required/optional per its
 * own `field.*()` declaration (core/validation.ts's `buildParamsSchema` enforces the same rule
 * server-side); there's no `writeAs`/"leave unchanged" concept here, unlike `ModelFormPage`'s
 * create/update form — a param always has exactly one value per call. */
function buildParamsPayload(fields: ConsoleFieldMeta[], values: ParamValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.key];
    switch (f.kind) {
      case 'boolean':
        payload[f.key] = Boolean(raw);
        break;
      case 'integer':
        if (raw === '' || raw === undefined) {
          if (f.required) payload[f.key] = raw;
          break;
        }
        payload[f.key] = Number(raw);
        break;
      case 'json':
        if (raw === '' || raw === undefined) {
          if (f.required) payload[f.key] = raw;
          break;
        }
        payload[f.key] = JSON.parse(raw as string);
        break;
      case 'datetime':
        if (raw === '' || raw === undefined) {
          if (f.required) payload[f.key] = raw;
          break;
        }
        payload[f.key] = datetimeLocalToIso(raw as string);
        break;
      case 'file': {
        const stored = raw as FileFieldValue | undefined;
        if (stored?.key) payload[f.key] = { key: stored.key, filename: stored.filename, mimeType: stored.mimeType, size: stored.size };
        break;
      }
      default:
        if ((raw === '' || raw === undefined) && !f.required) break;
        payload[f.key] = raw;
    }
  }
  return payload;
}

interface OperationParamsDialogProps {
  operation: ConsoleOperationMeta;
  modelName: string;
  onCancel: () => void;
  onSubmit: (params: Record<string, unknown>) => Promise<void>;
}

/** The small modal form Q14 asked for — one per param-taking operation, built the same way
 * `ModelFormPage` builds a create/update form (same `FieldInput`, same field-permission-aware
 * behavior it already has), just scoped to `operation.params` instead of a model's own fields. */
function OperationParamsDialog({ operation, modelName, onCancel, onSubmit }: OperationParamsDialogProps) {
  const [values, setValues] = useState<ParamValues>(() => initialParamValues(operation.params));
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await onSubmit(buildParamsPayload(operation.params, values));
    } catch (err) {
      if (err instanceof SyntaxError) {
        setFormError('One of the JSON fields is not valid JSON.');
      } else if (err instanceof ApiRequestError) {
        setFormError(err.fields ? null : err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setFormError(err instanceof Error ? err.message : 'operation failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog onClose={onCancel}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{operation.label}</h2>
      {formError && <p className="mb-4 text-sm text-red-600">{formError}</p>}
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {operation.params.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="mb-1 block text-gray-700">
              {f.label}
              {f.required && <span className="text-red-500"> *</span>}
            </span>
            <FieldInput
              field={f}
              inputKey={f.key}
              value={values[f.key]}
              onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value as string | boolean | FileFieldValue }))}
              error={fieldErrors[f.key]}
              mode="create"
              modelName={modelName}
            />
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export interface OperationButtonProps {
  modelName: string;
  id: string;
  /** the record's current values, for `visibleWhen` (Q13) — `null` while still loading, in which
   * case the button always renders (nothing to hide it based on yet). */
  row: Record<string, unknown> | null;
  operation: ConsoleOperationMeta;
  /** called after a successful call, so the caller can refetch the row/list. */
  onDone: () => void;
  className?: string;
}

/** One custom operation's button (`RowTable`'s row actions, `ModelFormPage`'s detail-page actions
 * — Q6's `placement`). A param-less operation fires on click (with a `window.confirm` first if
 * `operation.confirm` is set, matching the existing Delete button's pattern); a param-taking one
 * opens `OperationParamsDialog` instead (Q14) — that dialog's own submit doubles as the
 * confirmation step, so `confirm` has no effect when `operation.params` is non-empty. */
export function OperationButton({ modelName, id, row, operation, onDone, className }: OperationButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (params?: Record<string, unknown>) => callOperation(modelName, id, operation.name, params),
    onSuccess: () => onDone(),
  });

  if (!isOperationVisible(operation, row)) return null;

  function handleClick() {
    if (operation.params.length > 0) {
      setOpen(true);
      return;
    }
    if (operation.confirm) {
      const message = typeof operation.confirm === 'string' ? operation.confirm : `${operation.label}?`;
      if (!window.confirm(message)) return;
    }
    setError(null);
    mutation.mutateAsync(undefined).catch((err: unknown) => setError(err instanceof Error ? err.message : 'operation failed'));
  }

  return (
    <>
      <button type="button" onClick={handleClick} className={className ?? 'mr-3 text-gray-600 hover:underline'}>
        {operation.label}
      </button>
      {error && <span className="ml-1 text-xs text-red-600">{error}</span>}
      {open && (
        <OperationParamsDialog
          operation={operation}
          modelName={modelName}
          onCancel={() => setOpen(false)}
          onSubmit={async (params) => {
            await mutation.mutateAsync(params);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
