import path from 'node:path';
import { validateBlock } from '../validators/validateBlock';

const fixtures = path.resolve(__dirname, 'fixtures/blocks');

describe('validateBlock', () => {
  it('passes for valid block', async () => {
    const result = await validateBlock(path.join(fixtures, 'valid-hero'));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when .astro is missing', async () => {
    const result = await validateBlock(path.join(fixtures, 'missing-astro'));
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('Hero.astro'))).toBe(true);
  });

  it('fails when .tsx file is present', async () => {
    const result = await validateBlock(path.join(fixtures, 'has-tsx'));
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('tsx'))).toBe(true);
  });

  it('fails when hex color is inline in .astro', async () => {
    const result = await validateBlock(path.join(fixtures, 'has-hex'));
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /hex/i.test(e))).toBe(true);
  });

  it('fails when file has MIXED valid and invalid rgb usage', async () => {
    // This fixture has rgb(var(--color-bg)) AND rgb(255, 0, 0) in same file
    const dir = path.join(fixtures, 'mixed-rgb');
    const result = await validateBlock(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /rgb/i.test(e))).toBe(true);
  });
});
