import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  MultiColumnsPuckConfig,
  MultiColumnsSchema,
  MultiColumnsTokens,
  MultiColumnsClasses,
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
      colorScheme: 1,
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

  it('MultiColumnsTokens lists grid spacing token', () => {
    expect(MultiColumnsTokens.length).toBeGreaterThan(0);
    expect(MultiColumnsTokens).toContain('--spacing-grid-col-gap');
  });

  it('MultiColumnsClasses has root + container + grid + column', () => {
    expect(MultiColumnsClasses.root).toBeDefined();
    expect(MultiColumnsClasses.container).toBeDefined();
    expect(MultiColumnsClasses.grid).toBeDefined();
    expect(MultiColumnsClasses.column).toBeDefined();
  });
});
