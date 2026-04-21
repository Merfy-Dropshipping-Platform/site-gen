import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CollapsibleSectionPuckConfig,
  CollapsibleSectionSchema,
  CollapsibleSectionTokens,
  CollapsibleSectionClasses,
} from '../blocks/CollapsibleSection';

describe('CollapsibleSection block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/CollapsibleSection');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports CollapsibleSectionPuckConfig with required fields', () => {
    expect(CollapsibleSectionPuckConfig.label).toBe('Сворачиваемый раздел');
    expect(CollapsibleSectionPuckConfig.category).toBe('content');
    expect(CollapsibleSectionPuckConfig.defaults.sections.length).toBe(2);
  });

  it('CollapsibleSectionSchema parses valid props', () => {
    const ok = CollapsibleSectionSchema.safeParse({
      heading: 'FAQ',
      sections: [
        { id: 's1', heading: 'Q1?', content: 'Answer 1' },
      ],
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('CollapsibleSectionSchema rejects > 10 sections', () => {
    const manySections = Array.from({ length: 11 }, (_, i) => ({
      id: `s${i}`,
      heading: `Q${i}`,
      content: 'A',
    }));
    const bad = CollapsibleSectionSchema.safeParse({
      heading: '',
      sections: manySections,
      colorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(bad.success).toBe(false);
  });

  it('CollapsibleSectionTokens lists surface and field-radius tokens', () => {
    expect(CollapsibleSectionTokens.length).toBeGreaterThan(0);
    expect(CollapsibleSectionTokens).toContain('--color-surface');
    expect(CollapsibleSectionTokens).toContain('--radius-field');
  });

  it('CollapsibleSectionClasses has root + list + item + summary + content', () => {
    expect(CollapsibleSectionClasses.root).toBeDefined();
    expect(CollapsibleSectionClasses.list).toBeDefined();
    expect(CollapsibleSectionClasses.item).toBeDefined();
    expect(CollapsibleSectionClasses.summary).toBeDefined();
    expect(CollapsibleSectionClasses.content).toBeDefined();
  });
});
