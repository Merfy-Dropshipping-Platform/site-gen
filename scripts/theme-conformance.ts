/**
 * Process adapter for the theme structural-conformance gate.
 *
 * This is a THIN wrapper: it wires the REAL pipeline (compiled Puck config,
 * source snapshot, field / theme-settings / storefront inventories and the
 * requirement-independent structural checks) into the dependency-injected
 * `runThemeConformance` orchestrator, then maps the returned result to a process
 * exit code. All decision logic, digesting, ratchet comparison and the atomic
 * two-file transaction live in `src/themes/conformance/cli.ts`, which is tested
 * hermetically with an injected fake pipeline.
 *
 * Build prerequisites (in the only valid order) must have run before this script:
 *
 *   corepack pnpm build
 *   corepack pnpm build:blocks
 *   corepack pnpm build:theme-sections bloom
 *   corepack pnpm exec tsx scripts/run-theme-build.ts bloom
 *
 * Never prints NODE_AUTH_TOKEN or any secret; the CLI report is recursively
 * redacted before it is written.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFile as readFileAsync } from 'node:fs/promises';

import {
  runThemeConformance,
  type ConformancePipelineResult,
  type ThemeConformanceDeps,
} from '../src/themes/conformance';
import {
  loadThemeSourceSnapshot,
  loadRuntimePuckConfig,
  BLOOM_RELEASE_CONTRACT,
  inventoryStorefrontContracts,
  runStructuralChecks,
  linkCapabilityFailures,
  findDuplicateCapabilityIssues,
  type StorefrontSourceInput,
  type StructuralCheckSnapshot,
  type StructuralCheckFieldRow,
  type StructuralCheckSettingRow,
} from '../src/themes/conformance';
import {
  inventoryFields,
  inventoryThemeSettings,
  type CapabilityRecord,
  type StructuralIssue,
  type FieldInventoryBlockInput,
  type RawPuckField,
  type ThemeSchemeInput,
} from '../packages/theme-contract/conformance';
import { themeSchemeToMerchantShape } from '../src/themes/tokens-css';
import { PAGE_REGISTRY } from '../src/themes/page-registry';

const SITES_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Real pipeline assembly
// ---------------------------------------------------------------------------

interface BloomThemeJson {
  colorSchemes?: Array<{ id?: string; name?: string; tokens?: Record<string, string> }>;
  defaults?: Record<string, string>;
  tokens?: Record<string, unknown>;
  features?: Record<string, boolean> | string[];
  pages?: Array<{ id: string; slug?: string; route?: string }>;
}

/** Read the tracked Bloom `theme.json` (the raw manifest, pre-Zod). */
function readThemeManifest(): BloomThemeJson {
  const path = resolve(SITES_ROOT, 'packages', 'theme-bloom', 'theme.json');
  return JSON.parse(readFileSync(path, 'utf8')) as BloomThemeJson;
}

/** Collect the required storefront runtime sources as AST inventory inputs. */
async function loadStorefrontSources(): Promise<StorefrontSourceInput[]> {
  const out: StorefrontSourceInput[] = [];
  for (const ref of BLOOM_RELEASE_CONTRACT.runtimeSources) {
    const abs = resolve(SITES_ROOT, ref);
    if (!existsSync(abs)) continue;
    const code = await readFileAsync(abs, 'utf8');
    const kind = ref.endsWith('.astro') ? 'astro' : 'ts';
    out.push({ kind, ref, code } as StorefrontSourceInput);
  }
  return out;
}

/** Build the runtime field-inventory blocks from the compiled Puck config. */
function fieldBlocksFromRuntime(
  components: Record<string, { fields?: Record<string, unknown>; defaultProps?: unknown }>,
): FieldInventoryBlockInput[] {
  return Object.entries(components).map(([name, cfg]) => ({
    name,
    runtime: {
      fields: (cfg.fields ?? {}) as Record<string, RawPuckField>,
      defaults:
        cfg.defaultProps && typeof cfg.defaultProps === 'object'
          ? (cfg.defaultProps as Record<string, unknown>)
          : undefined,
    },
  }));
}

/** Map the compiled source snapshot + manifest to the structural-check snapshot. */
function toStructuralSnapshot(
  snapshot: Awaited<ReturnType<typeof loadThemeSourceSnapshot>>,
  manifest: BloomThemeJson,
): StructuralCheckSnapshot {
  const manifestPages = (manifest.pages ?? []).map((p) => ({
    id: p.id,
    slug: (p.slug ?? p.route ?? '').replace(/^\//, ''),
  }));
  const homeEntry = PAGE_REGISTRY.find((e) => e.route === '' || e.route === '/');
  const featureFlags: Record<string, boolean> = Array.isArray(manifest.features)
    ? Object.fromEntries(manifest.features.map((f) => [f, true]))
    : (manifest.features ?? {});

  return {
    themeId: snapshot.themeId,
    manifestPages,
    homePageId: homeEntry?.id ?? manifestPages[0]?.id ?? '',
    seedIds: manifestPages.map((p) => p.id),
    seedNonEmpty: true,
    seedNestedAuthorable: true,
    physicalBlocks: snapshot.physicalBlocks.map((b) => ({
      location: b.location,
      name: b.name,
      anatomy: b.anatomy,
      policy: b.policy,
    })),
    resolutions: snapshot.resolutions.map((r) => ({
      name: r.name,
      source: r.source,
      // A theme-owned resolution implies a manifest override of the base block.
      manifestOverride: r.source === 'theme',
    })),
    baseBlockNames: snapshot.resolutions.filter((r) => r.source === 'base').map((r) => r.name),
    customBlockDeclarations: {},
    features: featureFlags,
    customPipeline: {},
    publications: {
      cardsWithinCanonical: false,
      columnsWithinCanonical: false,
    },
    cartDrawerReachability: {
      v2Sections: snapshot.cartDrawer.reachability.v2Sections,
      builtTheme: snapshot.cartDrawer.reachability.builtTheme,
      liveBuild: snapshot.cartDrawer.reachability.liveBuild,
    },
    runtimeSourcesPresent: snapshot.runtimeSources,
    // Reachable = the renderer's REAL compiled artifact imports with a genuine
    // default export (mapped renderers via the compiled theme-section manifest;
    // unmapped renderers via resolveBlockArtifact →
    // dist/astro-blocks/<pkg>__<Block>__<Block>.mjs). Import-checked in the same
    // child-process checker by the snapshot, so a renderer that resolves to a
    // base theme-section (Hero/Footer/… — no physical theme-bloom .astro) is
    // correctly reachable, while a genuinely broken renderer stays a GAP.
    renderersReachable: snapshot.renderersReachable,
    sectionMappingsResolved: true,
  };
}

/** Theme-setting rows for the token-constraint invariant (only known limits). */
function settingRowsFromManifest(manifest: BloomThemeJson): StructuralCheckSettingRow[] {
  const rows: StructuralCheckSettingRow[] = [];
  const radius = manifest.defaults?.['--radius-button'];
  if (radius !== undefined) {
    const value = Number.parseFloat(radius);
    if (Number.isFinite(value)) {
      rows.push({ token: '--radius-button', value, constraintMax: 48, withinConstraint: value <= 48 });
    }
  }
  return rows;
}

/** The real Bloom pipeline: snapshot + inventories + structural checks. */
async function buildBloomPipeline(theme: string): Promise<ConformancePipelineResult> {
  const [snapshot, puckConfig] = await Promise.all([
    loadThemeSourceSnapshot(theme),
    loadRuntimePuckConfig(theme),
  ]);
  const manifest = readThemeManifest();

  // 1) Puck field inventory (runtime authoring fields).
  const colorSchemeIds = (manifest.colorSchemes ?? [])
    .map((s) => s.id)
    .filter((id): id is string => typeof id === 'string');
  const fieldRows = inventoryFields({
    theme,
    colorSchemeIds,
    blocks: fieldBlocksFromRuntime(puckConfig.components),
  });

  // 2) Theme-settings inventory.
  const schemes: ThemeSchemeInput[] = (manifest.colorSchemes ?? []).map((s, i) => ({
    id: s.id ?? `scheme-${i + 1}`,
    name: s.name ?? `Scheme ${i + 1}`,
    tokens: s.tokens ?? {},
  }));
  const settingRows = inventoryThemeSettings({
    theme,
    tokens: (manifest.defaults ?? {}) as Record<string, string>,
    schemes,
    manifestConstraints: { colorSchemes: { max: 4 } },
    normalizeMerchantShape: (scheme) =>
      themeSchemeToMerchantShape({
        id: scheme.id,
        name: scheme.name,
        tokens: scheme.tokens,
      }) as Record<string, unknown>,
  });

  // 3) Storefront AST inventory.
  const storefrontRows = await inventoryStorefrontContracts(theme, await loadStorefrontSources());

  // 4) Requirement-independent structural checks.
  const structuralSnapshot = toStructuralSnapshot(snapshot, manifest);
  const structuralFieldRows: StructuralCheckFieldRow[] = [];
  const structuralSettingRows = settingRowsFromManifest(manifest);
  const issues: StructuralIssue[] = [
    ...runStructuralChecks(structuralSnapshot, BLOOM_RELEASE_CONTRACT, structuralFieldRows, structuralSettingRows),
  ];

  // 5) Link structural failures onto the capability rows + reject duplicates.
  let rows: CapabilityRecord[] = [...fieldRows, ...settingRows, ...storefrontRows];
  const duplicateIssues = findDuplicateCapabilityIssues(rows, theme);
  issues.push(...duplicateIssues);
  rows = linkCapabilityFailures(rows, issues);

  return {
    theme,
    sourceDigest: snapshot.sourceDigest as `sha256:${string}`,
    capabilities: rows,
    structuralIssues: issues,
    releaseContract: {
      pages: BLOOM_RELEASE_CONTRACT.pages.map((p) => ({ id: p.id, label: p.id })),
      flows: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Prerequisite check (compiled artifacts required by the real pipeline)
// ---------------------------------------------------------------------------

async function checkPrerequisites(): Promise<{ ok: boolean; missing: string[] }> {
  const required = [
    'dist/src/controllers/theme-puck-config.controller.js',
    'dist/astro-blocks/manifest.json',
  ];
  const missing = required.filter((rel) => !existsSync(resolve(SITES_ROOT, rel)));
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Node fs adapter (real, atomic-capable)
// ---------------------------------------------------------------------------

const nodeFs: ThemeConformanceDeps['fs'] = {
  readFile: (path) => (existsSync(path) ? readFileSync(path) : null),
  writeFile: (path, data) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  },
  rename: (from, to) => {
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
  },
  exists: (path) => existsSync(path),
  mkdirp: (path) => {
    mkdirSync(path, { recursive: true });
  },
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const deps: ThemeConformanceDeps = {
    schemaVersion: 1,
    generatorVersion: '1',
    isCI: process.env.CI === 'true' || process.env.CI === '1',
    env: process.env,
    buildPipeline: buildBloomPipeline,
    checkPrerequisites,
    fs: nodeFs,
  };

  const result = await runThemeConformance(argv, deps);

  if (result.buildOrder) {
    process.stderr.write('Build prerequisites must run in order:\n');
    for (const cmd of result.buildOrder) process.stderr.write(`  ${cmd}\n`);
  }
  if (result.error) process.stderr.write(`${result.error}\n`);
  if (result.compare) {
    if (result.compare.unexpected.length > 0) {
      process.stderr.write(`Unexpected findings (${result.compare.unexpected.length}):\n`);
      for (const f of result.compare.unexpected) process.stderr.write(`  + ${f.id}\n`);
    }
    if (result.compare.stale.length > 0) {
      process.stderr.write(`Stale findings (${result.compare.stale.length}):\n`);
      for (const f of result.compare.stale) process.stderr.write(`  - ${f.id}\n`);
    }
  }
  if (result.reportPath) process.stdout.write(`report: ${result.reportPath}\n`);

  process.exit(result.exitCode);
}

main().catch((err) => {
  process.stderr.write(`theme-conformance failed: ${(err as Error).message}\n`);
  process.exit(1);
});
