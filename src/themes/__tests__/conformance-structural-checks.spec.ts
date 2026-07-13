/**
 * Task 4 — Bloom release contract & structural invariants.
 *
 * `runStructuralChecks(snapshot, contract, fieldRows, settingRows)` returns
 * sorted deterministic issues and NEVER mutates production data. On a
 * real-current fixture it must expose the twenty named structural findings; on
 * a synthetic COMPLETE fixture (every gap repaired) it must return ZERO issues.
 *
 * Fixtures are synthetic snapshots (no real build needed). Both are built from
 * the same helpers so the "complete" fixture is an honest repair of the
 * "current" one, not a weakened check.
 */

import {
  runStructuralChecks,
  linkCapabilityFailures,
  findDuplicateCapabilityIssues,
  type StructuralCheckSnapshot,
  type StructuralCheckFieldRow,
  type StructuralCheckSettingRow,
} from '../conformance/structural-checks';
import { BLOOM_RELEASE_CONTRACT } from '../conformance/bloom-release-contract';
import type { CapabilityRecord } from '../../../packages/theme-contract/conformance';

const THEME = 'bloom';

/** The twenty named structural findings the real-current fixture must expose. */
const REQUIRED_CURRENT_FINDINGS = [
  'bloom.block.Benefits.anatomy.classes',
  'bloom.block.Benefits.anatomy.tokens',
  'bloom.block.Benefits.custom-declaration',
  'bloom.block.Benefits.custom-location',
  'bloom.block.Benefits.custom-pipeline.compiler',
  'bloom.block.Benefits.custom-pipeline.loader',
  'bloom.block.Benefits.custom-pipeline.generator',
  'bloom.block.Benefits.authoring',
  'bloom.block.Catalog.override-declaration',
  'bloom.block.Catalog.policy.color-hex',
  'bloom.block.MainText.schema-puck-default-orphan.textSize',
  'bloom.block.MainText.schema-effective-defaults',
  'bloom.block.Publications.normalization.cards',
  'bloom.block.Publications.normalization.columns',
  'bloom.flow.benefits.feature',
  'bloom.flow.cart-drawer.preview-built-theme-global-injection',
  'bloom.flow.wishlist.feature',
  'bloom.page.page-checkout-result.manifest',
  'bloom.page.page-checkout-result.seed',
  'bloom.theme-setting.token.--radius-button.constraint-max',
] as const;

// --- fixture builders -------------------------------------------------------

/** Manifest page rows (id/route/slug) for every PAGE_REGISTRY page EXCEPT one. */
function manifestPages(includeCheckoutResult: boolean) {
  return BLOOM_RELEASE_CONTRACT.pages
    .filter((p) => includeCheckoutResult || p.id !== 'page-checkout-result')
    .map((p) => ({ id: p.id, slug: p.route }));
}

/** Seed page ids present in the manifest seeds. */
function seedIds(includeCheckoutResult: boolean): string[] {
  return BLOOM_RELEASE_CONTRACT.pages
    .filter((p) => includeCheckoutResult || p.id !== 'page-checkout-result')
    .map((p) => p.id);
}

/** A "current" (broken) synthetic snapshot reproducing the target-ref defects. */
function currentSnapshot(): StructuralCheckSnapshot {
  return {
    themeId: THEME,
    manifestPages: manifestPages(false), // checkout-result MISSING from manifest
    homePageId: 'home',
    seedIds: seedIds(false), // checkout-result seed MISSING
    seedNonEmpty: true,
    seedNestedAuthorable: true,
    // Physical blocks: Benefits under blocks/ (F-041 missing classes+tokens),
    // Catalog under blocks/ with a hex policy error (F-041).
    physicalBlocks: [
      {
        location: 'blocks',
        name: 'Benefits',
        anatomy: { puckConfig: true, tokens: false, classes: false, astro: true, index: true },
        policy: { ok: true, codes: [], missingFiles: ['Benefits.classes.ts', 'Benefits.tokens.ts'] },
      },
      {
        location: 'blocks',
        name: 'Catalog',
        anatomy: { puckConfig: true, tokens: true, classes: true, astro: true, index: true },
        policy: { ok: false, codes: ['color-hex'], missingFiles: [] },
      },
    ],
    // Resolutions: Catalog base-resolved (physical override w/o manifest reason);
    // Benefits is NOT resolved to authoring (physical-only).
    resolutions: [
      { name: 'Catalog', source: 'base', manifestOverride: false },
    ],
    // Benefits base-name? No — Benefits is a NON-base physical block: it needs a
    // customBlocks declaration + a requiredFeatures entry.
    baseBlockNames: ['Catalog', 'MainText', 'Publications', 'Hero'],
    customBlockDeclarations: {}, // Benefits NOT declared
    features: {}, // benefits + wishlist NOT enabled
    // Custom-block pipeline reachability for Benefits: all three links broken
    // because it physically lives at blocks/Benefits, not customBlocks/Benefits.
    customPipeline: {
      Benefits: {
        declaredPath: null, // no ./customBlocks/Benefits declaration
        physicalLocation: 'blocks',
        compilerReachable: false,
        loaderReachable: false,
        generatorReachable: false,
      },
    },
    // Publications mapped renderer probes: max cols 6, max cards 12 (F-055).
    publications: {
      cardsWithinCanonical: false, // renderer allows up to 12 (canonical max 4)
      columnsWithinCanonical: false, // renderer allows up to 6 (canonical max 4)
    },
    cartDrawerReachability: { v2Sections: true, builtTheme: false, liveBuild: true },
    runtimeSourcesPresent: [...BLOOM_RELEASE_CONTRACT.runtimeSources],
    renderersReachable: BLOOM_RELEASE_CONTRACT.renderers.map((r) => r.name),
    sectionMappingsResolved: true,
  };
}

/** MainText field rows exposing the two schema defects (F-042). */
function currentMainTextFieldRows(): StructuralCheckFieldRow[] {
  return [
    {
      // raw Puck default `textSize` is stripped by a successful parse.
      block: 'MainText',
      capability: 'textSize',
      inputLeaf: 'textSize',
      survivesParse: false, // orphaned by parse
      origin: 'raw-puck-default',
    },
    {
      // blockDefaults.MainText.textStyle='regular' is invalid for enum normal|italic.
      block: 'MainText',
      capability: 'textStyle',
      inputLeaf: 'textStyle',
      survivesParse: true,
      origin: 'effective-defaults',
      effectiveDefaultInvalid: true,
    },
  ];
}

/** Theme-setting rows exposing the --radius-button constraint gap (F-043). */
function currentSettingRows(): StructuralCheckSettingRow[] {
  return [
    {
      token: '--radius-button',
      value: 100,
      constraintMax: 48,
      withinConstraint: false, // 100 > 48
    },
  ];
}

/** A "complete" synthetic snapshot where every gap is honestly repaired. */
function completeSnapshot(): StructuralCheckSnapshot {
  return {
    themeId: THEME,
    manifestPages: manifestPages(true), // checkout-result PRESENT
    homePageId: 'home',
    seedIds: seedIds(true), // checkout-result seed PRESENT
    seedNonEmpty: true,
    seedNestedAuthorable: true,
    // Benefits moved to canonical customBlocks/Benefits with full anatomy + clean
    // policy; Catalog authored cleanly with a manifest override reason.
    physicalBlocks: [
      {
        location: 'customBlocks',
        name: 'Benefits',
        anatomy: { puckConfig: true, tokens: true, classes: true, astro: true, index: true },
        policy: { ok: true, codes: [], missingFiles: [] },
      },
      {
        location: 'blocks',
        name: 'Catalog',
        anatomy: { puckConfig: true, tokens: true, classes: true, astro: true, index: true },
        policy: { ok: true, codes: [], missingFiles: [] },
      },
    ],
    // Catalog carries a manifest override reason; Benefits is authorable.
    resolutions: [
      { name: 'Catalog', source: 'theme', manifestOverride: true, overrideReason: 'bloom catalog port' },
      { name: 'Benefits', source: 'theme', manifestOverride: false },
    ],
    baseBlockNames: ['Catalog', 'MainText', 'Publications', 'Hero'],
    customBlockDeclarations: {
      Benefits: { path: './customBlocks/Benefits', requiredFeatures: ['benefits'] },
    },
    features: { benefits: true, wishlist: true },
    customPipeline: {
      Benefits: {
        declaredPath: './customBlocks/Benefits',
        physicalLocation: 'customBlocks',
        compilerReachable: true,
        loaderReachable: true,
        generatorReachable: true,
      },
    },
    publications: {
      cardsWithinCanonical: true,
      columnsWithinCanonical: true,
    },
    cartDrawerReachability: { v2Sections: true, builtTheme: true, liveBuild: true },
    runtimeSourcesPresent: [...BLOOM_RELEASE_CONTRACT.runtimeSources],
    renderersReachable: BLOOM_RELEASE_CONTRACT.renderers.map((r) => r.name),
    sectionMappingsResolved: true,
  };
}

/** MainText field rows with schema-compatible defaults (no orphan / no invalid). */
function completeMainTextFieldRows(): StructuralCheckFieldRow[] {
  return [
    { block: 'MainText', capability: 'textSize', inputLeaf: 'textSize', survivesParse: true, origin: 'raw-puck-default' },
    { block: 'MainText', capability: 'textStyle', inputLeaf: 'textStyle', survivesParse: true, origin: 'effective-defaults', effectiveDefaultInvalid: false },
  ];
}

/** Theme-setting rows with a token value that agrees with its constraint. */
function completeSettingRows(): StructuralCheckSettingRow[] {
  return [
    { token: '--radius-button', value: 48, constraintMax: 48, withinConstraint: true },
  ];
}

// --- tests ------------------------------------------------------------------

describe('runStructuralChecks — real-current fixture', () => {
  const issues = runStructuralChecks(
    currentSnapshot(),
    BLOOM_RELEASE_CONTRACT,
    currentMainTextFieldRows(),
    currentSettingRows(),
  );
  const ids = issues.map((i) => i.id);

  it('exposes ALL twenty named structural findings', () => {
    for (const id of REQUIRED_CURRENT_FINDINGS) {
      expect(ids).toContain(id);
    }
  });

  it('exposes EXACTLY the twenty named findings for this fixture (no more, no less)', () => {
    // A tight equality guards the current↔complete mapping: any accidental extra
    // finding here would otherwise be a silent ratchet expansion, and any
    // missing one a hidden gap.
    expect([...ids].sort()).toEqual([...REQUIRED_CURRENT_FINDINGS].sort());
  });

  it('returns sorted deterministic issues', () => {
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('every issue carries stable expectedCode/observedCode and a non-PASS status', () => {
    for (const i of issues) {
      expect(i.status).not.toBe('PASS');
      expect(typeof i.expectedCode).toBe('string');
      expect(typeof i.observedCode).toBe('string');
      expect(i.expectedCode.length).toBeGreaterThan(0);
      expect(i.observedCode.length).toBeGreaterThan(0);
      // Human error text must never leak into the ID.
      expect(i.id).not.toMatch(/\s/);
    }
  });

  it('emits five-file anatomy issues one-per-missing-member (never collapsed)', () => {
    // Benefits is missing classes + tokens → exactly two anatomy issues.
    const anatomy = ids.filter((id) => id.startsWith('bloom.block.Benefits.anatomy.'));
    expect(anatomy.sort()).toEqual([
      'bloom.block.Benefits.anatomy.classes',
      'bloom.block.Benefits.anatomy.tokens',
    ]);
  });

  it('emits three separate custom-pipeline findings (a directory move cannot fake green)', () => {
    const pipeline = ids.filter((id) => id.startsWith('bloom.block.Benefits.custom-pipeline.'));
    expect(pipeline.sort()).toEqual([
      'bloom.block.Benefits.custom-pipeline.compiler',
      'bloom.block.Benefits.custom-pipeline.generator',
      'bloom.block.Benefits.custom-pipeline.loader',
    ]);
  });

  it('records the --radius-button constraint as an accepted gap, not a thrown error', () => {
    const radius = issues.find(
      (i) => i.id === 'bloom.theme-setting.token.--radius-button.constraint-max',
    );
    expect(radius).toBeDefined();
    expect(radius!.canonicalFacts).toMatchObject({ expected: 48, observed: 100 });
  });

  it('records two granular Publications renderer GAPs', () => {
    expect(ids).toContain('bloom.block.Publications.normalization.cards');
    expect(ids).toContain('bloom.block.Publications.normalization.columns');
  });

  it('does not mutate its inputs', () => {
    const snap = currentSnapshot();
    const frozen = JSON.stringify(snap);
    runStructuralChecks(snap, BLOOM_RELEASE_CONTRACT, currentMainTextFieldRows(), currentSettingRows());
    expect(JSON.stringify(snap)).toBe(frozen);
  });
});

describe('runStructuralChecks — synthetic complete fixture', () => {
  it('returns ZERO structural issues when every gap is repaired', () => {
    const issues = runStructuralChecks(
      completeSnapshot(),
      BLOOM_RELEASE_CONTRACT,
      completeMainTextFieldRows(),
      completeSettingRows(),
    );
    expect(issues).toEqual([]);
  });
});

describe('runStructuralChecks — isolated invariant fixtures', () => {
  it('slug drift: manifest slug != PAGE_REGISTRY route', () => {
    const snap = completeSnapshot();
    snap.manifestPages = snap.manifestPages.map((p) =>
      p.id === 'page-about' ? { ...p, slug: 'about-us' } : p,
    );
    const issues = runStructuralChecks(snap, BLOOM_RELEASE_CONTRACT, completeMainTextFieldRows(), completeSettingRows());
    expect(issues.some((i) => i.id === 'bloom.page.page-about.slug-drift')).toBe(true);
  });

  it('duplicate slug/id', () => {
    const snap = completeSnapshot();
    snap.manifestPages = [...snap.manifestPages, { id: 'page-about', slug: 'about' }];
    const issues = runStructuralChecks(snap, BLOOM_RELEASE_CONTRACT, completeMainTextFieldRows(), completeSettingRows());
    expect(issues.some((i) => i.id.includes('duplicate'))).toBe(true);
  });

  it('more than one home page', () => {
    const snap = completeSnapshot();
    snap.manifestPages = [...snap.manifestPages, { id: 'home-2', slug: '' }];
    const issues = runStructuralChecks(snap, BLOOM_RELEASE_CONTRACT, completeMainTextFieldRows(), completeSettingRows());
    expect(issues.some((i) => i.id === 'bloom.page.home.multiple-home')).toBe(true);
  });

  it('missing default-export renderer cannot silently fall back to base', () => {
    const snap = completeSnapshot();
    snap.renderersReachable = snap.renderersReachable.filter((n) => n !== 'Hero');
    const issues = runStructuralChecks(snap, BLOOM_RELEASE_CONTRACT, completeMainTextFieldRows(), completeSettingRows());
    expect(issues.some((i) => i.id === 'bloom.block.Hero.renderer-unreachable')).toBe(true);
  });

  it('missing required runtime source', () => {
    const snap = completeSnapshot();
    snap.runtimeSourcesPresent = snap.runtimeSourcesPresent.filter(
      (s) => !s.endsWith('wishlist.ts'),
    );
    const issues = runStructuralChecks(snap, BLOOM_RELEASE_CONTRACT, completeMainTextFieldRows(), completeSettingRows());
    expect(issues.some((i) => i.id.startsWith('bloom.flow.runtime-source.'))).toBe(true);
  });

  it('a physical block in two locations is a hard error', () => {
    const snap = completeSnapshot();
    snap.physicalBlocks = [
      ...snap.physicalBlocks,
      {
        location: 'blocks',
        name: 'Benefits',
        anatomy: { puckConfig: true, tokens: true, classes: true, astro: true, index: true },
        policy: { ok: true, codes: [], missingFiles: [] },
      },
    ];
    const issues = runStructuralChecks(snap, BLOOM_RELEASE_CONTRACT, completeMainTextFieldRows(), completeSettingRows());
    expect(issues.some((i) => i.id === 'bloom.block.Benefits.duplicate-location')).toBe(true);
  });
});

describe('linkCapabilityFailures + findDuplicateCapabilityIssues', () => {
  const baseRow = (id: string): CapabilityRecord => ({
    id,
    theme: THEME,
    surface: 'block',
    capability: id,
    editable: true,
    scenarios: [],
    modes: ['live'],
    viewports: ['desktop'],
    sources: [],
    status: 'UNKNOWN',
    failureIds: [],
  });

  it('attaches failureIds and upgrades affected rows to GAP', () => {
    const rows = [baseRow('bloom.block.Benefits'), baseRow('bloom.block.Catalog')];
    const issues = runStructuralChecks(
      currentSnapshot(),
      BLOOM_RELEASE_CONTRACT,
      currentMainTextFieldRows(),
      currentSettingRows(),
    );
    const linked = linkCapabilityFailures(rows, issues);
    const benefits = linked.find((r) => r.id === 'bloom.block.Benefits')!;
    expect(benefits.status).toBe('GAP');
    expect(benefits.failureIds.length).toBeGreaterThan(0);
    // Original rows are not mutated.
    expect(rows[0].status).toBe('UNKNOWN');
    expect(rows[0].failureIds).toEqual([]);
  });

  it('emits one granular duplicate issue per duplicated capability ID', () => {
    const dup = findDuplicateCapabilityIssues(
      [baseRow('bloom.block.X'), baseRow('bloom.block.X'), baseRow('bloom.block.Y')],
      THEME,
    );
    expect(dup).toHaveLength(1);
    expect(dup[0].id).toBe('bloom.block.X.duplicate-capability');
    expect(dup[0].status).not.toBe('PASS');
  });
});
