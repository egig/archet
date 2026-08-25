import { useMemo } from 'react';
import type { ConsoleFieldMeta } from '../serialize-model.js';
import { useReferenceOptions } from './fields.js';
import { isoToDatetimeLocal, datetimeLocalToIso } from './format.js';

export type FilterClause = [string, string, unknown];

/** Client-side mirror of `router/fields.ts`'s `OPERATORS_BY_KIND` — presentation-only (which
 * operators make sense to offer per field kind), not shared across the client/server boundary.
 * `in` is left out of the manual builder: it needs a multi-value input this v1 doesn't have: an
 * agent can still set it via a tool call, a human just can't build one by hand yet. */
const OPERATORS_BY_KIND: Record<string, string[]> = {
  string: ['=', '!=', 'like', 'is'],
  text: ['=', '!=', 'like', 'is'],
  integer: ['=', '!=', '>', '>=', '<', '<=', 'is'],
  decimal: ['=', '!=', '>', '>=', '<', '<=', 'is'],
  boolean: ['=', '!=', 'is'],
  datetime: ['=', '!=', '>', '>=', '<', '<=', 'is'],
  enum: ['=', '!=', 'is'],
  reference: ['=', '!=', 'is'],
  modelRef: ['=', '!=', 'is'],
  actionRef: ['=', '!=', 'is'],
  file: ['is'],
};

const selectClass = 'rounded border border-gray-300 px-2 py-1 text-sm';

function FilterValueInput({
  field,
  value,
  onChange,
}: {
  field: ConsoleFieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const referenceOptions = useReferenceOptions(field.kind === 'reference' ? field.targetModel : undefined);

  if (field.kind === 'boolean') {
    return (
      <select value={String(value) === 'true' ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')} className={selectClass}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (field.kind === 'enum') {
    return (
      <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {field.values?.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'reference') {
    return (
      <select
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
        disabled={referenceOptions === null}
      >
        <option value="">{referenceOptions === null ? 'Loading…' : 'Select…'}</option>
        {referenceOptions?.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'integer' || field.kind === 'decimal') {
    return (
      <input
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={`w-28 ${selectClass}`}
      />
    );
  }

  if (field.kind === 'datetime') {
    return (
      <input
        type="datetime-local"
        value={isoToDatetimeLocal(value)}
        onChange={(e) => onChange(datetimeLocalToIso(e.target.value))}
        className={selectClass}
      />
    );
  }

  return (
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
    />
  );
}

function FilterClauseRow({
  fields,
  clause,
  onChange,
  onRemove,
}: {
  fields: ConsoleFieldMeta[];
  clause: FilterClause;
  onChange: (clause: FilterClause) => void;
  onRemove: () => void;
}) {
  const [fieldKey, op, value] = clause;
  const field = fields.find((f) => f.key === fieldKey) ?? fields[0]!;
  const ops = OPERATORS_BY_KIND[field.kind] ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={fieldKey}
        onChange={(e) => {
          const next = fields.find((f) => f.key === e.target.value)!;
          const nextOps = OPERATORS_BY_KIND[next.kind] ?? [];
          onChange([next.key, nextOps[0] ?? '=', '']);
        }}
        className={selectClass}
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      <select value={op} onChange={(e) => onChange([fieldKey, e.target.value, e.target.value === 'is' ? null : value])} className={selectClass}>
        {ops.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>

      {op !== 'is' && <FilterValueInput field={field} value={value} onChange={(v) => onChange([fieldKey, op, v])} />}

      <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline">
        Remove
      </button>
    </div>
  );
}

export interface FilterBarProps {
  /** the target model's full field list — filtered internally to `indexed` fields, mirroring the
   * server's `isFilterableOrSortable` gate (router/fields.ts). */
  fields: ConsoleFieldMeta[];
  value: FilterClause[];
  onChange: (value: FilterClause[]) => void;
}

/** Manual filter-clause builder for a `WorkspaceView` tab — add/remove `[field, op, value]`
 * clauses, the exact shape `router/query.ts`'s `FilterClause[]` consumes. */
export function FilterBar({ fields, value, onChange }: FilterBarProps) {
  const filterable = useMemo(() => fields.filter((f) => f.indexed), [fields]);

  if (filterable.length === 0) return null;

  function addClause() {
    const first = filterable[0]!;
    const ops = OPERATORS_BY_KIND[first.kind] ?? [];
    onChange([...value, [first.key, ops[0] ?? '=', '']]);
  }

  return (
    <div className="mb-4 space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
      {value.map((clause, i) => (
        <FilterClauseRow
          key={i}
          fields={filterable}
          clause={clause}
          onChange={(next) => onChange(value.map((c, idx) => (idx === i ? next : c)))}
          onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
        />
      ))}
      <button type="button" onClick={addClause} className="text-sm text-gray-600 hover:underline">
        + Add filter
      </button>
    </div>
  );
}
