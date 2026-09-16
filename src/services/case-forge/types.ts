import type {
  ForgeCase,
  ForgeCaseSummary,
  ForgeGenerationRequest,
} from '../../domain/case-forge';

export interface ForgeCaseProvider {
  readonly id: string;
  readonly mode: 'offline' | 'remote';
  isAvailable(): Promise<boolean>;
  generate(request: ForgeGenerationRequest): Promise<ForgeCase>;
}

export interface ForgeCaseRepository {
  list(): Promise<readonly ForgeCaseSummary[]>;
  get(caseId: string): Promise<ForgeCase | null>;
  save(game: ForgeCase): Promise<void>;
  remove(caseId: string): Promise<boolean>;
}

export interface ForgeGenerateOptions {
  /** Defaults to the local provider. */
  providerId?: string;
  /** Defaults to fallback for preset cases, but not custom descriptions. True explicitly accepts a template fallback. */
  allowOfflineFallback?: boolean;
}

export interface CaseForgeService {
  generate(request: ForgeGenerationRequest, options?: ForgeGenerateOptions): Promise<ForgeCase>;
  list(): Promise<readonly ForgeCaseSummary[]>;
  get(caseId: string): Promise<ForgeCase | null>;
  regenerate(
    caseId: string,
    overrides?: Partial<ForgeGenerationRequest>,
    options?: ForgeGenerateOptions,
  ): Promise<ForgeCase>;
  remove(caseId: string): Promise<boolean>;
  exportBackup(caseId: string): Promise<string>;
  exportPreview(caseId: string): Promise<string>;
  importBackup(serialized: string): Promise<ForgeCase>;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
