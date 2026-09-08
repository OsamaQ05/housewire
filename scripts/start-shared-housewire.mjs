import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relayCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const expoLauncher = path.join(projectRoot, 'scripts', 'start-shared-expo.mjs');
const relayHealthUrl = 'http://127.0.0.1:8788/health';

let relay;
let expo;
let shuttingDown = false;

async function isHousewireRelayRunning() {
  try {
    const response = await fetch(relayHealthUrl, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.status === 'ok' && typeof body?.aiConfigured === 'boolean';
  } catch {
    return false;
  }
}

async function waitForRelay() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isHousewireRelayRunning()) return true;
    if (relay?.exitCode !== null) return false;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

function stopChild(child) {
  if (child && child.exitCode === null && !child.killed) child.kill('SIGINT');
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChild(expo);
  stopChild(relay);
  process.exitCode = exitCode;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (await isHousewireRelayRunning()) {
  console.log('Housewire relay already healthy on ports 8787/8788 — reusing it.');
} else {
  console.log('Starting Housewire relay on ports 8787/8788…');
  relay = spawn(process.execPath, [relayCli, 'server/index.ts'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  relay.on('error', (error) => {
    console.error(`Could not start the Housewire relay: ${error.message}`);
    shutdown(1);
  });

  if (!(await waitForRelay())) {
    console.error('Housewire relay did not become ready. Check whether ports 8787/8788 are used by another application.');
    shutdown(1);
  }
}

if (!shuttingDown) {
  console.log('Starting Expo on the first available Metro port…');
  expo = spawn(process.execPath, [expoLauncher, ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  expo.on('error', (error) => {
    console.error(`Could not start Expo: ${error.message}`);
    shutdown(1);
  });
  expo.on('exit', (code, signal) => {
    if (!shuttingDown && signal !== 'SIGINT') shutdown(code ?? 1);
  });
}
