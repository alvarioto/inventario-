import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (!existsSync(resolve(root, 'dist', 'index.html'))) {
  console.error('Falta dist/index.html. Ejecuta npm install y npm run build.');
  process.exit(1);
}
const child = spawn(process.execPath, [resolve(root, 'server/index.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
