/**
 * Structural invariants for Bloom conformance.
 *
 * `runStructuralChecks(snapshot, contract, fieldRows, settingRows)` returns
 * sorted deterministic {@link StructuralIssue}s and NEVER mutates production
 * data. Each check emits a finding ONLY when its defect is present, so a
 * synthetic complete fixture (every gap repaired) returns zero issues, while the
 * real-current fixture exposes the twenty named structural findings.
 *
 * `expectedCode`/`observedCode` are STABLE machine codes; human error text lives
 * only in `detail`. IDs never contain whitespace or exception text.
 *
 * `linkCapabilityFailures(rows, issues)` attaches exact `failureIds` and upgrades
 * affected rows to GAP (returning NEW rows). `findDuplicateCapabilityIssues`
 * emits one granular issue per duplicated capability ID.
 */

import type {
  CapabilityRecord,
  StructuralIssue,
} from '../../../packages/theme-contract/conformance';
import type { BloomReleaseContract } from './bloom-release-contract';

// --- input contract ---------------------------------------------------------

export interface StructuralCheckPhysicalBlock {
  location: 'blocks' | 'customBlocks';
  name: string;
  anatomy: {
    puckConfig: boolean;
    tokens: boolean;
    classes: boolean;
    astro: boolean;
    index: boolean;
  };
  policy: { ok: boolean; codes: string[]; missingFiles: string[] };
}

export interface StructuralCheckResolution {
  name: string;
  source: string; // 'base' | 'theme'
  manifestOverride: boolean;
  overrideReason?: string;
}

export interface StructuralCheckCustomPipeline {
  /** declared `./customBlocks/<Name>` path, or null when undeclared. */
  declaredPath: string | null;
  physicalLocation: 'blocks' | 'customBlocks';
  compilerReachable: boolean;
  loaderReachable: boolean;
  generatorReachable: boolean;
}

export interface StructuralCheckSnapshot {
  themeId: string;
  /** manifest page rows (id + slug). */
  manifestPages: Array<{ id: string; slug: string }>;
  /** canonical home page id. */
  homePageId: string;
  /** page ids present in manifest seeds. */
  seedIds: string[];
  seedNonEmpty: boolean;
  seedNestedAuthorable: boolean;
  physicalBlocks: StructuralCheckPhysicalBlock[];
  resolutions: StructuralCheckResolution[];
  /** canonical base block names (a physical base-name block needs an override). */
  baseBlockNames: string[];
  /** customBlocks declarations keyed by name. */
  customBlockDeclarations: Record<
    string,
    { path: string; requiredFeatures: string[] }
  >;
  /** feature flags actually enabled. */
  features: Record<string, boolean>;
  /** custom-block pipeline reachability keyed by block name. */
  customPipeline: Record<string, StructuralCheckCustomPipeline>;
  /** Publications mapped-renderer canonical conformance. */
  publications: { cardsWithinCanonical: boolean; columnsWithinCanonical: boolean };
  /** observed cart-drawer call-site reachability. */
  cartDrawerReachability: { v2Sections: boolean; builtTheme: boolean; liveBuild: boolean };
  /** repo-relative runtime source files actually present. */
  runtimeSourcesPresent: string[];
  /** generator/section renderer names reachable with a real default export. */
  renderersReachable: string[];
  /** true when every source section mapping resolves inside the theme root. */
  sectionMappingsResolved: boolean;
}

/** A field row consumed by the Puck/schema invariants (from the field inventory). */
export interface StructuralCheckFieldRow {
  block: string;
  capability: string;
  /** input leaf that must survive a successful parse. */
  inputLeaf: string;
  survivesParse: boolean;
  origin: 'raw-puck-default' | 'effective-defaults' | 'seed' | 'blockDefault';
  /** true when the effective default is invalid for the schema. */
  effectiveDefaultInvalid?: boolean;
}

/** A theme-setting row consumed by the token constraint invariant. */
export interface StructuralCheckSettingRow {
  token: string;
  value: number;
  constraintMax: number;
  withinConstraint: boolean;
}

// --- finding factory --------------------------------------------------------

function issue(
  id: string,
  theme: string,
  status: StructuralIssue['status'],
  expectedCode: string,
  observedCode: string,
  detail: string,
  canonicalFacts: Record<string, unknown> = {},
  sources: StructuralIssue['sources'] = [],
): StructuralIssue {
  return { id, theme, status, expectedCode, observedCode, canonicalFacts, detail, sources };
}

const bid = (theme: string, ...seg: string[]) => [theme, ...seg].join('.');

// --- page invariants --------------------------------------------------------

function checkPages(
  snap: StructuralCheckSnapshot,
  contract: BloomReleaseContract,
  out: StructuralIssue[],
): void {
  const theme = snap.themeId;

  // Duplicate ids / slugs.
  const idCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();
  for (const p of snap.manifestPages) {
    idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1);
    slugCounts.set(p.slug, (slugCounts.get(p.slug) ?? 0) + 1);
  }
  for (const [id, n] of [...idCounts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n > 1) {
      out.push(
        issue(
          bid(theme, 'page', id, 'duplicate-id'),
          theme,
          'GAP',
          'unique-page-id',
          'duplicate-page-id',
          `page id "${id}" appears ${n} times`,
          { id, count: n },
        ),
      );
    }
  }
  for (const [slug, n] of [...slugCounts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n > 1) {
      out.push(
        issue(
          bid(theme, 'page', `slug:${slug || 'home'}`, 'duplicate-slug'),
          theme,
          'GAP',
          'unique-page-slug',
          'duplicate-page-slug',
          `page slug "${slug}" appears ${n} times`,
          { slug, count: n },
        ),
      );
    }
  }

  // Exactly one home page (route '').
  const homeRows = snap.manifestPages.filter((p) => p.slug === '');
  if (homeRows.length !== 1) {
    out.push(
      issue(
        bid(theme, 'page', 'home', 'multiple-home'),
        theme,
        'GAP',
        'exactly-one-home',
        `home-count-${homeRows.length}`,
        `expected exactly one home page, found ${homeRows.length}`,
        { count: homeRows.length },
      ),
    );
  }

  // Slug drift: manifest slug must equal PAGE_REGISTRY route.
  const routeById = new Map(contract.pages.map((p) => [p.id, p.route]));
  for (const p of snap.manifestPages) {
    const expected = routeById.get(p.id);
    if (expected !== undefined && p.slug !== expected) {
      out.push(
        issue(
          bid(theme, 'page', p.id, 'slug-drift'),
          theme,
          'GAP',
          'slug-matches-registry',
          'slug-drift',
          `manifest slug "${p.slug}" != registry route "${expected}" for ${p.id}`,
          { expected, observed: p.slug },
        ),
      );
    }
  }

  // Required pages must exist in the manifest AND have a seed.
  const manifestIds = new Set(snap.manifestPages.map((p) => p.id));
  const seedSet = new Set(snap.seedIds);
  for (const req of contract.pages) {
    if (!manifestIds.has(req.id)) {
      out.push(
        issue(
          bid(theme, 'page', req.id, 'manifest'),
          theme,
          'GAP',
          'page-in-manifest',
          'page-absent',
          `required page "${req.id}" missing from manifest`,
          { id: req.id, route: req.route },
        ),
      );
    }
    if (!seedSet.has(req.id)) {
      out.push(
        issue(
          bid(theme, 'page', req.id, 'seed'),
          theme,
          'GAP',
          'page-seed-present',
          'page-seed-absent',
          `required page "${req.id}" has no seed`,
          { id: req.id },
        ),
      );
    }
  }
}

// --- block & renderer invariants -------------------------------------------

function checkBlocks(
  snap: StructuralCheckSnapshot,
  contract: BloomReleaseContract,
  out: StructuralIssue[],
): void {
  const theme = snap.themeId;
  const baseNames = new Set(snap.baseBlockNames);
  const resolvedNames = new Set(snap.resolutions.map((r) => r.name));

  // Same canonical name in two physical locations.
  const locByName = new Map<string, Set<string>>();
  for (const b of snap.physicalBlocks) {
    if (!locByName.has(b.name)) locByName.set(b.name, new Set());
    locByName.get(b.name)!.add(b.location);
  }
  for (const [name, locs] of [...locByName].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (locs.size > 1) {
      out.push(
        issue(
          bid(theme, 'block', name, 'duplicate-location'),
          theme,
          'GAP',
          'single-physical-location',
          'two-physical-locations',
          `block "${name}" exists in ${[...locs].sort().join(' + ')}`,
          { name, locations: [...locs].sort() },
        ),
      );
    }
  }

  for (const b of snap.physicalBlocks) {
    // Five-file anatomy: one issue per missing member (never collapsed).
    const anatomyMembers: Array<[keyof typeof b.anatomy, string]> = [
      ['astro', 'astro'],
      ['puckConfig', 'puck-config'],
      ['classes', 'classes'],
      ['tokens', 'tokens'],
      ['index', 'index'],
    ];
    for (const [key, seg] of anatomyMembers) {
      if (!b.anatomy[key]) {
        out.push(
          issue(
            bid(theme, 'block', b.name, 'anatomy', seg),
            theme,
            'GAP',
            'anatomy-member-present',
            'anatomy-member-missing',
            `block "${b.name}" is missing its ${seg} file`,
            { name: b.name, member: seg },
          ),
        );
      }
    }

    // validateBlock policy findings (Astro-only + literal colors).
    for (const code of [...new Set(b.policy.codes)].sort()) {
      out.push(
        issue(
          bid(theme, 'block', b.name, 'policy', code),
          theme,
          'GAP',
          'policy-clean',
          `policy-${code}`,
          `block "${b.name}" violates the ${code} policy`,
          { name: b.name, policy: code },
        ),
      );
    }

    const isBaseName = baseNames.has(b.name);
    if (isBaseName) {
      // A physical base-name block needs a manifest override with a reason.
      const res = snap.resolutions.find((r) => r.name === b.name);
      const hasReason = !!res?.manifestOverride && !!res?.overrideReason;
      if (!hasReason) {
        out.push(
          issue(
            bid(theme, 'block', b.name, 'override-declaration'),
            theme,
            'GAP',
            'override-declared-with-reason',
            'override-missing',
            `physical base-name block "${b.name}" lacks a manifest override reason`,
            { name: b.name },
          ),
        );
      }
    } else {
      // A NON-base physical block needs a customBlocks declaration + feature.
      const decl = snap.customBlockDeclarations[b.name];
      if (!decl) {
        out.push(
          issue(
            bid(theme, 'block', b.name, 'custom-declaration'),
            theme,
            'GAP',
            'custom-declared',
            'custom-undeclared',
            `non-base physical block "${b.name}" has no customBlocks declaration`,
            { name: b.name },
          ),
        );
      }
      // Custom block must physically live at customBlocks/<Name>.
      if (b.location !== 'customBlocks') {
        out.push(
          issue(
            bid(theme, 'block', b.name, 'custom-location'),
            theme,
            'GAP',
            'custom-at-customBlocks',
            `custom-at-${b.location}`,
            `custom block "${b.name}" must live at customBlocks/${b.name}, found under ${b.location}/`,
            { name: b.name, location: b.location },
          ),
        );
      }
      // Its declaration path must pass compiler/loader/generator reachability.
      const pipe = snap.customPipeline[b.name];
      if (pipe) {
        if (!pipe.compilerReachable) {
          out.push(
            issue(
              bid(theme, 'block', b.name, 'custom-pipeline', 'compiler'),
              theme,
              'GAP',
              'compiler-reachable',
              'compiler-unreachable',
              `custom block "${b.name}" is not compiler-reachable`,
              { name: b.name },
            ),
          );
        }
        if (!pipe.loaderReachable) {
          out.push(
            issue(
              bid(theme, 'block', b.name, 'custom-pipeline', 'loader'),
              theme,
              'GAP',
              'loader-reachable',
              'loader-unreachable',
              `custom block "${b.name}" is not loader-reachable`,
              { name: b.name },
            ),
          );
        }
        if (!pipe.generatorReachable) {
          out.push(
            issue(
              bid(theme, 'block', b.name, 'custom-pipeline', 'generator'),
              theme,
              'GAP',
              'generator-reachable',
              'generator-unreachable',
              `custom block "${b.name}" is not generator-reachable`,
              { name: b.name },
            ),
          );
        }
      }
      // A non-base physical block that is not resolved to authoring.
      if (!resolvedNames.has(b.name)) {
        out.push(
          issue(
            bid(theme, 'block', b.name, 'authoring'),
            theme,
            'GAP',
            'authorable',
            'not-authorable',
            `physical-only block "${b.name}" is not resolved to authoring`,
            { name: b.name },
          ),
        );
      }
    }
  }

  // Every required renderer must be reachable (no silent base fallback).
  const reachable = new Set(snap.renderersReachable);
  for (const r of contract.renderers) {
    if (!reachable.has(r.name)) {
      out.push(
        issue(
          bid(theme, 'block', r.name, 'renderer-unreachable'),
          theme,
          'GAP',
          'renderer-default-export',
          'renderer-unreachable',
          `renderer "${r.name}" has no reachable default export`,
          { name: r.name, importPath: r.importPath },
        ),
      );
    }
  }

  // Source section mappings must resolve.
  if (!snap.sectionMappingsResolved) {
    out.push(
      issue(
        bid(theme, 'block', 'section-map', 'unresolved'),
        theme,
        'GAP',
        'section-mappings-resolve',
        'section-mappings-unresolved',
        'a source section mapping does not resolve inside the theme root',
      ),
    );
  }
}

// --- Puck & schema invariants ----------------------------------------------

function checkSchema(
  snap: StructuralCheckSnapshot,
  fieldRows: StructuralCheckFieldRow[],
  out: StructuralIssue[],
): void {
  const theme = snap.themeId;
  for (const row of fieldRows) {
    // A raw Puck default leaf that a successful parse silently strips (orphan).
    if (row.origin === 'raw-puck-default' && !row.survivesParse) {
      out.push(
        issue(
          bid(theme, 'block', row.block, 'schema-puck-default-orphan', row.inputLeaf),
          theme,
          'GAP',
          'leaf-survives-parse',
          'leaf-stripped-by-parse',
          `raw Puck default "${row.inputLeaf}" on ${row.block} is stripped by a successful parse`,
          { block: row.block, leaf: row.inputLeaf },
        ),
      );
    }
    // An effective default that is invalid for the schema.
    if (row.origin === 'effective-defaults' && row.effectiveDefaultInvalid) {
      out.push(
        issue(
          bid(theme, 'block', row.block, 'schema-effective-defaults'),
          theme,
          'GAP',
          'effective-defaults-valid',
          'effective-defaults-invalid',
          `effective defaults for ${row.block} are invalid for its schema`,
          { block: row.block, leaf: row.inputLeaf },
        ),
      );
    }
  }
}

// --- Theme Settings invariants ---------------------------------------------

function checkThemeSettings(
  snap: StructuralCheckSnapshot,
  settingRows: StructuralCheckSettingRow[],
  out: StructuralIssue[],
): void {
  const theme = snap.themeId;
  for (const row of settingRows) {
    if (!row.withinConstraint) {
      out.push(
        issue(
          bid(theme, 'theme-setting', 'token', row.token, 'constraint-max'),
          theme,
          // Accepted initial gap/decision — NOT an unconditional command failure
          // and NOT a silent value/registry change (F-043).
          'NEEDS_DECISION',
          'token-within-registry-max',
          'token-exceeds-registry-max',
          `token ${row.token}=${row.value} exceeds registry max ${row.constraintMax}`,
          { token: row.token, expected: row.constraintMax, observed: row.value },
        ),
      );
    }
  }
}

// --- shared normalization invariants (Publications) ------------------------

function checkPublications(
  snap: StructuralCheckSnapshot,
  out: StructuralIssue[],
): void {
  const theme = snap.themeId;
  // The mapped Bloom renderer diverges from the canonical contract (F-055):
  // separate cards / columns GAPs per effective mapped renderer.
  if (!snap.publications.cardsWithinCanonical) {
    out.push(
      issue(
        bid(theme, 'block', 'Publications', 'normalization', 'cards'),
        theme,
        'GAP',
        'cards-canonical-clamp',
        'cards-mapped-renderer-divergent',
        'Bloom mapped Publications renderer diverges on card count (max 12 vs canonical 4)',
        { boundary: 'cards' },
      ),
    );
  }
  if (!snap.publications.columnsWithinCanonical) {
    out.push(
      issue(
        bid(theme, 'block', 'Publications', 'normalization', 'columns'),
        theme,
        'GAP',
        'columns-canonical-clamp',
        'columns-mapped-renderer-divergent',
        'Bloom mapped Publications renderer diverges on column count (max 6 vs canonical 4)',
        { boundary: 'columns' },
      ),
    );
  }
}

// --- feature / runtime / cart-drawer invariants ----------------------------

function checkFeaturesAndFlows(
  snap: StructuralCheckSnapshot,
  contract: BloomReleaseContract,
  out: StructuralIssue[],
): void {
  const theme = snap.themeId;

  // Required features must be declared AND enabled.
  for (const feat of contract.features) {
    if (!snap.features[feat]) {
      out.push(
        issue(
          bid(theme, 'flow', feat, 'feature'),
          theme,
          'GAP',
          'feature-enabled',
          'feature-disabled-or-missing',
          `required feature "${feat}" is not enabled`,
          { feature: feat },
        ),
      );
    }
  }

  // Required runtime sources must be present.
  const present = new Set(snap.runtimeSourcesPresent);
  for (const src of contract.runtimeSources) {
    if (!present.has(src)) {
      const base = src.split('/').pop() ?? src;
      out.push(
        issue(
          bid(theme, 'flow', 'runtime-source', base),
          theme,
          'GAP',
          'runtime-source-present',
          'runtime-source-missing',
          `required runtime source "${src}" is missing`,
          { source: src },
        ),
      );
    }
  }

  // Cart-drawer built-theme global injection: the contract REQUIRES it; on the
  // target ref the blob call omits the argument (F-053) → structural GAP.
  const req = contract.cartDrawer.requiredCallSites;
  const obs = snap.cartDrawerReachability;
  if (req.builtTheme && !obs.builtTheme) {
    out.push(
      issue(
        bid(theme, 'flow', 'cart-drawer', 'preview-built-theme-global-injection'),
        theme,
        'GAP',
        'built-theme-globals-injected',
        'built-theme-globals-omitted',
        'built-theme preview path does not pass cart-drawer globals to injectPreviewGlobals',
        {
          path: 'v2-built-theme',
          globals: [...contract.cartDrawer.globals].sort(),
          observedArgument: 'undefined',
          affectedRoutePrefixes: ['product', 'cart', 'checkout'].sort(),
        },
      ),
    );
  }
}

// --- public API -------------------------------------------------------------

/**
 * Run all structural invariants. Returns sorted deterministic issues; never
 * mutates its inputs.
 */
export function runStructuralChecks(
  snapshot: StructuralCheckSnapshot,
  contract: BloomReleaseContract,
  fieldRows: StructuralCheckFieldRow[],
  settingRows: StructuralCheckSettingRow[],
): StructuralIssue[] {
  const out: StructuralIssue[] = [];
  checkPages(snapshot, contract, out);
  checkBlocks(snapshot, contract, out);
  checkSchema(snapshot, fieldRows, out);
  checkThemeSettings(snapshot, settingRows, out);
  checkPublications(snapshot, out);
  checkFeaturesAndFlows(snapshot, contract, out);
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * Attach exact `failureIds` from structural issues to their matching capability
 * rows and upgrade affected rows to GAP. Returns NEW rows (inputs untouched). A
 * structural issue `bloom.block.Benefits.anatomy.classes` links to the capability
 * `bloom.block.Benefits` (its dotted ID prefix).
 */
export function linkCapabilityFailures(
  rows: CapabilityRecord[],
  issues: StructuralIssue[],
): CapabilityRecord[] {
  const failuresByRow = new Map<string, string[]>();
  const rowIds = rows.map((r) => r.id).sort((a, b) => (a.length > b.length ? -1 : 1));
  for (const iss of issues) {
    // Longest capability ID that is a dotted prefix of the issue ID wins.
    const owner = rowIds.find(
      (rid) => iss.id === rid || iss.id.startsWith(`${rid}.`),
    );
    if (owner) {
      if (!failuresByRow.has(owner)) failuresByRow.set(owner, []);
      failuresByRow.get(owner)!.push(iss.id);
    }
  }
  return rows.map((r) => {
    const failures = failuresByRow.get(r.id);
    if (!failures || failures.length === 0) return { ...r };
    return {
      ...r,
      failureIds: [...new Set([...r.failureIds, ...failures])].sort(),
      status: 'GAP',
    };
  });
}

/** Emit one granular issue per duplicated capability ID (never one aggregate). */
export function findDuplicateCapabilityIssues(
  rows: CapabilityRecord[],
  theme: string,
): StructuralIssue[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  const out: StructuralIssue[] = [];
  for (const [id, n] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n > 1) {
      out.push(
        issue(
          `${id}.duplicate-capability`,
          theme,
          'GAP',
          'unique-capability-id',
          'duplicate-capability-id',
          `capability id "${id}" appears ${n} times`,
          { id, count: n },
        ),
      );
    }
  }
  return out;
}
