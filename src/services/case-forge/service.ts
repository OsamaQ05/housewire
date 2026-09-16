import { normalizeForgeThemePrompt, type ForgeCase, type ForgeGenerationRequest } from '../../domain/case-forge';
import { exportForgeCaseBackup, exportForgeCasePreview, importForgeCaseBackup } from './serialization';
import { OfflineCaseForgeProvider } from './providers';
import type {
  CaseForgeService,
  ForgeCaseProvider,
  ForgeCaseRepository,
  ForgeGenerateOptions,
} from './types';

export interface CreateCaseForgeServiceOptions {
  repository: ForgeCaseRepository;
  providers?: readonly ForgeCaseProvider[];
  now?: () => number;
}

class DefaultCaseForgeService implements CaseForgeService {
  private readonly providers: Map<string, ForgeCaseProvider>;
  private readonly offline: OfflineCaseForgeProvider;
  private readonly now: () => number;

  constructor(private readonly options: CreateCaseForgeServiceOptions) {
    this.offline = new OfflineCaseForgeProvider();
    this.providers = new Map<string, ForgeCaseProvider>([
      [this.offline.id, this.offline],
      ...(options.providers ?? []).map((provider) => [provider.id, provider] as const),
    ]);
    this.now = options.now ?? Date.now;
  }

  async generate(request: ForgeGenerationRequest, options: ForgeGenerateOptions = {}): Promise<ForgeCase> {
    request = { ...request, customThemePrompt: normalizeForgeThemePrompt(request.customThemePrompt) };
    const providerId = options.providerId ?? this.offline.id;
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown Case Forge provider: ${providerId}.`);
    let game: ForgeCase;
    try {
      if (!(await provider.isAvailable())) throw new Error('The AI story service is unavailable. Check that the computer’s relay is running and every phone is on the same Wi-Fi. Your idea is still here.');
      game = await provider.generate(request);
    } catch (error) {
      const allowFallback = options.allowOfflineFallback ?? !request.customThemePrompt;
      if (provider.mode === 'offline' || !allowFallback) throw error;
      game = await this.offline.generate(request);
    }
    await this.options.repository.save(game);
    return game;
  }

  list() {
    return this.options.repository.list();
  }

  get(caseId: string) {
    return this.options.repository.get(caseId);
  }

  async regenerate(
    caseId: string,
    overrides: Partial<ForgeGenerationRequest> = {},
    options: ForgeGenerateOptions = {},
  ): Promise<ForgeCase> {
    const existing = await this.options.repository.get(caseId);
    if (!existing) throw new Error(`Cannot regenerate missing case ${caseId}.`);
    const request: ForgeGenerationRequest = {
      ...existing.recipe,
      ...overrides,
      generatedAt: overrides.generatedAt ?? this.now(),
      replayIndex: overrides.replayIndex ?? existing.replayIndex + 1,
    };
    return this.generate(request, options);
  }

  remove(caseId: string) {
    return this.options.repository.remove(caseId);
  }

  async exportBackup(caseId: string): Promise<string> {
    const game = await this.options.repository.get(caseId);
    if (!game) throw new Error(`Cannot export missing case ${caseId}.`);
    return exportForgeCaseBackup(game, this.now());
  }

  async exportPreview(caseId: string): Promise<string> {
    const game = await this.options.repository.get(caseId);
    if (!game) throw new Error(`Cannot export missing case ${caseId}.`);
    return exportForgeCasePreview(game, this.now());
  }

  async importBackup(serialized: string): Promise<ForgeCase> {
    const game = importForgeCaseBackup(serialized);
    await this.options.repository.save(game);
    return game;
  }
}

export function createCaseForgeService(options: CreateCaseForgeServiceOptions): CaseForgeService {
  return new DefaultCaseForgeService(options);
}
