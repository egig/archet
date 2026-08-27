import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertNoDuplicateNames, assertReferencesResolve, scanModels } from './scan.js';
import { assertDomainMatchesFolder, assertNoDuplicateDomainNames, scanDomains } from './scan-domains.js';
import { assertFormModelsResolve, assertNoDuplicateFormModels, scanForms } from './scan-forms.js';
import { assertFieldInputsResolve, assertNoDuplicateFieldInputs, scanFieldInputs } from './scan-field-inputs.js';
import { BUILTIN_DOMAINS, BUILTIN_FORMS, BUILTIN_MODELS } from './builtins.js';
import { generateSchemaSource } from './schema-gen.js';
import { generateValidatorsSource } from './validators-gen.js';
import { generateRegistrySource } from './registry-gen.js';
import { generateDomainsSource } from './domains-gen.js';
import { generateCustomFormsSource } from './forms-gen.js';
import { generateFieldInputsSource } from './field-inputs-gen.js';

export interface GenerateOptions {
  modelsDir: string;
  generatedDir: string;
}

export interface GenerateResult {
  modelCount: number;
  domainCount: number;
  formCount: number;
  fieldInputCount: number;
  files: string[];
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const scanned = [...BUILTIN_MODELS, ...(await scanModels(opts.modelsDir))];
  assertNoDuplicateNames(scanned);
  assertReferencesResolve(scanned);

  const scannedDomains = [...BUILTIN_DOMAINS, ...(await scanDomains(opts.modelsDir))];
  assertNoDuplicateDomainNames(scannedDomains);
  assertDomainMatchesFolder(opts.modelsDir, scannedDomains);

  const scannedForms = await scanForms(opts.modelsDir);
  assertNoDuplicateFormModels(scannedForms);
  assertFormModelsResolve(scannedForms, new Set(scanned.map((s) => s.model.name)));
  // a scanned (consumer-authored) form takes precedence over a same-named builtin — not a
  // duplicate-form error the way two scanned forms for one model would be (assertNoDuplicateFormModels
  // above): an app is meant to be able to fully replace, say, Role's own console form with its own
  // `roles.form.tsx` without first having to know the builtin exists to avoid a collision.
  const scannedFormModelNames = new Set(scannedForms.map((f) => f.modelName));
  const forms = [...BUILTIN_FORMS.filter((f) => !scannedFormModelNames.has(f.modelName)), ...scannedForms];

  const scannedFieldInputs = await scanFieldInputs(opts.modelsDir);
  assertNoDuplicateFieldInputs(scannedFieldInputs);
  assertFieldInputsResolve(scannedFieldInputs, scanned);

  await mkdir(opts.generatedDir, { recursive: true });

  const schemaSrc = generateSchemaSource(scanned);
  const validatorsSrc = generateValidatorsSource(scanned, opts.generatedDir);
  const registrySrc = generateRegistrySource(scanned, opts.generatedDir);
  const domainsSrc = generateDomainsSource(scannedDomains, opts.generatedDir);
  const customFormsSrc = generateCustomFormsSource(forms, opts.generatedDir);
  const fieldInputsSrc = generateFieldInputsSource(scannedFieldInputs, opts.generatedDir);

  const schemaFile = path.join(opts.generatedDir, 'schema.ts');
  const validatorsFile = path.join(opts.generatedDir, 'validators.ts');
  const registryFile = path.join(opts.generatedDir, 'registry.ts');
  const domainsFile = path.join(opts.generatedDir, 'domains.ts');
  const customFormsFile = path.join(opts.generatedDir, 'console-forms.ts');
  const fieldInputsFile = path.join(opts.generatedDir, 'console-field-inputs.ts');

  await writeFile(schemaFile, schemaSrc, 'utf8');
  await writeFile(validatorsFile, validatorsSrc, 'utf8');
  await writeFile(registryFile, registrySrc, 'utf8');
  await writeFile(domainsFile, domainsSrc, 'utf8');
  await writeFile(customFormsFile, customFormsSrc, 'utf8');
  await writeFile(fieldInputsFile, fieldInputsSrc, 'utf8');

  return {
    modelCount: scanned.length,
    domainCount: scannedDomains.length,
    formCount: forms.length,
    fieldInputCount: scannedFieldInputs.length,
    files: [schemaFile, validatorsFile, registryFile, domainsFile, customFormsFile, fieldInputsFile],
  };
}
