import type { ZodTypeAny } from 'zod';

export interface FieldCommonOptions<T = unknown> {
  required?: boolean;
  default?: T;
  unique?: boolean;
  indexed?: boolean;
  /** stored, but stripped from every HTTP response — e.g. a password hash. */
  sensitive?: boolean;
  /** this field is written under a different, undeclared input key — e.g. `passwordHash`
   * declares `writeAs: 'password'` because a pipeline fn (`hashPassword`) synthesizes the real
   * column from a plaintext `password` key that never appears in `fields`. Read by admin
   * metadata (src/admin/serialize-model.ts) so a generated form knows which key to submit under. */
  writeAs?: string;
}

interface BaseFieldDefinition {
  required: boolean;
  default?: unknown;
  unique: boolean;
  indexed: boolean;
  sensitive: boolean;
  writeAs?: string;
}

export interface StringFieldDefinition extends BaseFieldDefinition {
  kind: 'string';
  maxLength?: number;
}

export interface TextFieldDefinition extends BaseFieldDefinition {
  kind: 'text';
}

export interface IntegerFieldDefinition extends BaseFieldDefinition {
  kind: 'integer';
}

export interface DecimalFieldDefinition extends BaseFieldDefinition {
  kind: 'decimal';
  precision: number;
  scale: number;
}

export interface BooleanFieldDefinition extends BaseFieldDefinition {
  kind: 'boolean';
}

export interface DatetimeFieldDefinition extends BaseFieldDefinition {
  kind: 'datetime';
}

export interface EnumFieldDefinition extends BaseFieldDefinition {
  kind: 'enum';
  values: readonly string[];
}

export interface JsonFieldDefinition extends BaseFieldDefinition {
  kind: 'json';
  schema?: ZodTypeAny;
}

export interface ReferenceFieldDefinition extends BaseFieldDefinition {
  kind: 'reference';
  targetModel: string;
}

/** Names a model itself (e.g. `'users'`), not a row within one — unlike `ReferenceFieldDefinition`
 * there's no fixed `targetModel`: any model in the app's registry is a valid value. Validation
 * against the live registry happens at request time (see `ratchet/auth`'s `requireValidPermissionTarget`),
 * not here — `baseSchemaForField` treats it as a plain string, since no registry exists yet when a
 * model file's static field definitions are evaluated. `allowWildcard` is UI-only metadata (see
 * `AdminFieldMeta`/`fields.tsx`): it doesn't loosen validation, it just tells the admin form
 * whether to offer a `*` option alongside real model names. */
export interface ModelRefFieldDefinition extends BaseFieldDefinition {
  kind: 'modelRef';
  allowWildcard: boolean;
}

/** Names an *operation* (e.g. `'create'`) rather than declaring a fixed set of them — the real
 * set is whichever operation names actually exist across the app's models, read from the live
 * registry at request time (see `ratchet/auth`'s `requireValidPermissionTarget`), the same way
 * `ModelRefFieldDefinition` reads model names. `allowWildcard` mirrors `ModelRefFieldDefinition`'s. */
export interface ActionRefFieldDefinition extends BaseFieldDefinition {
  kind: 'actionRef';
  allowWildcard: boolean;
}

export type FieldDefinition =
  | StringFieldDefinition
  | TextFieldDefinition
  | IntegerFieldDefinition
  | DecimalFieldDefinition
  | BooleanFieldDefinition
  | DatetimeFieldDefinition
  | EnumFieldDefinition
  | JsonFieldDefinition
  | ReferenceFieldDefinition
  | ModelRefFieldDefinition
  | ActionRefFieldDefinition;

function assertNoRequiredDefaultConflict(opts: FieldCommonOptions): void {
  if (opts.required && opts.default !== undefined) {
    throw new Error(
      "field declares both 'required: true' and a 'default' — a field with a default is never absent, so 'required' is contradictory. Remove one.",
    );
  }
}

function base(opts: FieldCommonOptions): BaseFieldDefinition {
  assertNoRequiredDefaultConflict(opts);
  return {
    required: opts.required ?? false,
    default: opts.default,
    unique: opts.unique ?? false,
    indexed: opts.indexed ?? false,
    sensitive: opts.sensitive ?? false,
    writeAs: opts.writeAs,
  };
}

export const field = {
  string(opts: { maxLength?: number } & FieldCommonOptions<string> = {}): StringFieldDefinition {
    return { ...base(opts), kind: 'string', maxLength: opts.maxLength };
  },

  text(opts: FieldCommonOptions<string> = {}): TextFieldDefinition {
    return { ...base(opts), kind: 'text' };
  },

  integer(opts: FieldCommonOptions<number> = {}): IntegerFieldDefinition {
    return { ...base(opts), kind: 'integer' };
  },

  decimal(opts: { precision: number; scale: number } & FieldCommonOptions<string>): DecimalFieldDefinition {
    return { ...base(opts), kind: 'decimal', precision: opts.precision, scale: opts.scale };
  },

  boolean(opts: FieldCommonOptions<boolean> = {}): BooleanFieldDefinition {
    return { ...base(opts), kind: 'boolean' };
  },

  datetime(opts: FieldCommonOptions<Date | string> = {}): DatetimeFieldDefinition {
    return { ...base(opts), kind: 'datetime' };
  },

  enum<const T extends readonly string[]>(
    values: T,
    opts: FieldCommonOptions<T[number]> = {},
  ): EnumFieldDefinition {
    if (values.length === 0) {
      throw new Error('field.enum() requires at least one value');
    }
    return { ...base(opts), kind: 'enum', values };
  },

  json(opts: { schema?: ZodTypeAny } & FieldCommonOptions = {}): JsonFieldDefinition {
    return { ...base(opts), kind: 'json', schema: opts.schema };
  },

  reference(targetModel: string, opts: FieldCommonOptions<string> = {}): ReferenceFieldDefinition {
    return { ...base(opts), kind: 'reference', targetModel };
  },

  modelRef(opts: { allowWildcard?: boolean } & FieldCommonOptions<string> = {}): ModelRefFieldDefinition {
    return { ...base(opts), kind: 'modelRef', allowWildcard: opts.allowWildcard ?? false };
  },

  actionRef(opts: { allowWildcard?: boolean } & FieldCommonOptions<string> = {}): ActionRefFieldDefinition {
    return { ...base(opts), kind: 'actionRef', allowWildcard: opts.allowWildcard ?? false };
  },
};
