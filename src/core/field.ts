import type { ZodTypeAny } from 'zod';

export interface FieldCommonOptions<T = unknown> {
  required?: boolean;
  default?: T;
  unique?: boolean;
  indexed?: boolean;
}

interface BaseFieldDefinition {
  required: boolean;
  default?: unknown;
  unique: boolean;
  indexed: boolean;
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

export type FieldDefinition =
  | StringFieldDefinition
  | TextFieldDefinition
  | IntegerFieldDefinition
  | DecimalFieldDefinition
  | BooleanFieldDefinition
  | DatetimeFieldDefinition
  | EnumFieldDefinition
  | JsonFieldDefinition
  | ReferenceFieldDefinition;

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
};
