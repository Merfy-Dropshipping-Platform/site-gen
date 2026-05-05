import * as RevisionMigrations from '../revision-migrations';

/**
 * 084 vanilla pilot — Stage 2 Task 13 (v10).
 *
 * `migrateVanillaHomePage(pagesData, themeId)` — version-based seed
 * migration. Pins the contract:
 *   1. With themeId='vanilla' and missing/empty `home.content` →
 *      seeds the canonical 10-block home array, third block === Hero
 *      (carousel mode), sets
 *      `_vanillaHomeMigrationVersion = VANILLA_HOME_MIGRATION_VERSION`.
 *   2. Each seeded block carries vanilla-specific props baked in
 *      (logoPosition='center-absolute', buttonStyle='outlined',
 *      formLayout='inline-submit', swatchOverlay=true,
 *      bottomStrip.enabled=true, scheme assignments per Figma, 120px
 *      y-padding on body blocks per Figma vanilla `1:18954`, etc.) so
 *      the merchant sees the variants in the constructor without
 *      depending on render-time blockDefaults.
 *   3. Existing pre-v10 seeds (e.g. v0 legacy, v2 with Slideshow #3, or
 *      any version < 10) → auto-upgraded to v10.
 *   4. Already on v10 → idempotent no-op.
 *   5. With themeId='rose' (or other non-vanilla) → home.content is
 *      left untouched.
 *
 * Stage 2 versions bumped through 4..10 (Tasks 4-10 each +1):
 *   v4 Header padding 32/32 → v5 Collections titleAlignment=left+pad 120
 *   → v6 MainText scheme-2 + cta + italic + pad 120
 *   → v7 Video scheme-1 + pad 120
 *   → v8 ImageWithText scheme-2 + pad 120 + italic
 *   → v9 PopularProducts cards=6/cols=3 + pad 120 + heading left
 *   → v10 Newsletter scheme-2 + inline-submit + alignment=left + pad 120.
 */
describe('migrateVanillaHomePage (084 — Stage 2 v10)', () => {
  const { migrateVanillaHomePage, VANILLA_HOME_MIGRATION_VERSION } =
    RevisionMigrations;

  type Block = { type: string; props: Record<string, unknown> };
  type Home = { content: Block[]; root?: unknown; zones?: unknown };

  const expectedSequence = [
    'PromoBanner',
    'Header',
    'Hero',
    'Collections',
    'MainText',
    'Video',
    'ImageWithText',
    'PopularProducts',
    'Newsletter',
    'Footer',
  ];

  it('migrateVanillaHomePage and version constant are exported', () => {
    expect(typeof migrateVanillaHomePage).toBe('function');
    expect(VANILLA_HOME_MIGRATION_VERSION).toBe(11);
  });

  it('seeds 10 vanilla home blocks when themeId=vanilla + empty home + version flag set', () => {
    const pagesData = { home: { content: [] } };
    const out = migrateVanillaHomePage(pagesData, 'vanilla') as Record<string, unknown>;
    const home = out.home as Home;
    const types = home.content.map((b) => b.type);
    expect(types).toEqual(expectedSequence);
    expect(types[2]).toBe('Hero');
    expect(out._vanillaHomeMigrationVersion).toBe(11);
  });

  it('upgrades existing pre-v11 seed (legacy Hero in slot #3, no version flag) to v11 (Hero+carousel)', () => {
    const pagesData = {
      home: {
        content: [
          { type: 'PromoBanner', props: {} },
          { type: 'Header', props: {} },
          { type: 'Hero', props: {} }, // legacy seed — replaced with v11 Hero+carousel
          { type: 'Footer', props: {} },
        ],
      },
    };
    const out = migrateVanillaHomePage(pagesData, 'vanilla') as Record<string, unknown>;
    const home = out.home as Home;
    expect(home.content.map((b) => b.type)).toEqual(expectedSequence);
    expect(home.content[2].type).toBe('Hero');
    expect((home.content[2].props as Record<string, unknown>).mode).toBe('carousel');
    expect(out._vanillaHomeMigrationVersion).toBe(11);
  });

  it('is no-op when already on current version (v11)', () => {
    const home = { content: [{ type: 'Hero', props: { id: 'kept', mode: 'carousel' } }] };
    const pagesData = {
      _vanillaHomeMigrationVersion: 11,
      home,
    };
    const out = migrateVanillaHomePage(pagesData, 'vanilla');
    expect(out).toBe(pagesData);
    expect((out as { home: Home }).home).toBe(home);
  });

  it('v2 (Slideshow at #2) auto-upgrades to v11 (Hero+carousel)', () => {
    const v2Data = {
      pagesData: {
        _vanillaHomeMigrationVersion: 2,
        home: {
          content: [
            { type: 'PromoBanner', props: {} },
            { type: 'Header', props: {} },
            { type: 'Slideshow', props: { slides: [{ id: 's1', imageUrl: 'x' }] } },
            { type: 'Collections', props: {} },
            { type: 'MainText', props: {} },
            { type: 'Video', props: {} },
            { type: 'ImageWithText', props: {} },
            { type: 'PopularProducts', props: {} },
            { type: 'Newsletter', props: {} },
            { type: 'Footer', props: {} },
          ],
        },
      },
    };
    const result = RevisionMigrations.migrateRevisionData(v2Data, 'vanilla');
    const pagesData = result.pagesData as Record<string, unknown>;
    expect(pagesData._vanillaHomeMigrationVersion).toBe(11);
    const home = pagesData.home as Home;
    expect(home.content[2].type).toBe('Hero');
    expect((home.content[2].props as Record<string, unknown>).mode).toBe('carousel');
    expect(Array.isArray((home.content[2].props as Record<string, unknown>).slides)).toBe(true);
    expect(((home.content[2].props as Record<string, unknown>).slides as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('v11 already (no-op idempotent)', () => {
    const v11Data = {
      pagesData: {
        _vanillaHomeMigrationVersion: 11,
        home: { content: [{ type: 'Hero', props: { mode: 'carousel', slides: [] } }] },
      },
    };
    const result = RevisionMigrations.migrateRevisionData(v11Data, 'vanilla');
    const pagesData = result.pagesData as Record<string, unknown>;
    expect(pagesData._vanillaHomeMigrationVersion).toBe(11);
    const home = pagesData.home as Home;
    expect(home.content.length).toBe(1);
  });

  it('leaves non-vanilla themes untouched', () => {
    const pagesData = { home: { content: [] } };
    const out = migrateVanillaHomePage(pagesData, 'rose');
    expect(out).toBe(pagesData);
    const home = (out as { home: { content: unknown[] } }).home;
    expect(home.content).toEqual([]);
    expect((out as Record<string, unknown>)._vanillaHomeMigrationVersion).toBeUndefined();
  });

  it('is idempotent — running twice yields identical pagesData', () => {
    const pagesData = { home: { content: [] } };
    const once = migrateVanillaHomePage(pagesData, 'vanilla');
    const twice = migrateVanillaHomePage(once as Record<string, unknown>, 'vanilla');
    expect(twice).toBe(once);
  });

  it('bakes in vanilla-specific props on each block (variants visible in constructor)', () => {
    const out = migrateVanillaHomePage({ home: { content: [] } }, 'vanilla') as Record<
      string,
      unknown
    >;
    const blocks = (out.home as Home).content;

    // PromoBanner
    const promoBanner = blocks[0].props as Record<string, unknown>;
    expect(promoBanner.size).toBe('thin');
    expect(promoBanner.textTransform).toBe('uppercase');
    expect(promoBanner.colorScheme).toBe('scheme-1');

    // Header — v4 (Stage 2 Task 4): 32/32 padding for 80px Figma height
    const header = blocks[1].props as Record<string, unknown>;
    expect(header.logoPosition).toBe('center-absolute');
    expect(header.activeLinkIndicator).toBe('underline');
    expect(header.padding).toEqual({ top: 32, bottom: 32 });

    // Hero — Stage 1 carousel
    const hero = blocks[2].props as Record<string, unknown>;
    expect(hero.mode).toBe('carousel');
    expect(hero.contentAlign).toBe('left');
    expect(hero.alignment).toBe('left');
    expect(hero.pagination).toBe('numbers');
    expect(Array.isArray(hero.slides)).toBe(true);
    expect((hero.slides as unknown[]).length).toBe(3);

    // Collections — v5 (Stage 2 Task 5): titleAlignment=left + pad 120
    const collections = blocks[3].props as Record<string, unknown>;
    expect(collections.gridAspect).toBe('1:1');
    expect(collections.cardCaptionStyle).toBe('uppercase');
    expect(collections.dataSource).toBe('manual');
    expect(collections.titleAlignment).toBe('left');
    expect(collections.padding).toEqual({ top: 120, bottom: 120 });
    const collArr = collections.collections as Array<{ collectionId: string }>;
    expect(collArr.map((c) => c.collectionId)).toEqual(['mebel', 'dekor']);

    // MainText — v6 (Stage 2 Task 6): scheme-2 + outlined + italic + pad 120
    const mainText = blocks[4].props as Record<string, unknown>;
    expect(mainText.buttonStyle).toBe('outlined');
    expect(mainText.colorScheme).toBe('scheme-2');
    expect(mainText.textStyle).toBe('italic');
    expect(mainText.padding).toEqual({ top: 120, bottom: 120 });
    expect(mainText.cta).toMatchObject({ text: 'К покупкам', href: '/catalog' });

    // Video — v7 (Stage 2 Task 7): scheme-1 + pad 120
    const video = blocks[5].props as Record<string, unknown>;
    expect(video.padded).toBe(true);
    expect(video.colorScheme).toBe('scheme-1');
    expect(video.padding).toEqual({ top: 120, bottom: 120 });

    // ImageWithText — v8 (Stage 2 Task 8): scheme-2 + italic + pad 120
    const iwt = blocks[6].props as Record<string, unknown>;
    expect(iwt.imagePosition).toBe('right');
    expect(iwt.ctaPosition).toBe('bottom-pinned');
    expect(iwt.colorScheme).toBe('scheme-2');
    expect(iwt.textStyle).toBe('italic');
    expect(iwt.padding).toEqual({ top: 120, bottom: 120 });

    // PopularProducts — v9 (Stage 2 Task 9): 3×2 grid + pad 120
    const popular = blocks[7].props as Record<string, unknown>;
    expect(popular.swatchOverlay).toBe(true);
    expect(popular.cardCaptionStyle).toBe('uppercase');
    expect(popular.collection).toBe('mebel');
    expect(popular.cards).toBe(6);
    expect(popular.columns).toBe(3);
    expect(popular.colorScheme).toBe('scheme-3');
    expect(popular.padding).toEqual({ top: 120, bottom: 120 });

    // Newsletter — v10 (Stage 2 Task 10): scheme-2 + inline-submit + left + pad 120
    const newsletter = blocks[8].props as Record<string, unknown>;
    expect(newsletter.formLayout).toBe('inline-submit');
    expect(newsletter.colorScheme).toBe('scheme-2');
    expect(newsletter.alignment).toBe('left');
    expect(newsletter.padding).toEqual({ top: 120, bottom: 120 });

    // Footer
    const footer = blocks[9].props as Record<string, unknown>;
    expect(footer.variant).toBe('2-part-asymmetric');
    expect(footer.bottomStrip).toMatchObject({
      enabled: true,
      text: expect.stringContaining('Powered by Merfy'),
    });
  });

  // 084 Stage 3 Task 6 (v11): bake vanilla-specific Catalog blockDefaults
  // onto Catalog blocks living in `page-catalog.content` and
  // `page-collection.content` (only where prop undefined — preserve merchant
  // edits).
  it('v10 (Stage 2) auto-upgrades to v11 (Catalog vanilla blockDefaults baked in page-catalog)', () => {
    const v10Data = {
      pagesData: {
        _vanillaHomeMigrationVersion: 10,
        home: { content: [] },
        'page-catalog': {
          content: [
            { type: 'Header', props: {} },
            { type: 'Catalog', props: {} },
            { type: 'Footer', props: {} },
          ],
        },
      },
    };
    const result = migrateVanillaHomePage(
      v10Data.pagesData as Record<string, unknown>,
      'vanilla',
    );
    expect(result._vanillaHomeMigrationVersion).toBe(11);
    const pageCatalog = result['page-catalog'] as {
      content: Array<{ type: string; props: Record<string, unknown> }>;
    };
    const catalog = pageCatalog.content[1];
    expect(catalog.props.gridAspect).toBe('1:1');
    expect(catalog.props.cardCaptionStyle).toBe('uppercase');
    expect(catalog.props.colorScheme).toBe('scheme-3');
    expect(catalog.props.filterPosition).toBe('side');
    expect(catalog.props.columns).toBe(2);
    expect(catalog.props.cards).toBe(12);
    expect(catalog.props.padding).toEqual({ top: 120, bottom: 120 });
  });

  it('v11 already (no-op idempotent — merchant edits at v11+ preserved)', () => {
    const v11Data = {
      _vanillaHomeMigrationVersion: 11,
      home: { content: [] },
      'page-catalog': { content: [{ type: 'Catalog', props: { columns: 5, colorScheme: 'scheme-1' } }] },
    };
    const result = migrateVanillaHomePage(v11Data, 'vanilla');
    expect(result._vanillaHomeMigrationVersion).toBe(11);
    // Merchant v11+ edits preserved (early-return, no overwrites)
    const pageCatalog = result['page-catalog'] as { content: Array<{ props: Record<string, unknown> }> };
    expect(pageCatalog.content[0].props.columns).toBe(5);
    expect(pageCatalog.content[0].props.colorScheme).toBe('scheme-1');
  });

  it('v10 → v11 (force-override) replaces all Catalog props with vanilla defaults', () => {
    const v10Data = {
      _vanillaHomeMigrationVersion: 10,
      home: { content: [] },
      'page-catalog': {
        content: [
          {
            type: 'Catalog',
            props: { columns: 4, cardCaptionStyle: 'default', colorScheme: 'scheme-1' },
          },
        ],
      },
    };
    const result = migrateVanillaHomePage(v10Data, 'vanilla');
    const pageCatalog = result['page-catalog'] as { content: Array<{ props: Record<string, unknown> }> };
    // All 9 props now match vanilla defaults — pre-edit values overwritten
    expect(pageCatalog.content[0].props.columns).toBe(2);
    expect(pageCatalog.content[0].props.cardCaptionStyle).toBe('uppercase');
    expect(pageCatalog.content[0].props.colorScheme).toBe('scheme-3');
    expect(pageCatalog.content[0].props.gridAspect).toBe('1:1');
  });

  it('v10 → v11 force-overrides migrateCatalogPage all-themes seed (scheme-2/columns:3/padding:80) with vanilla', () => {
    const pilotShape = {
      _vanillaHomeMigrationVersion: 10,
      home: { content: [] },
      'page-catalog': {
        content: [
          {
            type: 'Catalog',
            props: {
              id: 'Catalog-test',
              cards: 12,
              columns: 3,
              padding: { top: 80, bottom: 80 },
              showSort: 'true',
              showFilter: 'true',
              colorScheme: 'scheme-2',
              filterPosition: 'side',
            },
          },
        ],
      },
    };
    const result = migrateVanillaHomePage(pilotShape, 'vanilla');
    const catalog = (result['page-catalog'] as { content: Array<{ props: Record<string, unknown> }> }).content[0];
    expect(catalog.props.columns).toBe(2);
    expect(catalog.props.colorScheme).toBe('scheme-3');
    expect(catalog.props.padding).toEqual({ top: 120, bottom: 120 });
    expect(catalog.props.gridAspect).toBe('1:1');
    expect(catalog.props.cardCaptionStyle).toBe('uppercase');
    expect(catalog.props.id).toBe('Catalog-test'); // id preserved (not in VANILLA_CATALOG_DEFAULTS)
  });

  it('v10 → v11 also bakes Catalog defaults in page-collection content', () => {
    const v10Data = {
      _vanillaHomeMigrationVersion: 10,
      home: { content: [] },
      'page-collection': {
        content: [
          { type: 'Header', props: {} },
          { type: 'Catalog', props: {} },
          { type: 'Footer', props: {} },
        ],
      },
    };
    const result = migrateVanillaHomePage(v10Data, 'vanilla');
    expect(result._vanillaHomeMigrationVersion).toBe(11);
    const pageCollection = result['page-collection'] as {
      content: Array<{ type: string; props: Record<string, unknown> }>;
    };
    const catalog = pageCollection.content[1];
    expect(catalog.props.gridAspect).toBe('1:1');
    expect(catalog.props.cardCaptionStyle).toBe('uppercase');
    expect(catalog.props.colorScheme).toBe('scheme-3');
    expect(catalog.props.filterPosition).toBe('side');
    expect(catalog.props.columns).toBe(2);
    expect(catalog.props.cards).toBe(12);
    expect(catalog.props.padding).toEqual({ top: 120, bottom: 120 });
  });
});
