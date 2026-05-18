import { RegistryStore } from '../registry.store';
import type { Registry } from '../../../packages/theme-contract/registry';

describe('RegistryStore', () => {
  beforeEach(() => {
    RegistryStore.reset();
  });

  it('throws if get called before set', () => {
    expect(() => RegistryStore.get()).toThrow(/not initialised/i);
  });

  it('returns set registry', () => {
    const r: Registry = { blocks: [], scannedAt: '2026-05-18T00:00:00Z', source: 'x' };
    RegistryStore.set(r);
    expect(RegistryStore.get()).toBe(r);
  });

  it('reset clears value', () => {
    RegistryStore.set({ blocks: [], scannedAt: 'x', source: 'y' });
    RegistryStore.reset();
    expect(() => RegistryStore.get()).toThrow();
  });
});
