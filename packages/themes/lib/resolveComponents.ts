import type { ComponentRegistryEntry, ThemeFeatures } from '../types.js';

/**
 * Filters the component registry by theme feature flags.
 * A component is included only if ALL of its requiredFeatures are enabled (true).
 * Components with no requiredFeatures are always included.
 */
export function resolveComponents(
  allComponents: ComponentRegistryEntry[],
  features: ThemeFeatures,
): ComponentRegistryEntry[] {
  return allComponents.filter((component) => {
    const required = component.requiredFeatures ?? [];
    return required.every((f) => features[f] === true);
  });
}
