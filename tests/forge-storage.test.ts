import { describe, expect, it, vi } from 'vitest';

import { clearAllForgeStorage, isForgeStorageKey } from '../src/features/forge/forge-storage';

describe('Case Forge local reset', () => {
  it('recognizes every Forge namespace without touching the main product store', () => {
    expect(isForgeStorageKey('housewire-case-forge-library-v1')).toBe(true);
    expect(isForgeStorageKey('housewire-forge-run-v1:case-1')).toBe(true);
    expect(isForgeStorageKey('housewire-forge-live-v1:room-1')).toBe(true);
    expect(isForgeStorageKey('housewire-product-state-v1')).toBe(false);
  });

  it('removes only generated-case keys', async () => {
    const multiRemove = vi.fn(async () => undefined);
    await clearAllForgeStorage({
      async getAllKeys() {
        return [
          'housewire-product-state-v1',
          'housewire-case-forge-library-v1',
          'housewire-forge-run-v1:case-1',
        ];
      },
      multiRemove,
    });
    expect(multiRemove).toHaveBeenCalledWith([
      'housewire-case-forge-library-v1',
      'housewire-forge-run-v1:case-1',
    ]);
  });
});
