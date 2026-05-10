import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const commands = [
  { name: 'api', command: process.execPath, args: ['server/index.js'], shell: false },
  process.platform === 'win32'
    ? { name: 'vite', command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'dev'], shell: false }
    : { name: 'vite', command: 'npm', args: ['run', 'dev'], shell: false },
];

const children = commands.map(({ name, command, args, shell }) => {
  const child = spawn(command, args, {
    cwd: rootDir,
    shell,
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    child.kill();
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
