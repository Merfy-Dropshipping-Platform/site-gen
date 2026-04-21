import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  MultiRowsPuckConfig,
  MultiRowsSchema,
  MultiRowsTokens,
  MultiRowsClasses,
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

  it('MultiRows defaults alternate image position (left/right)', () => {
    const positions = MultiRowsPuckConfig.defaults.rows.map((r) => r.imagePosition);
    expect(positions).toEqual(['left', 'right']);
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
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
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
  });
});
