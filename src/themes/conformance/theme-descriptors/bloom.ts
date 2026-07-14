/**
 * Bloom-owned conformance descriptor (Task 1).
 *
 * This module is the ONLY input to Bloom's theme digest for path/ACK topology.
 * It extracts the landed Bloom-specific constants — the canonical artifact paths
 * and the `BLOOM_*` mutation acknowledgement env-var names previously inlined in
 * `cli.ts` — behind the typed registry, preserving their exact values, schema,
 * flags, ACK names, paths, IDs and mutation semantics. Bloom uses the `legacy`
 * (single structural baseline, no tier manifest) mode.
 */

import type { ThemeConformanceAdapter } from '../theme-adapter';

export const BLOOM_THEME_DESCRIPTOR = {
  id: 'bloom',
  packageName: '@merfy/theme-bloom',
  packageRoot: 'packages/theme-bloom',
  standaloneRoot: 'themes/bloom',
  paths: {
    mode: 'legacy',
    requirements: 'conformance/requirements/bloom.v1.json',
    inventory: 'conformance/inventory/bloom.generated.json',
    structuralBaseline: 'conformance/baselines/bloom.structural.json',
    reportDir: 'conformance-results/bloom',
  },
  mutationAcks: {
    mode: 'legacy',
    capture: 'BLOOM_BASELINE_ACK',
    shrink: 'BLOOM_BASELINE_SHRINK_ACK',
    inventory: 'BLOOM_INVENTORY_ACK',
    appendRequirements: 'BLOOM_REQUIREMENTS_ACK',
  },
} satisfies ThemeConformanceAdapter<'bloom', 'legacy'>;
