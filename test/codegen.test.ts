import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generate } from '../src/codegen/generate.js';

// Self-contained fixtures — deliberately not the real models/ directory, which is gitignored
// example "app" content (see DESIGN.md), not part of the framework's own tracked test suite.
const CORE_INDEX_FILE = fileURLToPath(new URL('../src/core/index.ts', import.meta.url));
const CORE_IMPORT = pathToFileURL(CORE_INDEX_FILE).href;

const CUSTOMER_MODEL = `
import { defineModel, field } from '${CORE_IMPORT}';

export const Customer = defineModel('customers', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
    email: field.string({ required: true, unique: true, indexed: true, maxLength: 320 }),
  },
});
`;

const INVOICE_MODEL = `
import { defineModel, field } from '${CORE_IMPORT}';

export const Invoice = defineModel('invoices', {
  fields: {
    customerId: field.reference('customers', { required: true, indexed: true }),
    amount: field.decimal({ precision: 10, scale: 2, required: true }),
    status: field.enum(['draft', 'sent', 'paid'], { default: 'draft', indexed: true }),
  },
});
`;

async function writeModelsDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'archet-models-'));
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(dir, name), contents, 'utf8');
  }
  return dir;
}

describe('generate() against a self-contained model fixture', () => {
  let modelsDir: string;
  let generatedDir: string;

  beforeEach(async () => {
    modelsDir = await writeModelsDir({
      'customer.model.ts': CUSTOMER_MODEL,
      'invoice.model.ts': INVOICE_MODEL,
    });
    generatedDir = await mkdtemp(path.join(os.tmpdir(), 'archet-gen-'));
  });

  afterEach(async () => {
    await rm(modelsDir, { recursive: true, force: true });
    await rm(generatedDir, { recursive: true, force: true });
  });

  it('emits a schema with §4 conventions: timestamptz, partial unique index, CHECK, RESTRICT FK', async () => {
    const { modelCount } = await generate({ modelsDir, generatedDir });
    expect(modelCount).toBe(2);

    const schemaSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'schema.ts'), 'utf8'),
    );

    expect(schemaSrc).toContain("timestamp('created_at', { withTimezone: true })");
    expect(schemaSrc).toContain("timestamp('deleted_at', { withTimezone: true })");
    expect(schemaSrc).toContain('uniqueIndex(');
    expect(schemaSrc).toContain('.where(sql`${table.deletedAt} IS NULL`)');
    expect(schemaSrc).toContain("check('invoices_status_check'");
    expect(schemaSrc).toContain("onDelete: 'restrict'");
    // Q9: never gen_random_uuid() — id is app-generated (uuidv7), so the column has no DB default.
    expect(schemaSrc).not.toContain('defaultRandom');
    expect(schemaSrc).not.toContain('gen_random_uuid');
  });

  it('emits validators that import the framework via the bare `archet/core` specifier, not a filesystem path', async () => {
    await generate({ modelsDir, generatedDir });
    const validatorsSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'validators.ts'), 'utf8'),
    );
    // this file lives inside a *consuming* project's tree — only a bare specifier resolves
    // correctly there regardless of package-manager layout (see validators-gen.ts).
    expect(validatorsSrc).toContain("from 'archet/core'");
    expect(validatorsSrc).toContain('buildCreateSchema(Invoice)');
    expect(validatorsSrc).toContain('buildUpdateSchema(Invoice)');
  });

  it('emits a registry with static re-exports, one per model (routing pivot)', async () => {
    await generate({ modelsDir, generatedDir });
    const registrySrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'registry.ts'), 'utf8'),
    );
    expect(registrySrc).toContain('export { Customer }');
    expect(registrySrc).toContain('export { Invoice }');
  });

  it('rejects a dangling field.reference target before writing any files', async () => {
    const badModelsDir = await writeModelsDir({
      'orphan.model.ts': `
        import { defineModel, field } from '${CORE_IMPORT}';
        export const Orphan = defineModel('orphans', {
          fields: { ownerId: field.reference('nonexistent', { required: true }) },
        });
      `,
    });
    try {
      await expect(generate({ modelsDir: badModelsDir, generatedDir })).rejects.toThrow(
        /references unknown model 'nonexistent'/,
      );
    } finally {
      await rm(badModelsDir, { recursive: true, force: true });
    }
  });
});
