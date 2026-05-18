import type { Registry } from '../../packages/theme-contract/registry';

let current: Registry | null = null;

/**
 * Singleton holder для cached Registry.
 *
 * `set()` вызывается at startup в main.ts после scanBlockRegistry +
 * validateRegistry. Все handlers (preview render, /api/blocks controller,
 * build pipeline) читают через `get()`. Reset() — только для тестов.
 *
 * Throws если `get()` called до `set()` — fail-fast вместо silent undefined.
 */
export const RegistryStore = {
  set(r: Registry): void {
    current = r;
  },
  get(): Registry {
    if (!current) {
      throw new Error('RegistryStore not initialised — call set() at startup');
    }
    return current;
  },
  reset(): void {
    current = null;
  },
} as const;
