import * as RevisionMigrations from '../revision-migrations';

/**
 * 084 vanilla pilot — T025 v2.
 *
 * `migrateVanillaHomePage(pagesData, themeId)` — version-based seed
 * migration. Pins the contract:
 *   1. With themeId='vanilla' and missing/empty `home.content` →
 *      seeds the canonical 10-block home array, third block === Slideshow,
 *      sets `_vanillaHomeMigrationVersion = 2`.
 *   2. Each seeded block carries vanilla-specific props baked in
 *      (logoPosition='center-absolute', buttonStyle='outlined',
 *      formLayout='inline-submit', swatchOverlay=true,
 *      bottomStrip.enabled=true, etc.) so the merchant sees the variants
 *      in the constructor without depending on render-time blockDefaults.
 *   3. Existing pre-v2 seed (e.g. with Hero #3 and no version flag) →
 *      auto-upgraded to v2 (Slideshow + baked props).
 *   4. Already on v2 → idempotent no-op.
 *   5. With themeId='rose' (or other non-vanilla) → home.content is
 *      left untouched.
 */
describe('migrateVanillaHomePage (084 — T025 v2)', () => {
  const { migrateVanillaHomePage, VANILLA_HOME_MIGRATION_VERSION } =
    RevisionMigrations;

  type Block = { type: string; props: Record<string, unknown> };
  type Home = { content: Block[]; root?: unknown; zones?: unknown };

  const expectedSequence = [
    'PromoBanner',
    'Header',
    'Slideshow',
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
    expect(VANILLA_HOME_MIGRATION_VERSION).toBe(2);
  });

  it('seeds 10 vanilla home blocks when themeId=vanilla + empty home + version flag set', () => {
    const pagesData = { home: { content: [] } };
    const out = migrateVanillaHomePage(pagesData, 'vanilla') as Record<string, unknown>;
    const home = out.home as Home;
    const types = home.content.map((b) => b.type);
    expect(types).toEqual(expectedSequence);
    expect(types[2]).toBe('Slideshow');
    expect(out._vanillaHomeMigrationVersion).toBe(2);
  });

  it('upgrades existing pre-v2 seed (Hero in slot #3) to v2 (Slideshow)', () => {
    const pagesData = {
      home: {
        content: [
          { type: 'PromoBanner', props: {} },
          { type: 'Header', props: {} },
          { type: 'Hero', props: {} }, // legacy seed — must be replaced
          { type: 'Footer', props: {} },
        ],
      },
    };
    const out = migrateVanillaHomePage(pagesData, 'vanilla') as Record<string, unknown>;
    const home = out.home as Home;
    expect(home.content.map((b) => b.type)).toEqual(expectedSequence);
    expect(home.content[2].type).toBe('Slideshow');
    expect(out._vanillaHomeMigrationVersion).toBe(2);
  });

  it('is no-op when already on current version (v2)', () => {
    const home = { content: [{ type: 'Slideshow', props: { id: 'kept' } }] };
    const pagesData = {
      _vanillaHomeMigrationVersion: 2,
      home,
    };
    const out = migrateVanillaHomePage(pagesData, 'vanilla');
    expect(out).toBe(pagesData);
    expect((out as { home: Home }).home).toBe(home);
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

    const promoBanner = blocks[0].props as Record<string, unknown>;
    expect(promoBanner.size).toBe('thin');
    expect(promoBanner.textTransform).toBe('uppercase');
    expect(promoBanner.colorScheme).toBe('scheme-1');

    const header = blocks[1].props as Record<string, unknown>;
    expect(header.logoPosition).toBe('center-absolute');
    expect(header.activeLinkIndicator).toBe('underline');

    const slideshow = blocks[2].props as Record<string, unknown>;
    expect(slideshow.contentAlign).toBe('left');
    expect(slideshow.alignment).toBe('left');
    expect(slideshow.pagination).toBe('numbers');
    expect(Array.isArray(slideshow.slides)).toBe(true);
    expect((slideshow.slides as unknown[]).length).toBe(3);

    const collections = blocks[3].props as Record<string, unknown>;
    expect(collections.gridAspect).toBe('1:1');
    expect(collections.cardCaptionStyle).toBe('uppercase');
    expect(collections.dataSource).toBe('manual');
    const collArr = collections.collections as Array<{ collectionId: string }>;
    expect(collArr.map((c) => c.collectionId)).toEqual(['mebel', 'dekor']);

    const mainText = blocks[4].props as Record<string, unknown>;
    expect(mainText.buttonStyle).toBe('outlined');

    const video = blocks[5].props as Record<string, unknown>;
    expect(video.padded).toBe(true);

    const iwt = blocks[6].props as Record<string, unknown>;
    expect(iwt.imagePosition).toBe('right');
    expect(iwt.ctaPosition).toBe('bottom-pinned');

    const popular = blocks[7].props as Record<string, unknown>;
    expect(popular.swatchOverlay).toBe(true);
    expect(popular.cardCaptionStyle).toBe('uppercase');
    expect(popular.collection).toBe('mebel');

    const newsletter = blocks[8].props as Record<string, unknown>;
    expect(newsletter.formLayout).toBe('inline-submit');

    const footer = blocks[9].props as Record<string, unknown>;
    expect(footer.variant).toBe('2-part-asymmetric');
    expect(footer.bottomStrip).toMatchObject({
      enabled: true,
      text: expect.stringContaining('Powered by Merfy'),
    });
  });
});
