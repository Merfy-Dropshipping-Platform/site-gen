import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { composeV2Page } from '../../themes/v2-page-composer';

/**
 * Task 10 (spec 111-flux-constructor-live-markup, plan
 * docs/superpowers/plans/2026-07-27-flux-constructor-live-markup.md):
 * "Поставить запрет на незаметный base fallback".
 *
 * Tasks 0-9 revived all 9 required Flux home sections (packages/theme-flux/
 * pages/home.json) and wired themes/flux/sections.map.json so `pnpm
 * build:theme-sections flux` compiles them into dist/theme-sections/flux/
 * manifest.json. `PreviewService`'s resolver
 * (`resolveV2Section`/`defaultComponentResolver` in ../preview.service.ts)
 * reads that manifest FIRST, and only falls through to the generic
 * `theme-base` cascade when the manifest is missing/incomplete or the
 * mapped file fails to import/render. If that ever regresses silently (a
 * manifest miss, a naming mismatch, a future refactor), the home page would
 * render visually-wrong (generic, non-Flux) markup for that block — with NO
 * error. This spec is the trip wire for that regression.
 *
 * ── Sibling-test conventions this file follows ──────────────────────────
 * - `preview.service.v2-built-theme.test.ts` / `render-v2-content-page.spec.ts`
 *   / `build.service.theme-v2.spec.ts` ALWAYS construct `PreviewService` with
 *   STUBBED `containerFactory`/`componentResolver` (never the real
 *   defaults) — because ts-jest's ESM preset here (`jest.config.ts`:
 *   `moduleFileExtensions: ['ts','js','json']`, no `--experimental-vm-modules`)
 *   cannot dynamically `import()` the plain-ESM `.mjs` files that
 *   `resolveV2Section`/the theme-base cascade load from
 *   dist/theme-sections/<theme>/ and dist/astro-blocks/ — it throws "Cannot
 *   use import statement outside a module". Confirmed empirically while
 *   writing this spec (a scratch test instantiating `new PreviewService()`
 *   with NO stubs hit exactly that error for both the V2 tier and the
 *   theme-base cascade tier, even though the identical mechanism works fine
 *   in a plain Node process — see below).
 * - Because of that, this spec CANNOT call `PreviewService.renderBlock`
 *   in-process the way the sibling tests call other PreviewService methods.
 *   Instead it shells out to `render-probe.mjs` (repo root) — the CLI
 *   Task 9/earlier work built for exactly this purpose: its own header
 *   comment states it "mirrors — deliberately, not a reimplementation" the
 *   production `resolveV2Section` + `defaultContainerFactory` +
 *   `renderToString` path, running in a real Node ESM process where the
 *   dynamic `import()` of compiled `.mjs` sections genuinely works. A probe
 *   that renders successfully is only meaningful because it exercises the
 *   SAME manifest-driven resolution PreviewService.renderBlock's V2 tier
 *   does — confirmed by reading src/services/preview.service.ts's
 *   `resolveV2Section` side-by-side with render-probe.mjs.
 * - The "preview vs live produce the same block HTML for the same props, up
 *   to asset-prefix rewriting" bullet is proven in three complementary
 *   pieces (since the real renderBlock call can't run in-process here):
 *     1. render-probe.mjs (real subprocess) proves resolveV2Section +
 *        Container.renderToString succeed and produce Flux-marked HTML —
 *        this IS renderBlock's success path (the only thing renderBlock
 *        adds on top is deepMergeBlockProps against theme.json
 *        blockDefaults, which does not change *whether* the V2 section
 *        resolves, only the props fed into it).
 *     2. Static source checks confirm BOTH the preview call site
 *        (`PreviewService.renderV2ContentPage`, preview.service.ts) and the
 *        live call site (`composeContentPagesIntoDist`,
 *        src/themes/v2-live-pages.ts) invoke this exact `renderBlock`
 *        method — not a parallel/forked renderer — before composing.
 *     3. `composeV2Page` (a pure, ts-jest-safe function — no dynamic .mjs
 *        import involved) is exercised directly, TWICE, with the SAME
 *        blocksHtml (from step 1) — once with the preview asset-prefix
 *        (`/__theme/<theme>`, per preview.service.ts:497) and once with the
 *        live asset-prefix (`null`, per v2-live-pages.ts:193/370) — and
 *        asserted identical once the injected prefix substring is stripped.
 */

const THEME = 'flux';

const HOME_ORDER = [
  'PromoBanner',
  'Header',
  'Hero',
  'Collections',
  'Product',
  'PopularProducts',
  'ImageWithText',
  'Gallery',
  'Footer',
] as const;

// Flux-exclusive literal Tailwind class, defined ONLY in
// themes/flux/src/styles/global.css (verified via `grep -rl font-roboto-flex
// themes/flux/` at investigation time — no other theme/package defines it).
// It shows up in ALL 9 Flux V2 section sources (themes/flux/src/components/
// **/*.astro — `grep -c font-roboto-flex` returned a nonzero count for every
// one of the 9 files) because Flux hardcodes Roboto Flex typography
// (verbatim-ported verstka), whereas theme-base's blocks use generic,
// theme-agnostic design tokens (`font-heading`/`font-body`) and never a
// theme-specific font literal — confirmed below by reading the actual
// theme-base sources at runtime, not just asserted once.
const FLUX_ONLY_MARKER = 'font-roboto-flex';

const SITES_ROOT = process.cwd();
const RENDER_PROBE = resolve(SITES_ROOT, 'render-probe.mjs');
const MANIFEST_PATH = resolve(
  SITES_ROOT,
  'dist',
  'theme-sections',
  THEME,
  'manifest.json',
);
const HOME_JSON_PATH = resolve(
  SITES_ROOT,
  'packages',
  'theme-flux',
  'pages',
  'home.json',
);

// packages/theme-base/blocks/<Dir>/<File>.astro for each canonical type —
// the file the theme-base cascade tier would compile+render if resolveV2Section
// ever returned null for that block (the exact fallback risk this spec guards).
const BASE_BLOCK_SOURCE: Record<(typeof HOME_ORDER)[number], string> = {
  PromoBanner: 'PromoBanner/PromoBanner.astro',
  Header: 'Header/Header.astro',
  Hero: 'Hero/Hero.astro',
  Collections: 'Collections/Collections.astro',
  Product: 'Product/Product.astro',
  PopularProducts: 'PopularProducts/PopularProducts.astro',
  ImageWithText: 'ImageWithText/ImageWithText.astro',
  Gallery: 'Gallery/Gallery.astro',
  Footer: 'Footer/Footer.astro',
};

interface HomeBlock {
  type: string;
  props: Record<string, unknown>;
}

interface ProbeResult {
  ok: boolean;
  html: string;
  stderr: string;
  status: number | null;
}

/**
 * Render a Flux V2 section through the SAME manifest-driven mechanism
 * PreviewService.renderBlock's V2 tier uses (resolveV2Section +
 * defaultContainerFactory + Container.renderToString) — but out-of-process,
 * via render-probe.mjs, because ts-jest cannot dynamically import the
 * compiled .mjs sections in-process (see file header).
 */
function renderViaProbe(
  blockName: string,
  props: Record<string, unknown>,
): ProbeResult {
  const res = spawnSync(
    process.execPath,
    [RENDER_PROBE, THEME, blockName, JSON.stringify(props)],
    { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 },
  );
  return {
    ok: res.status === 0,
    html: res.stdout ?? '',
    stderr: res.stderr ?? '',
    status: res.status,
  };
}

let manifest: Record<string, string>;
let homeBlocks: HomeBlock[];
// Rendered once per type up front (9 subprocess spawns total, ~2-3s) and
// reused by every test below — avoids re-spawning per-assertion.
const rendered = new Map<string, ProbeResult>();

beforeAll(async () => {
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf-8')) as Record<
      string,
      string
    >;
  } catch (err) {
    throw new Error(
      `dist/theme-sections/flux/manifest.json missing/unreadable at ${MANIFEST_PATH}. ` +
        `Run 'pnpm build:theme-sections flux' before this test (see task-10 brief Step 2). ` +
        `Original error: ${(err as Error)?.message ?? err}`,
    );
  }

  const home = JSON.parse(await readFile(HOME_JSON_PATH, 'utf-8')) as {
    content: HomeBlock[];
  };
  homeBlocks = home.content;

  for (const block of homeBlocks) {
    rendered.set(block.type, renderViaProbe(block.type, block.props));
  }
}, 30000);

describe('Flux home seed: 9 canonical types, real props for the render checks below', () => {
  it('packages/theme-flux/pages/home.json content is exactly the 9 canonical types in order', () => {
    expect(homeBlocks.map((b) => b.type)).toEqual([...HOME_ORDER]);
  });
});

describe('dist/theme-sections/flux/manifest.json maps every canonical type (built by `pnpm build:theme-sections flux`)', () => {
  it.each(HOME_ORDER)('%s has a non-empty manifest mapping', (type) => {
    expect(typeof manifest[type]).toBe('string');
    expect(manifest[type].length).toBeGreaterThan(0);
  });
});

describe('PreviewService.renderBlock({ themeId: "flux" }) resolves the V2 Flux section, not a theme-base fallback', () => {
  it.each(HOME_ORDER)(
    '%s: resolveV2Section mechanism renders successfully (no fall-through to theme-base)',
    (type) => {
      const result = rendered.get(type);
      expect(result).toBeDefined();
      if (!result!.ok) {
        throw new Error(
          `render-probe.mjs failed for flux/${type} (exit ${result!.status}) — ` +
            `the V2 section did not resolve/render, which is exactly the silent-fallback ` +
            `risk this spec guards against. stderr:\n${result!.stderr}`,
        );
      }
      expect(result!.html.length).toBeGreaterThan(0);
    },
  );

  it.each(HOME_ORDER)(
    `%s: rendered HTML contains the Flux-only marker "${FLUX_ONLY_MARKER}" (theme-base's generic version never emits it — see next describe block)`,
    (type) => {
      const result = rendered.get(type)!;
      expect(result.html).toContain(FLUX_ONLY_MARKER);
    },
  );

  it.each(HOME_ORDER)(
    '%s: rendered HTML carries data-puck-component-id matching the block id (selectable in constructor)',
    (type) => {
      const result = rendered.get(type)!;
      const block = homeBlocks.find((b) => b.type === type)!;
      const id = block.props.id as string;
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(result.html).toContain(`data-puck-component-id="${id}"`);
    },
  );
});

describe('the Flux-only marker assertion above has teeth: theme-base sources genuinely lack it', () => {
  // Proves the marker check would actually CATCH a base-fallback regression,
  // rather than merely checking the Flux marker's presence in isolation:
  // read the exact packages/theme-base/blocks/**/*.astro file the cascade
  // tier would compile+render for each canonical type if resolveV2Section
  // ever returned null, and confirm none of them contain the marker.
  it.each(HOME_ORDER)(
    '%s: packages/theme-base/blocks/%s does NOT contain the Flux-only marker',
    async (type) => {
      const file = BASE_BLOCK_SOURCE[type];
      const src = await readFile(
        resolve(SITES_ROOT, 'packages', 'theme-base', 'blocks', file),
        'utf-8',
      );
      expect(src).not.toContain(FLUX_ONLY_MARKER);
    },
  );
});

describe('preview and live compose call the SAME PreviewService.renderBlock (no forked renderer)', () => {
  it('preview.service.ts renderV2ContentPage calls this.renderBlock({ blockName: b.type, ..., themeId: input.themeId }) per block', async () => {
    const src = await readFile(
      resolve(SITES_ROOT, 'src', 'services', 'preview.service.ts'),
      'utf-8',
    );
    expect(src).toMatch(
      /this\.renderBlock\(\{\s*blockName:\s*b\.type,[\s\S]{0,200}?themeId:\s*input\.themeId\s*\}\)/,
    );
  });

  it('v2-live-pages.ts composeContentPagesIntoDist calls getRenderer().renderBlock({ blockName: b.type, ..., themeId: theme, isPreview: false }) per block — same PreviewService class/method, not a parallel renderer', async () => {
    const src = await readFile(
      resolve(SITES_ROOT, 'src', 'themes', 'v2-live-pages.ts'),
      'utf-8',
    );
    expect(src).toMatch(
      /getRenderer\(\)\.renderBlock\(\{\s*blockName:\s*b\.type,[\s\S]{0,200}?themeId:\s*theme,[\s\S]{0,60}?isPreview:\s*false,/,
    );
    // Sanity: getRenderer() really is a PreviewService instance, not a
    // separately-implemented renderer for the live path.
    expect(src).toMatch(
      /import\s*\{\s*PreviewService\s*\}\s*from\s*['"]\.\.\/services\/preview\.service['"];?/,
    );
    expect(src).toMatch(/new PreviewService\(\)/);
  });
});

describe('composeV2Page: preview (assetPrefix "/__theme/flux") and live (assetPrefix null) produce identical output for identical block HTML, up to the injected prefix', () => {
  it('stripping the injected /__theme/flux substring from the preview compose reproduces the live compose byte-for-byte', () => {
    const blockTypes = homeBlocks.map((b) => b.type);
    const blocksHtml = homeBlocks.map((b) => {
      const r = rendered.get(b.type)!;
      if (!r.ok) {
        throw new Error(`render-probe failed for ${b.type} — see earlier describe block`);
      }
      return r.html;
    });

    // Minimal shell recognized by composeV2Page's structural contract
    // (<body> … <header>…</header><main>…</main><footer>…</footer> … </body>) —
    // same stub shape as render-v2-content-page.spec.ts uses.
    const shellHtml =
      '<html><head><title>T</title></head><body><header>H</header><main>M</main><footer>F</footer><script>tail()</script></body></html>';

    // Preview path — src/services/preview.service.ts:497
    //   assetPrefix: `/__theme/${PreviewService.bareThemeKey(input.themeId)}`
    const previewHtml = composeV2Page({
      shellHtml,
      blocksHtml,
      blockTypes,
      assetPrefix: `/__theme/${THEME}`,
    });
    // Live path — src/themes/v2-live-pages.ts:193 / :370 — assetPrefix: null.
    const liveHtml = composeV2Page({
      shellHtml,
      blocksHtml,
      blockTypes,
      assetPrefix: null,
    });

    expect(previewHtml).not.toBeNull();
    expect(liveHtml).not.toBeNull();
    // rewriteRootUrlsToPrefix (src/generator/theme-build.service.ts) only
    // INSERTS the literal `/__theme/<theme>` substring after root-relative
    // URL characters — it never otherwise mutates content, and assetPrefix
    // is composeV2Page's only other branch point. So removing every
    // occurrence of the injected substring from the preview output must
    // reproduce the live output exactly, given the same blocksHtml/blockTypes
    // fed to both calls.
    expect(previewHtml!.split(`/__theme/${THEME}`).join('')).toBe(liveHtml!);
    // And the prefix really was inserted somewhere (root-relative URLs exist
    // in these blocks) — otherwise the assertion above would be vacuous.
    expect(previewHtml).toContain(`/__theme/${THEME}`);
  });
});
