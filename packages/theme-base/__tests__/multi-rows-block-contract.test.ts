import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  MultiRowsPuckConfig,
  MultiRowsSchema,
  MultiRowsTokens,
  MultiRowsClasses,
  resolveMultiRowsImagePosition,
  resolveMultiRowsButtonStyle,
  resolveMultiRowsItemSize,
  resolveMultiRowsWidth,
  getVisibleMultiRows,
  getVisibleMultiRowEntries,
  resolveMultiRowsButton,
} from '../blocks/MultiRows';

describe('MultiRows block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/MultiRows');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports MultiRowsPuckConfig with required fields', () => {
    expect(MultiRowsPuckConfig.label).toBe('Мультиряды');
    expect(MultiRowsPuckConfig.category).toBe('layout');
    expect(MultiRowsPuckConfig.defaults.rows.length).toBe(2);
  });

  it('MultiRows defaults alternate rows from the left side', () => {
    expect(MultiRowsPuckConfig.defaults.rowsPosition).toBe('left');
  });

  it('MultiRowsSchema parses valid props (normalized button: {text,href})', () => {
    const ok = MultiRowsSchema.safeParse({
      rows: [
        {
          id: 'r1',
          heading: 'R1',
          text: 'Text',
          imageUrl: 'https://x.test/a.jpg',
          imagePosition: 'left',
          button: { text: 'Go', href: '/about' },
        },
      ],
      colorScheme: 'scheme-1',
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('exposes only the documented primary/secondary button styles', () => {
    const parsed = MultiRowsSchema.safeParse({
      rows: [{ id: 'r1' }],
      buttonStyle: 'secondary',
      padding: { top: 0, bottom: 0 },
    });
    expect(parsed.success).toBe(true);

    const field = MultiRowsPuckConfig.fields.buttonStyle as unknown as {
      options: Array<{ value: string }>;
    };
    expect(field.options.map(({ value }) => value)).toEqual(['primary', 'secondary']);
  });

  it('shows both color schemes and keeps the legacy container toggle hidden', () => {
    expect(MultiRowsPuckConfig.fields.colorScheme).toMatchObject({ type: 'colorScheme' });
    expect(MultiRowsPuckConfig.fields.containerColorScheme).toMatchObject({ type: 'colorScheme' });
    expect(MultiRowsPuckConfig.fields.containerEnabled).toMatchObject({ type: 'hidden' });
  });

  it('uses left/right as the first row side and alternates every next row', () => {
    expect([0, 1, 2].map((i) => resolveMultiRowsImagePosition('left', i))).toEqual([
      'left',
      'right',
      'left',
    ]);
    expect([0, 1, 2].map((i) => resolveMultiRowsImagePosition('right', i))).toEqual([
      'right',
      'left',
      'right',
    ]);
    expect([0, 1].map((i) => resolveMultiRowsImagePosition('alternate', i))).toEqual([
      'left',
      'right',
    ]);
    expect(resolveMultiRowsImagePosition(undefined, 0, 'right')).toBe('right');
  });

  it('normalizes legacy button styles to the current primary/secondary renderer variants', () => {
    expect(resolveMultiRowsButtonStyle('primary')).toBe('primary');
    expect(resolveMultiRowsButtonStyle('secondary')).toBe('secondary');
    expect(resolveMultiRowsButtonStyle('black')).toBe('primary');
    expect(resolveMultiRowsButtonStyle('white')).toBe('secondary');
    expect(MultiRowsClasses.textAlignment.right).toContain('text-right');
    expect(MultiRowsClasses.buttonSecondary).toBeDefined();
    expect(MultiRowsClasses.buttonSecondary).toContain('--color-button-2-bg');
  });

  it('top-level Height overrides authored row defaults and legacy row size is only a fallback', () => {
    expect(resolveMultiRowsItemSize('large', 'small')).toBe('large');
    expect(resolveMultiRowsItemSize(undefined, 'small')).toBe('small');
    expect(resolveMultiRowsItemSize(undefined, undefined)).toBe('medium');
    expect(MultiRowsClasses.imageAspect[resolveMultiRowsItemSize('large', 'small')]).toContain('430/500');
  });

  it('top-level Width selects the rendered container width', () => {
    expect(resolveMultiRowsWidth('small')).toBe('small');
    expect(resolveMultiRowsWidth('medium')).toBe('medium');
    expect(resolveMultiRowsWidth('large')).toBe('large');
    expect(resolveMultiRowsWidth('full')).toBe('full');
    expect(MultiRowsClasses.width.small).not.toEqual(MultiRowsClasses.width.large);
    expect(MultiRowsClasses.width[resolveMultiRowsWidth('small')]).toContain('max-w-3xl');
    expect(MultiRowsClasses.width[resolveMultiRowsWidth('full')]).toContain('w-full');
  });

  it('filters hidden legacy rows and hides a legacy disabled CTA', () => {
    expect(getVisibleMultiRows([{ id: 'a' }, { id: 'b', hidden: true }])).toEqual([{ id: 'a' }]);
    expect(getVisibleMultiRowEntries([
      { id: 'hidden', hidden: true },
      { id: 'visible' },
    ])).toEqual([{ item: { id: 'visible' }, originalIndex: 1 }]);
    expect(resolveMultiRowsButton({ enabled: 'false', text: 'Не показывать', link: '/x' })).toBeNull();
    expect(resolveMultiRowsButton({ enabled: 'true', text: 'Показать', link: '/x' })).toEqual({ text: 'Показать', href: '/x' });
  });

  it('MultiRowsTokens lists hero-heading and button tokens', () => {
    expect(MultiRowsTokens.length).toBeGreaterThan(0);
    expect(MultiRowsTokens).toContain('--size-hero-heading');
    expect(MultiRowsTokens).toContain('--color-button-bg');
  });

  it('MultiRowsClasses has root + stack + row variants', () => {
    expect(MultiRowsClasses.root).toBeDefined();
    expect(MultiRowsClasses.stack).toBeDefined();
    expect(MultiRowsClasses.row.imageLeft).toBeDefined();
    expect(MultiRowsClasses.row.imageRight).toBeDefined();
    expect(MultiRowsClasses.button).toBeDefined();
    expect(MultiRowsClasses.textColBase).toBe('flex flex-col');
  });
});
