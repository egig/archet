import { readdirSync, statSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIRS = ['core', 'cli', 'codegen', 'router', 'auth', 'automation', 'workspace', 'console'];

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const entryPoints = SRC_DIRS.flatMap((dir) => walk(path.join(ROOT, 'src', dir), []));

  // Unbundled — one output file per source file, matching today's dist/ shape (Q2).
  await esbuild.build({
    entryPoints,
    bundle: false,
    outdir: path.join(ROOT, 'dist'),
    outbase: path.join(ROOT, 'src'),
    platform: 'node',
    format: 'esm',
    packages: 'external',
    jsx: 'automatic',
    sourcemap: true,
    logLevel: 'info',
  });

  // Declarations only — tsc still owns type-checking and .d.ts emission (see plan Context).
  const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (tsc.status !== 0) {
    throw new Error(`tsc --emitDeclarationOnly exited with code ${tsc.status}`);
  }

  chmodSync(path.join(ROOT, 'dist', 'cli', 'bin.js'), 0o755);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
