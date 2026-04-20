import { z } from 'zod';
import type {
  BlockPuckConfig,
  BlockTokens,
  BlockClasses,
  BlockMigrations,
  BlockConstraints,
  BlockCategory,
} from '../types';

describe('Block Contract types', () => {
  it('BlockPuckConfig accepts a fully-typed Props', () => {
    type MyProps = { title: string; n: number };
    const schema = z.object({ title: z.string(), n: z.number() });
    const cfg: BlockPuckConfig<MyProps> = {
      label: 'Test',
      category: 'content',
      fields: { title: { type: 'text', label: 'T' }, n: { type: 'number', label: 'N' } },
      defaults: { title: '', n: 0 },
      schema,
    };
    expect(cfg.label).toBe('Test');
  });

  it('BlockTokens is a readonly tuple of CSS vars', () => {
    const t: BlockTokens = ['--color-bg', '--radius-button'] as const;
    expect(t.length).toBe(2);
  });

  it('BlockCategory enum includes known categories', () => {
    const cats: BlockCategory[] = ['hero', 'products', 'content', 'layout', 'navigation', 'media', 'form'];
    expect(cats.length).toBe(7);
  });
});
