import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  MultiColumnsPuckConfig,
  MultiColumnsSchema,
  MultiColumnsStoredSchema,
  MultiColumnsTokens,
  MultiColumnsClasses,
  resolveMultiColumnsContainerEnabled,
  getVisibleMultiColumns,
  getVisibleMultiColumnEntries,
  resolveMultiColumnLink,
  resolveMultiColumnsDisplayColumns,
  resolveMultiColumnsSectionLink,
} from '../blocks/MultiColumns';

describe('MultiColumns block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/MultiColumns');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports MultiColumnsPuckConfig with required fields', () => {
    expect(MultiColumnsPuckConfig.label).toBe('Мультиколонны');
    expect(MultiColumnsPuckConfig.category).toBe('layout');
    expect(MultiColumnsPuckConfig.defaults.columns.length).toBe(3);
    expect(MultiColumnsPuckConfig.defaults.displayColumns).toBe(3);
  });

  it('MultiColumnsSchema parses valid props', () => {
    const ok = MultiColumnsSchema.safeParse({
      columns: [
        { id: 'c1', heading: 'C1', text: 'Text', imageUrl: '' },
      ],
      displayColumns: 2,
      colorScheme: 'scheme-1',
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('MultiColumnsSchema rejects displayColumns > 4', () => {
    const bad = MultiColumnsSchema.safeParse({
      columns: [
        { id: 'c1', heading: 'C1', text: '', imageUrl: '' },
      ],
      displayColumns: 5 as unknown as 4,
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(bad.success).toBe(false);
  });

  it('preserves the current container toggle and per-column link shape', () => {
    const parsed = MultiColumnsSchema.safeParse({
      columns: [{ id: 'c1', linkText: 'Подробнее', link: '/catalog' }],
      displayColumns: 1,
      containerEnabled: 'true',
      padding: { top: 0, bottom: 0 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.containerEnabled).toBe('true');
      expect(parsed.data.columns[0]).toMatchObject({ linkText: 'Подробнее', link: '/catalog' });
    }
  });

  it('preserves the real constructor legacy column shape without data loss', () => {
    const legacy = {
      heading: { enabled: 'true', text: 'Мультиколонны', size: 'small' },
      columnsCount: '3',
      background: { enabled: 'true' },
      link: { href: '#' },
      columns: [
        {
          title: 'Колонна', image: '', description: 'Текст',
          link: { enabled: 'true', text: 'Ссылка', href: '#' },
        },
      ],
      padding: { top: 80, bottom: 80 },
    };
    const parsed = MultiColumnsStoredSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({
      heading: 'Мультиколонны', displayColumns: 3, containerEnabled: 'true',
    });
  });

  it('uses the current toggle first and falls back to legacy background.enabled', () => {
    expect(resolveMultiColumnsContainerEnabled({ containerEnabled: 'true' })).toBe(true);
    expect(resolveMultiColumnsContainerEnabled({ containerEnabled: 'false', background: { enabled: 'true' } })).toBe(false);
    expect(resolveMultiColumnsContainerEnabled({ background: { enabled: 'true' } })).toBe(true);
    expect(resolveMultiColumnsContainerEnabled({ background: { enabled: 'false' } })).toBe(false);
  });

  it('preserves legacy renderer display, section link, visibility and disabled-link semantics', () => {
    expect(resolveMultiColumnsDisplayColumns({ columnsCount: '2' })).toBe(2);
    expect(resolveMultiColumnsDisplayColumns({ displayColumns: 4, columnsCount: '2' })).toBe(4);
    expect(resolveMultiColumnsSectionLink({ link: { href: '/legacy-section' } })).toBe('/legacy-section');
    expect(getVisibleMultiColumns([{ title: 'A' }, { title: 'B', hidden: true }])).toEqual([{ title: 'A' }]);
    expect(getVisibleMultiColumnEntries([
      { title: 'Hidden', hidden: true },
      { title: 'Visible' },
    ])).toEqual([{ item: { title: 'Visible' }, originalIndex: 1 }]);
    expect(resolveMultiColumnLink({ link: { enabled: 'false', text: 'Скрыто', href: '/hidden' } })).toBeNull();
    expect(resolveMultiColumnLink({ link: { enabled: 'true', text: 'Ссылка', href: '/legacy' } })).toEqual({ text: 'Ссылка', href: '/legacy' });
  });

  it('MultiColumnsTokens lists grid spacing token', () => {
    expect(MultiColumnsTokens.length).toBeGreaterThan(0);
    expect(MultiColumnsTokens).toContain('--spacing-grid-col-gap');
    expect(MultiColumnsTokens).toContain('--color-surface');
  });

  it('MultiColumnsClasses has root + container + grid + column', () => {
    expect(MultiColumnsClasses.root).toBeDefined();
    expect(MultiColumnsClasses.container).toBeDefined();
    expect(MultiColumnsClasses.grid).toBeDefined();
    expect(MultiColumnsClasses.column).toBeDefined();
  });
});
