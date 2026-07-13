import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  PublicationsPuckConfig,
  PublicationsSchema,
  PublicationsAuthoringSchema,
  PublicationsStoredSchema,
  PublicationsTokens,
  PublicationsClasses,
  clampPublicationCount,
  filterPublicationsByType,
  resolvePublicationsDateTime,
  resolvePublicationsType,
} from '../blocks/Publications';

describe('Publications block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Publications');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports PublicationsPuckConfig with required fields', () => {
    expect(PublicationsPuckConfig.label).toBe('Публикации');
    expect(PublicationsPuckConfig.category).toBe('content');
    expect(PublicationsPuckConfig.defaults.heading).toBe('Публикации');
    expect(PublicationsPuckConfig.defaults.columns).toBe(3);
    expect(PublicationsPuckConfig.defaults.cards).toBe(3);
  });

  it('PublicationsSchema parses valid props', () => {
    const ok = PublicationsSchema.safeParse({
      heading: 'Blog',
      columns: 2,
      cards: 4,
      colorScheme: 'scheme-1',
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('PublicationsSchema rejects columns > 4 and cards > 4', () => {
    expect(
      PublicationsSchema.safeParse({
        heading: '',
        columns: 5,
        cards: 3,
        colorScheme: 1,
        padding: { top: 0, bottom: 0 },
      }).success,
    ).toBe(false);
    expect(
      PublicationsSchema.safeParse({
        heading: '',
        columns: 3,
        cards: 5,
        colorScheme: 1,
        padding: { top: 0, bottom: 0 },
      }).success,
    ).toBe(false);
  });

  it('limits authored card and column counts to 1..4 in fields and schema', () => {
    expect(PublicationsPuckConfig.fields.cardsCount).toMatchObject({ min: 1, max: 4 });
    expect(PublicationsPuckConfig.fields.columnsCount).toMatchObject({ min: 1, max: 4 });

    const base = {
      heading: '',
      columns: 3,
      cards: 3,
      padding: { top: 0, bottom: 0 },
    };
    expect(PublicationsAuthoringSchema.safeParse({ ...base, cardsCount: 0 }).success).toBe(false);
    expect(PublicationsAuthoringSchema.safeParse({ ...base, cardsCount: 5 }).success).toBe(false);
    expect(PublicationsAuthoringSchema.safeParse({ ...base, columnsCount: 0 }).success).toBe(false);
    expect(PublicationsAuthoringSchema.safeParse({ ...base, columnsCount: 5 }).success).toBe(false);
    expect(PublicationsPuckConfig.schema).toBe(PublicationsAuthoringSchema);
  });

  it('normalizes legacy saved counts above 4 instead of rejecting the section', () => {
    const parsed = PublicationsStoredSchema.safeParse({
      heading: '',
      columns: 3,
      cards: 3,
      cardsCount: 12,
      columnsCount: 6,
      padding: { top: 0, bottom: 0 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cardsCount).toBe(4);
      expect(parsed.data.columnsCount).toBe(4);
    }
  });

  it('flat showDateTime wins and legacy dateTime.enabled remains a fallback', () => {
    expect(resolvePublicationsDateTime({ showDateTime: 'false', dateTime: { enabled: 'true' } })).toBe(false);
    expect(resolvePublicationsDateTime({ showDateTime: 'true', dateTime: { enabled: 'false' } })).toBe(true);
    expect(resolvePublicationsDateTime({ dateTime: { enabled: 'false' } })).toBe(false);
    expect(resolvePublicationsDateTime({})).toBe(true);
  });

  it('publicationType filters actual runtime items by category', () => {
    const items = [
      { id: 'n1', category: 'news' },
      { id: 'b1', category: 'blog' },
      { id: 'a1', category: 'articles' },
    ];
    expect(filterPublicationsByType(items, 'blog')).toEqual([{ id: 'b1', category: 'blog' }]);
    expect(filterPublicationsByType(items, 'Блог')).toEqual([{ id: 'b1', category: 'blog' }]);
    expect(filterPublicationsByType(items, undefined)).toEqual(items);
    expect(filterPublicationsByType(items, 'Новости')).toEqual([{ id: 'n1', category: 'news' }]);
    expect(filterPublicationsByType(items, 'Статьи')).toEqual([{ id: 'a1', category: 'articles' }]);
  });

  it('uses canonical publicationType first and falls back to the saved legacy categoryFilter', () => {
    expect(resolvePublicationsType({ publicationType: 'articles', categoryFilter: 'blog' })).toBe('articles');
    expect(resolvePublicationsType({ categoryFilter: 'blog' })).toBe('blog');
    expect(resolvePublicationsType({ categoryFilter: 'Блог' })).toBe('blog');
    expect(resolvePublicationsType({ publicationType: 'Новости', categoryFilter: 'blog' })).toBe('news');
  });

  it('clamps legacy renderer counts to the documented range', () => {
    expect(clampPublicationCount(0)).toBe(1);
    expect(clampPublicationCount(3)).toBe(3);
    expect(clampPublicationCount(9)).toBe(4);
  });

  it('PublicationsTokens lists grid + muted tokens', () => {
    expect(PublicationsTokens.length).toBeGreaterThan(0);
    expect(PublicationsTokens).toContain('--color-muted');
    expect(PublicationsTokens).toContain('--spacing-grid-col-gap');
  });

  it('PublicationsClasses has root + grid + placeholders', () => {
    expect(PublicationsClasses.root).toBeDefined();
    expect(PublicationsClasses.grid).toBeDefined();
    expect(PublicationsClasses.placeholderCard).toBeDefined();
    expect(PublicationsClasses.placeholderTitle).toBeDefined();
    expect(PublicationsClasses.placeholderExcerpt).toBeDefined();
  });
});
