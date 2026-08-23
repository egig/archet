import { spawn } from 'node:child_process';

export function runDrizzleKit(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['drizzle-kit', ...args], { cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`drizzle-kit ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
