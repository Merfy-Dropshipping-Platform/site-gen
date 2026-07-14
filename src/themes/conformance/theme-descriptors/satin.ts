/**
 * Satin-owned conformance descriptor (Task 1).
 *
 * This module is the ONLY input to Satin's theme digest for path/ACK topology.
 * Task 1 registers Satin's tiered artifact paths + `SATIN_*` mutation acks but
 * does NOT make Satin runnable: a runnable bundle additionally requires source
 * and release-contract entries, which are registered atomically in Tasks 2–3.
 * Satin uses the `tiered` (structural baseline + tier manifest, plus a
 * semantic-revise ack) mode.
 */

import type { ThemeConformanceAdapter } from '../theme-adapter';

export const SATIN_THEME_DESCRIPTOR = {
  id: 'satin',
  packageName: '@merfy/theme-satin',
  packageRoot: 'packages/theme-satin',
  standaloneRoot: 'themes/satin',
  paths: {
    mode: 'tiered',
    requirements: 'conformance/requirements/satin.v1.json',
    inventory: 'conformance/inventory/satin.generated.json',
    structuralBaseline: 'conformance/baselines/satin.structural.json',
    tierManifest: 'conformance/baselines/satin.manifest.json',
    reportDir: 'conformance-results/satin',
  },
  mutationAcks: {
    mode: 'tiered',
    capture: 'SATIN_BASELINE_ACK',
    shrink: 'SATIN_BASELINE_SHRINK_ACK',
    inventory: 'SATIN_INVENTORY_ACK',
    appendRequirements: 'SATIN_REQUIREMENTS_ACK',
    reviseSemantic: 'SATIN_BASELINE_REVISE_ACK',
  },
} satisfies ThemeConformanceAdapter<'satin', 'tiered'>;
