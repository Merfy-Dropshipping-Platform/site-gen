import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  MainTextPuckConfig,
  MainTextSchema,
  MainTextTokens,
  MainTextClasses,
} from '../blocks/MainText';

describe('MainText block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/MainText');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports MainTextPuckConfig with required fields', () => {
    expect(MainTextPuckConfig.label).toBe('Основной текст');
    expect(MainTextPuckConfig.category).toBe('content');
    expect(MainTextPuckConfig.defaults.heading).toBeDefined();
    expect(MainTextPuckConfig.defaults.alignment).toBe('center');
  });

  it('MainTextSchema parses valid props', () => {
    const ok = MainTextSchema.safeParse({
      heading: 'Test',
      text: 'Body <b>bold</b> text',
      alignment: 'left',
      colorScheme: 2,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('MainTextTokens lists at least one CSS var', () => {
    expect(MainTextTokens.length).toBeGreaterThan(0);
    expect(MainTextTokens[0].startsWith('--')).toBe(true);
    expect(MainTextTokens).toContain('--size-hero-heading');
  });

  it('MainTextClasses has alignment options', () => {
    expect(MainTextClasses.root).toBeDefined();
    expect(MainTextClasses.container).toBeDefined();
    expect(MainTextClasses.align.left).toBeDefined();
    expect(MainTextClasses.align.center).toBeDefined();
    expect(MainTextClasses.align.right).toBeDefined();
  });
});
