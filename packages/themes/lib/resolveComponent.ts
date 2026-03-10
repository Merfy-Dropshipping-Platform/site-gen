import type { ComponentRegistryEntry } from '../types.js';

/**
 * Resolves a single component by name using a fallback chain:
 * 1. Look in themeRegistry first (theme-specific override wins)
 * 2. Fall back to baseRegistry (platform defaults)
 * 3. Return null if not found in either
 *
 * @param name - Component name to find
 * @param themeRegistry - Theme-specific component entries (higher priority)
 * @param baseRegistry - Base/platform component entries (fallback)
 * @returns The matching ComponentRegistryEntry or null
 */
export function resolveComponent(
  name: string,
  themeRegistry: ComponentRegistryEntry[],
  baseRegistry: ComponentRegistryEntry[],
): ComponentRegistryEntry | null {
  // Theme registry has priority
  const themeEntry = themeRegistry.find((c) => c.name === name);
  if (themeEntry) return themeEntry;

  // Fall back to base registry
  const baseEntry = baseRegistry.find((c) => c.name === name);
  if (baseEntry) return baseEntry;

  return null;
}
