import { useMemo } from 'react';
import type { ConsoleFieldMeta } from '../serialize-model.js';
import { useReferenceOptions } from './fields.js';
import { isoToDatetimeLocal, datetimeLocalToIso } from './format.js';

export type FilterClause = [string, string, unknown];

/** One level of `(a AND b)`/`(a OR b)` grouping around plain clauses — mirrors `router/query.ts`'s
 * `FilterGroup` (see its doc comment for why groups don't nest inside groups). */
export type FilterGroupClause = ['and' | 'or', FilterClause[]];
export type FilterNode = FilterClause | FilterGroupClause;

function isGroup(node: FilterNode): node is FilterGroupClause {
  return node.length === 2 && (node[0] === 'and' || node[0] === 'or');
}

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

function newClause(filterable: ConsoleFieldMeta[]): FilterClause {
  const first = filterable[0]!;
  const ops = OPERATORS_BY_KIND[first.kind] ?? [];
  return [first.key, ops[0] ?? '=', ''];
}

function FilterGroupBox({
  fields,
  group,
  onChange,
  onRemove,
}: {
  fields: ConsoleFieldMeta[];
  group: FilterGroupClause;
  onChange: (group: FilterGroupClause) => void;
  onRemove: () => void;
}) {
  const [logic, conditions] = group;

  return (
    <div className="space-y-2 rounded border border-gray-300 bg-white p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          Match
          <select
            value={logic}
            onChange={(e) => onChange([e.target.value as 'and' | 'or', conditions])}
            className={selectClass}
          >
            <option value="and">all (AND)</option>
            <option value="or">any (OR)</option>
          </select>
          of:
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline">
          Remove group
        </button>
      </div>

      {conditions.map((clause, i) => (
        <FilterClauseRow
          key={i}
          fields={fields}
          clause={clause}
          onChange={(next) => onChange([logic, conditions.map((c, idx) => (idx === i ? next : c))])}
          onRemove={() => onChange([logic, conditions.filter((_, idx) => idx !== i)])}
        />
      ))}

      <button
        type="button"
        onClick={() => onChange([logic, [...conditions, newClause(fields)]])}
        className="text-sm text-gray-600 hover:underline"
      >
        + Add condition
      </button>
    </div>
  );
}

export interface FilterBarProps {
  /** the target model's full field list — filtered internally to `indexed` fields, mirroring the
   * server's `isFilterableOrSortable` gate (router/fields.ts). */
  fields: ConsoleFieldMeta[];
  value: FilterNode[];
  onChange: (value: FilterNode[]) => void;
}

/** Manual filter builder for a `WorkspaceView` tab — a flat, implicitly-AND'd list of `[field, op,
 * value]` clauses and/or `(a AND b)`/`(a OR b)` groups, the exact shape `router/query.ts`'s
 * `FilterNode[]` consumes. */
export function FilterBar({ fields, value, onChange }: FilterBarProps) {
  const filterable = useMemo(() => fields.filter((f) => f.indexed), [fields]);

  if (filterable.length === 0) return null;

  return (
    <div className="mb-4 space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
      {value.map((node, i) =>
        isGroup(node) ? (
          <FilterGroupBox
            key={i}
            fields={filterable}
            group={node}
            onChange={(next) => onChange(value.map((n, idx) => (idx === i ? next : n)))}
            onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
          />
        ) : (
          <FilterClauseRow
            key={i}
            fields={filterable}
            clause={node}
            onChange={(next) => onChange(value.map((n, idx) => (idx === i ? next : n)))}
            onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
          />
        ),
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChange([...value, newClause(filterable)])}
          className="text-sm text-gray-600 hover:underline"
        >
          + Add filter
        </button>
        <button
          type="button"
          onClick={() => onChange([...value, ['or', [newClause(filterable)]]])}
          className="text-sm text-gray-600 hover:underline"
        >
          + Add group
        </button>
      </div>
    </div>
  );
}
