/** Paid opt-in: node --env-file=.env --import tsx scripts/check-live-forge.ts */
import assert from 'node:assert/strict';
import { CaseForgeAiServer } from '../server/case-forge-ai';
import { HttpNarrativeCaseForgeProvider } from '../src/services/case-forge/providers';

async function main() {
  assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is missing.');
  const server = new CaseForgeAiServer({ host: '127.0.0.1', port: 0, apiKey: process.env.OPENAI_API_KEY, model: process.env.HOUSEWIRE_AI_MODEL ?? 'gpt-5.4' });
  const { url } = await server.start();
  const provider = new HttpNarrativeCaseForgeProvider({ baseUrl: url, timeoutMs: 68_000 });
  try {
    const started = Date.now();
    const game = await provider.generate({
      seed: 'custom-world-live-check', generatedAt: Date.now(), playerIds: ['p1', 'p2', 'p3'],
      difficulty: 3, targetMinutes: 30, tone: 'adventure', intensity: 'balanced',
      safeMovement: false, noiseAllowed: false,
      customThemePrompt: process.argv[2] ?? 'A bakery on the moon. Rescue the birthday cake before the lunar sunrise.',
    });
    assert.equal(game.providerId, provider.id);
    console.log(JSON.stringify({ source: game.providerId, elapsedMs: Date.now() - started, requestedTheme: game.recipe.customThemePrompt, title: game.title, premise: game.premise, stages: game.stages.map(stage => ({ title: stage.title, story: stage.storyBeat })) }, null, 2));
  } finally { await server.stop(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Live Forge check failed'); process.exitCode = 1; });
