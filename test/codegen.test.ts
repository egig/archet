import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ratchet-models-'));
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, 'utf8');
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
    generatedDir = await mkdtemp(path.join(os.tmpdir(), 'ratchet-gen-'));
  });

  afterEach(async () => {
    await rm(modelsDir, { recursive: true, force: true });
    await rm(generatedDir, { recursive: true, force: true });
  });

  it('emits a schema with §4 conventions: timestamptz, partial unique index, CHECK, RESTRICT FK', async () => {
    const { modelCount } = await generate({ modelsDir, generatedDir });
    // 2 user models + 5 built-in auth models (User/Role/Permission/Session/WorkTitle) + 5 built-in
    // automation models (Agent/AgentPermission/Chat/Message/Provider) + 2 built-in workspace
    // models (Workspace/WorkspaceView) — built-ins are always present.
    expect(modelCount).toBe(14);

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

  it('emits validators that import the framework via the bare `@egig/ratchet/core` specifier, not a filesystem path', async () => {
    await generate({ modelsDir, generatedDir });
    const validatorsSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'validators.ts'), 'utf8'),
    );
    // this file lives inside a *consuming* project's tree — only a bare specifier resolves
    // correctly there regardless of package-manager layout (see validators-gen.ts).
    expect(validatorsSrc).toContain("from '@egig/ratchet/core'");
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

  it('always includes the built-in User/Role/Permission/Session/WorkTitle models, imported from `@egig/ratchet/auth`', async () => {
    await generate({ modelsDir, generatedDir });
    const registrySrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'registry.ts'), 'utf8'),
    );
    const schemaSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'schema.ts'), 'utf8'),
    );
    // built-ins are wrapped, not plain re-exports, since they're assigned the 'auth' Domain
    // explicitly (builtins.ts) — see the 'auth' Domain assertions below.
    for (const name of ['User', 'Role', 'Permission', 'Session', 'WorkTitle']) {
      expect(registrySrc).toContain(`import { ${name} as _${name} } from '@egig/ratchet/auth';`);
    }
    expect(schemaSrc).toContain("pgTable('users'");
    expect(schemaSrc).toContain("pgTable('roles'");
    expect(schemaSrc).toContain("pgTable('permissions'");
    expect(schemaSrc).toContain("pgTable('sessions'");
    expect(schemaSrc).toContain("pgTable('work_titles'");
  });

  it('always includes the built-in Agent/AgentPermission/Chat/Message/Provider models, imported from `@egig/ratchet/automation`', async () => {
    await generate({ modelsDir, generatedDir });
    const registrySrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'registry.ts'), 'utf8'),
    );
    const schemaSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'schema.ts'), 'utf8'),
    );
    for (const name of ['Agent', 'AgentPermission', 'Chat', 'Message', 'Provider']) {
      expect(registrySrc).toContain(`import { ${name} as _${name} } from '@egig/ratchet/automation';`);
    }
    expect(schemaSrc).toContain("pgTable('agents'");
    expect(schemaSrc).toContain("pgTable('agent_permissions'");
    expect(schemaSrc).toContain("pgTable('chats'");
    expect(schemaSrc).toContain("pgTable('messages'");
    expect(schemaSrc).toContain("pgTable('providers'");
  });

  it('always includes the built-in Workspace/WorkspaceView models, imported from `@egig/ratchet/workspace`', async () => {
    await generate({ modelsDir, generatedDir });
    const registrySrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'registry.ts'), 'utf8'),
    );
    const schemaSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'schema.ts'), 'utf8'),
    );
    for (const name of ['Workspace', 'WorkspaceView']) {
      expect(registrySrc).toContain(`import { ${name} as _${name} } from '@egig/ratchet/workspace';`);
    }
    expect(schemaSrc).toContain("pgTable('workspaces'");
    expect(schemaSrc).toContain("pgTable('workspace_views'");
  });

  it("assigns the built-in auth models to the 'auth' Domain, the built-in automation models to the 'automation' Domain, and the built-in workspace models to the 'workspace' Domain (ADR 0001), grouping them in the console sidebar", async () => {
    await generate({ modelsDir, generatedDir });
    const registrySrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'registry.ts'), 'utf8'),
    );
    for (const name of ['User', 'Role', 'Permission', 'Session', 'WorkTitle']) {
      expect(registrySrc).toContain(`domain: "auth"`);
      expect(registrySrc).toContain(`export const ${name} = { ..._${name}, console: { ..._${name}.console, domain: "auth" } };`);
    }
    for (const name of ['Agent', 'AgentPermission', 'Chat', 'Message', 'Provider']) {
      expect(registrySrc).toContain(`domain: "automation"`);
      expect(registrySrc).toContain(`export const ${name} = { ..._${name}, console: { ..._${name}.console, domain: "automation" } };`);
    }
    for (const name of ['Workspace', 'WorkspaceView']) {
      expect(registrySrc).toContain(`domain: "workspace"`);
      expect(registrySrc).toContain(`export const ${name} = { ..._${name}, console: { ..._${name}.console, domain: "workspace" } };`);
    }
    // a flat, non-domain user model (customer.model.ts, invoice.model.ts) stays a plain re-export.
    expect(registrySrc).toContain('export { Customer } from');
    expect(registrySrc).toContain('export { Invoice } from');
  });

  it('a model declared under a modelsDir subdirectory is assigned that folder name as its Domain', async () => {
    const domainModelsDir = await writeModelsDir({
      'billing/invoice.model.ts': `
        import { defineModel, field } from '${CORE_IMPORT}';
        export const Invoice = defineModel('invoices', {
          fields: { amount: field.decimal({ precision: 10, scale: 2, required: true }) },
        });
      `,
    });
    try {
      await generate({ modelsDir: domainModelsDir, generatedDir });
      const registrySrc = await import('node:fs/promises').then((fs) =>
        fs.readFile(path.join(generatedDir, 'registry.ts'), 'utf8'),
      );
      expect(registrySrc).toContain(`console: { ..._Invoice.console, domain: "billing" } };`);
    } finally {
      await rm(domainModelsDir, { recursive: true, force: true });
    }
  });

  it('emits the shared ratchet_domain_settings table unconditionally', async () => {
    await generate({ modelsDir, generatedDir });
    const schemaSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'schema.ts'), 'utf8'),
    );
    expect(schemaSrc).toContain("pgTable('ratchet_domain_settings'");
  });

  it('emits Domain Settings (a *.domain.ts under a matching modelsDir subdirectory) to domains.ts', async () => {
    const domainModelsDir = await writeModelsDir({
      'auth/settings.domain.ts': `
        import { defineDomain, field } from '${CORE_IMPORT}';
        export const AuthSettings = defineDomain('auth', {
          label: 'Authentication',
          settings: { sessionTtlDays: field.integer({ default: 7 }) },
        });
      `,
    });
    try {
      const { domainCount } = await generate({ modelsDir: domainModelsDir, generatedDir });
      // 1 user Domain + 1 built-in Automation Domain (always present, see below).
      expect(domainCount).toBe(2);
      const domainsSrc = await import('node:fs/promises').then((fs) =>
        fs.readFile(path.join(generatedDir, 'domains.ts'), 'utf8'),
      );
      expect(domainsSrc).toContain('export { AuthSettings }');
    } finally {
      await rm(domainModelsDir, { recursive: true, force: true });
    }
  });

  it('always includes the built-in Automation Domain (Chat console menu), imported from `@egig/ratchet/automation`', async () => {
    const { domainCount } = await generate({ modelsDir, generatedDir });
    expect(domainCount).toBe(1);
    const domainsSrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(generatedDir, 'domains.ts'), 'utf8'),
    );
    expect(domainsSrc).toContain(`export { AutomationDomain } from '@egig/ratchet/automation';`);
  });

  it("rejects Domain Settings declared under a folder that doesn't match their own domain name", async () => {
    const badDomainModelsDir = await writeModelsDir({
      'billing/settings.domain.ts': `
        import { defineDomain, field } from '${CORE_IMPORT}';
        export const AuthSettings = defineDomain('auth', { settings: { x: field.boolean() } });
      `,
    });
    try {
      await expect(generate({ modelsDir: badDomainModelsDir, generatedDir })).rejects.toThrow(
        /must live under 'models\/auth\/'/,
      );
    } finally {
      await rm(badDomainModelsDir, { recursive: true, force: true });
    }
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
