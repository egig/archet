export { field } from './field.js';
export type {
  FieldDefinition,
  FieldCommonOptions,
  StringFieldDefinition,
  TextFieldDefinition,
  IntegerFieldDefinition,
  DecimalFieldDefinition,
  BooleanFieldDefinition,
  DatetimeFieldDefinition,
  EnumFieldDefinition,
  JsonFieldDefinition,
  ReferenceFieldDefinition,
  ModelRefFieldDefinition,
  ActionRefFieldDefinition,
  FieldRefFieldDefinition,
  FileFieldDefinition,
} from './field.js';

export { DEFAULT_MAX_FILE_SIZE, sniffMimeType, matchesAccept } from './storage.js';
export type { FileStorageAdapter, StoredFile } from './storage.js';

export { defineModel, RESERVED_OPERATION_NAMES } from './model.js';
export type {
  ModelDefinition,
  OperationsConfig,
  DefineModelConfig,
  ConsoleModelOptions,
  CustomOperationDefinition,
  OperationEntry,
  OperationConsoleOptions,
  OperationVisibilityRule,
} from './model.js';

export { defineDomain } from './domain.js';
export type { DomainDefinition, DefineDomainConfig, ConsoleMenuItem } from './domain.js';

export { pipe, validate, persist, requireOwnsRow, PipelineError } from './pipeline.js';
export type { OperationContext, Operation, PipelineFn, PipelineErrorOptions } from './pipeline.js';

export { buildCreateSchema, buildUpdateSchema, buildDomainSettingsSchema, buildParamsSchema } from './validation.js';

export { getDomainSettings, updateDomainSettings } from './domain-settings-persistence.js';

export { generateId } from './id.js';

export { normalizeTimestamps, redactSensitiveFields, deriveFileFields } from './serialize.js';

export { defineConfig } from './config.js';
export type { FrameworkConfig } from './config.js';
