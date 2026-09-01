const relayModulePath = './relay.ts';
const forgeModulePath = './case-forge-ai.ts';

function loadLocalEnvironment(): void {
  try {
    process.loadEnvFile?.();
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code !== 'ENOENT') throw error;
  }
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const { HousewireRelay } = (await import(relayModulePath)) as typeof import('./relay');
  const { CaseForgeAiServer } = (await import(forgeModulePath)) as typeof import('./case-forge-ai');
  const parsedPort = Number.parseInt(process.env.HOUSEWIRE_RELAY_PORT ?? '8787', 10);
  const port = Number.isFinite(parsedPort) ? parsedPort : 8787;
  const parsedForgePort = Number.parseInt(process.env.HOUSEWIRE_FORGE_PORT ?? String(port + 1), 10);
  const forgePort = Number.isFinite(parsedForgePort) ? parsedForgePort : port + 1;
  const host = process.env.HOUSEWIRE_RELAY_HOST ?? '0.0.0.0';
  const relay = new HousewireRelay({ port, host: process.env.HOUSEWIRE_RELAY_HOST ?? '0.0.0.0' });
  const forge = new CaseForgeAiServer({
    apiKey: process.env.OPENAI_API_KEY,
    host,
    model: process.env.HOUSEWIRE_AI_MODEL ?? 'gpt-5.4',
    port: forgePort,
  });
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all([relay.stop(), forge.stop()]);
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  const address = await relay.start();
  try {
    const forgeAddress = await forge.start();
    process.stdout.write(`Housewire LAN relay listening on ${address.url}\n`);
    process.stdout.write(
      `Housewire Case Forge listening on ${forgeAddress.url} (${process.env.OPENAI_API_KEY?.trim() ? 'OpenAI narrative enabled' : 'offline fallback only'})\n`,
    );
  } catch (error) {
    await relay.stop();
    throw error;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`Housewire LAN relay failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
