/**
 * Task 1 — typed theme-adapter registry.
 *
 * The registry binds a theme ID to its package/root and artifact mode. It is the
 * provenance boundary between the shared central map and the theme-owned
 * descriptor modules: the central registry is shared input, while each
 * descriptor module is input only to its own theme digest.
 *
 * These tests are the behavioral contract of the registry:
 *  - Bloom resolution is unchanged (paths / ACK names / legacy mode);
 *  - Satin resolves the exact tiered paths/ACK names AND (as of Task 3) a
 *    complete runnable bundle: descriptor + source adapter + release contract,
 *    all with theme id `satin`;
 *  - Luna / unknown / mismatched explicit paths fail;
 *  - the build plan is the four deterministic steps;
 *  - no arbitrary filesystem root is accepted from the theme name.
 */

import {
  getThemeDescriptor,
  getThemeBuildPlan,
  resolveRunnableTheme,
  THEME_DESCRIPTORS,
} from '../conformance/theme-adapters';
import { BLOOM_THEME_DESCRIPTOR } from '../conformance/theme-descriptors/bloom';
import { SATIN_THEME_DESCRIPTOR } from '../conformance/theme-descriptors/satin';

// ---------------------------------------------------------------------------
// registry shape
// ---------------------------------------------------------------------------

describe('THEME_DESCRIPTORS registry', () => {
  it('maps exactly bloom + satin to their owned descriptors', () => {
    expect(Object.keys(THEME_DESCRIPTORS).sort()).toEqual(['bloom', 'satin']);
    expect(THEME_DESCRIPTORS.bloom).toBe(BLOOM_THEME_DESCRIPTOR);
    expect(THEME_DESCRIPTORS.satin).toBe(SATIN_THEME_DESCRIPTOR);
  });
});

// ---------------------------------------------------------------------------
// Bloom — unchanged legacy descriptor
// ---------------------------------------------------------------------------

describe('getThemeDescriptor(bloom)', () => {
  it('returns the landed Bloom descriptor with its legacy paths / ACK names', () => {
    const d = getThemeDescriptor('bloom');
    expect(d).toBe(BLOOM_THEME_DESCRIPTOR);
    expect(d.id).toBe('bloom');
    expect(d.packageName).toBe('@merfy/theme-bloom');
    expect(d.packageRoot).toBe('packages/theme-bloom');
    expect(d.standaloneRoot).toBe('themes/bloom');
    expect(d.paths).toEqual({
      mode: 'legacy',
      requirements: 'conformance/requirements/bloom.v1.json',
      inventory: 'conformance/inventory/bloom.generated.json',
      structuralBaseline: 'conformance/baselines/bloom.structural.json',
      reportDir: 'conformance-results/bloom',
    });
    expect(d.mutationAcks).toEqual({
      mode: 'legacy',
      capture: 'BLOOM_BASELINE_ACK',
      shrink: 'BLOOM_BASELINE_SHRINK_ACK',
      inventory: 'BLOOM_INVENTORY_ACK',
      appendRequirements: 'BLOOM_REQUIREMENTS_ACK',
    });
  });
});

// ---------------------------------------------------------------------------
// Satin — tiered descriptor, registered but not runnable
// ---------------------------------------------------------------------------

describe('getThemeDescriptor(satin)', () => {
  it('returns the Satin tiered descriptor with the exact plan paths + ACK names', () => {
    expect(getThemeDescriptor('satin')).toEqual(SATIN_THEME_DESCRIPTOR);
    expect(SATIN_THEME_DESCRIPTOR.paths).toEqual({
      mode: 'tiered',
      requirements: 'conformance/requirements/satin.v1.json',
      inventory: 'conformance/inventory/satin.generated.json',
      structuralBaseline: 'conformance/baselines/satin.structural.json',
      tierManifest: 'conformance/baselines/satin.manifest.json',
      reportDir: 'conformance-results/satin',
    });
    expect(SATIN_THEME_DESCRIPTOR.mutationAcks).toEqual({
      mode: 'tiered',
      capture: 'SATIN_BASELINE_ACK',
      shrink: 'SATIN_BASELINE_SHRINK_ACK',
      inventory: 'SATIN_INVENTORY_ACK',
      appendRequirements: 'SATIN_REQUIREMENTS_ACK',
      reviseSemantic: 'SATIN_BASELINE_REVISE_ACK',
    });
  });
});

// ---------------------------------------------------------------------------
// build plan — four deterministic steps
// ---------------------------------------------------------------------------

describe('getThemeBuildPlan', () => {
  it('returns the four deterministic build steps for satin', () => {
    expect(getThemeBuildPlan('satin')).toEqual([
      { kind: 'service-build' },
      { kind: 'blocks-build' },
      { kind: 'sections-build', theme: 'satin' },
      { kind: 'standalone-build', theme: 'satin' },
    ]);
  });

  it('returns the four deterministic build steps for bloom', () => {
    expect(getThemeBuildPlan('bloom')).toEqual([
      { kind: 'service-build' },
      { kind: 'blocks-build' },
      { kind: 'sections-build', theme: 'bloom' },
      { kind: 'standalone-build', theme: 'bloom' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// resolveRunnableTheme — Bloom runnable, Satin incomplete, others fail
// ---------------------------------------------------------------------------

describe('resolveRunnableTheme', () => {
  it('resolves one complete Satin bundle', async () => {
    const bundle = await resolveRunnableTheme('satin');
    expect(bundle.descriptor.id).toBe('satin');
    expect(bundle.source.theme).toBe('satin');
    expect(bundle.releaseContract.theme).toBe('satin');
  });

  it('wires the Satin bundle to its descriptor, source adapter and release contract', async () => {
    expect(getThemeDescriptor('satin')).toEqual(SATIN_THEME_DESCRIPTOR);
    expect(getThemeBuildPlan('satin')).toEqual([
      { kind: 'service-build' },
      { kind: 'blocks-build' },
      { kind: 'sections-build', theme: 'satin' },
      { kind: 'standalone-build', theme: 'satin' },
    ]);
    const bundle = await resolveRunnableTheme('satin');
    expect(bundle.descriptor).toBe(SATIN_THEME_DESCRIPTOR);
    expect(typeof bundle.loadSourceSnapshot).toBe('function');
    expect(bundle.sourceAdapter.theme).toBe('satin');
    // provenance boundary: the two audit arrays are deep-equal (harness gate).
    expect(bundle.releaseContract.externalAudits).toEqual(
      bundle.sourceAdapter.externalAudits,
    );
    // Satin must require its checkout-result page + the wishlist-open feature.
    expect(bundle.releaseContract.pages.map((p) => p.id)).toContain(
      'page-checkout-result',
    );
    expect(bundle.releaseContract.requiredFeatures.wishlist).toBe(true);
  });

  it('resolves Bloom to a complete runnable bundle', async () => {
    const bundle = await resolveRunnableTheme('bloom');
    expect(bundle.descriptor).toBe(BLOOM_THEME_DESCRIPTOR);
    expect(typeof bundle.loadSourceSnapshot).toBe('function');
    expect(bundle.source.theme).toBe('bloom');
    expect(bundle.releaseContract.theme).toBe('bloom');
    expect(bundle.releaseContract).toBeDefined();
  });

  it('rejects Luna explicitly (not part of the release train)', async () => {
    await expect(resolveRunnableTheme('luna' as never)).rejects.toThrow(/luna/i);
  });

  it('rejects an unknown theme', async () => {
    await expect(resolveRunnableTheme('nope' as never)).rejects.toThrow(/theme/i);
  });

  it('does not accept an arbitrary filesystem root smuggled through the theme name', async () => {
    // A path-like theme name must never resolve a descriptor / fs root.
    await expect(
      resolveRunnableTheme('../../etc' as never),
    ).rejects.toThrow();
    expect(() => getThemeDescriptor('../../etc' as never)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getThemeDescriptor — rejects non-registered themes before any fs read
// ---------------------------------------------------------------------------

describe('getThemeDescriptor rejects non-registered themes', () => {
  it('rejects Luna', () => {
    expect(() => getThemeDescriptor('luna' as never)).toThrow(/luna/i);
  });
  it('rejects an unknown theme', () => {
    expect(() => getThemeDescriptor('mystery' as never)).toThrow(/theme/i);
  });
});
