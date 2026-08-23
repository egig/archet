import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const ARCHET_VERSION = '^0.1.0';

function packageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'archet dev',
          serve: 'archet serve',
          generate: 'archet generate',
          migrate: 'archet migrate',
          studio: 'archet studio',
          build: 'tsc -p tsconfig.json',
          typecheck: 'tsc -p tsconfig.json --noEmit',
        },
        dependencies: {
          '@hono/node-server': '^1.13.7',
          archet: ARCHET_VERSION,
          'drizzle-orm': '^0.36.4',
          hono: '^4.6.14',
          postgres: '^3.4.5',
          zod: '^3.24.1',
        },
        devDependencies: {
          '@types/node': '^22.10.2',
          'drizzle-kit': '^0.28.1',
          tsx: '^4.19.2',
          typescript: '^5.7.2',
        },
      },
      null,
      2,
    ) + '\n'
  );
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src", "models", "logic", "framework.config.ts"],
  "exclude": ["dist", "node_modules", "src/.generated"]
}
`;

const FRAMEWORK_CONFIG = `import { defineConfig } from 'archet/core';

export default defineConfig({
  db: { connectionString: process.env.DATABASE_URL! },
  modelsDir: 'models',
  generatedDir: 'src/.generated',
  migrationsDir: 'drizzle/migrations',
});
`;

const EXAMPLE_MODEL = `import { defineModel, field } from 'archet/core';

export const Example = defineModel('examples', {
  fields: {
    name: field.string({ required: true, maxLength: 255 }),
  },
});
`;

const GITIGNORE = `node_modules/
dist/
src/.generated/
.env
*.log
`;

function sanitizePackageName(dirName: string): string {
  const cleaned = dirName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'archet-app';
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeIfAbsent(filePath: string, content: string, label: string): Promise<void> {
  if (await exists(filePath)) {
    console.log(`skipped ${label} (already exists)`);
    return;
  }
  await writeFile(filePath, content, 'utf8');
  console.log(`wrote ${label}`);
}

async function appendGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!(await exists(gitignorePath))) {
    await writeFile(gitignorePath, GITIGNORE, 'utf8');
    console.log('wrote .gitignore');
    return;
  }
  const existing = await readFile(gitignorePath, 'utf8');
  if (!existing.includes('src/.generated')) {
    await writeFile(gitignorePath, `${existing}\n# archet\n${GITIGNORE}`, 'utf8');
    console.log('updated .gitignore');
  } else {
    console.log('skipped .gitignore (already covers src/.generated)');
  }
}

/** §6/§10: scaffolds a full starter project — package.json, tsconfig.json, framework.config.ts,
 * an example model, and drizzle/migrations/. No server entry file to write: `archet serve`
 * (framework-owned, see src/cli/commands/serve.ts) boots the API directly from
 * framework.config.ts + the generated registry. Never overwrites a file that's already there —
 * safe to re-run in a partially set-up directory. */
export async function runInit(cwd: string): Promise<void> {
  await mkdir(path.join(cwd, 'models'), { recursive: true });
  await mkdir(path.join(cwd, 'src', '.generated'), { recursive: true });
  await mkdir(path.join(cwd, 'drizzle', 'migrations'), { recursive: true });

  const pkgName = sanitizePackageName(path.basename(cwd));
  await writeIfAbsent(path.join(cwd, 'package.json'), packageJson(pkgName), 'package.json');
  await writeIfAbsent(path.join(cwd, 'tsconfig.json'), TSCONFIG, 'tsconfig.json');
  await writeIfAbsent(path.join(cwd, 'framework.config.ts'), FRAMEWORK_CONFIG, 'framework.config.ts');
  await writeIfAbsent(path.join(cwd, 'models', 'example.model.ts'), EXAMPLE_MODEL, 'models/example.model.ts');
  await appendGitignore(cwd);

  console.log('');
  console.log('next steps:');
  console.log('  1. npm install   (note: "archet" isn\'t published yet — `npm link` it from this framework\'s checkout, or replace the dependency with a local path, until it is)');
  console.log('  2. set DATABASE_URL');
  console.log('  3. npm run generate   (writes src/.generated/*)');
  console.log('  4. npm run migrate && npm run serve   (or `npm run dev` for local push-based iteration)');
}
