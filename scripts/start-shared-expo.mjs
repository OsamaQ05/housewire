import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
const forwardedArgs = process.argv.slice(2);

function hasArgument(name) {
  return forwardedArgs.some((argument) => argument === name || argument.startsWith(`${name}=`));
}

function explicitPort() {
  const equalsArgument = forwardedArgs.find((argument) => argument.startsWith('--port='));
  if (equalsArgument) {
    const value = Number.parseInt(equalsArgument.slice('--port='.length), 10);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }

  const index = forwardedArgs.indexOf('--port');
  if (index >= 0) {
    const value = Number.parseInt(forwardedArgs[index + 1] ?? '', 10);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  return undefined;
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ exclusive: true, host: '0.0.0.0', port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort() {
  for (let port = 8081; port <= 8112; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error('No free Metro port was found between 8081 and 8112.');
}

function addressScore(name, address) {
  const label = name.toLowerCase();
  let score = 0;
  if (/wi-?fi|wireless|wlan/.test(label)) score += 120;
  if (/ethernet|\beth\d*\b/.test(label)) score += 40;
  if (/virtual|vbox|virtualbox|vmware|hyper-v|vethernet|docker|wsl|loopback/.test(label)) score -= 300;
  if (address.startsWith('10.')) score += 30;
  if (address.startsWith('192.168.')) score += 20;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 20;
  if (address.startsWith('192.168.56.')) score -= 200;
  return score;
}

function findLanAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal || address.address.startsWith('169.254.')) continue;
      candidates.push({ address: address.address, name, score: addressScore(name, address.address) });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  return { preferred: candidates[0], alternatives: candidates.slice(1) };
}

const requestedPort = explicitPort();
const port = requestedPort ?? await findAvailablePort();
const { preferred: lan, alternatives } = findLanAddress();
if (!lan) {
  console.error('No active IPv4 LAN adapter was found. Connect this computer to the same Wi-Fi or hotspot as the phones.');
  process.exit(1);
}

const usesDevelopmentClient = hasArgument('--dev-client');
const hasLaunchTarget = usesDevelopmentClient || hasArgument('--go');
const hasConnectionMode = hasArgument('--lan') || hasArgument('--localhost') || hasArgument('--tunnel');
const expoArgs = [expoCli, 'start'];
if (!hasLaunchTarget) expoArgs.push('--go');
if (!hasConnectionMode) expoArgs.push('--lan');
if (!hasArgument('--port')) expoArgs.push('--port', String(port));
expoArgs.push(...forwardedArgs);

const lanBaseUrl = `http://${lan.address}:${port}`;

console.log('');
console.log('HOUSEWIRE PHONE CONNECTION');
console.log(`Network adapter: ${lan.name} (${lan.address})`);
if (usesDevelopmentClient) {
  console.log(`Development server: ${lanBaseUrl}`);
  console.log('Open this through the installed HOUSEWIRE development build; Expo Go is not the target.');
} else {
  console.log(`Expo Go URL: exp://${lan.address}:${port}`);
  console.log('iPhone requirement: Expo CLI and Expo Go must be signed into the SAME Expo account.');
  console.log('If needed, run `npx expo login`, then sign in from the avatar menu in Expo Go.');
}
console.log(`Phone relay check: http://${lan.address}:8788/health`);
console.log('Open the relay-check URL in each phone browser first. If it fails, use one private hotspot and restart this command.');
console.log('Always scan the fresh terminal QR after changing Wi-Fi; saved QR images contain an old address.');
if (alternatives.length > 0) {
  console.log(`Other detected adapters: ${alternatives.map(({ address, name }) => `${name} (${address})`).join(', ')}`);
}
console.log('');

const child = spawn(process.execPath, expoArgs, {
  cwd: projectRoot,
  env: {
    ...process.env,
    EXPO_PACKAGER_PROXY_URL: process.env.EXPO_PACKAGER_PROXY_URL ?? lanBaseUrl,
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not start Expo: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
