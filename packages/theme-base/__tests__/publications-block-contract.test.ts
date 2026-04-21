import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  PublicationsPuckConfig,
  PublicationsSchema,
  PublicationsTokens,
  PublicationsClasses,
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
      colorScheme: 1,
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
