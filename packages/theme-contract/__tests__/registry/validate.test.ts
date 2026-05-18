import path from 'node:path';
import { scanBlockRegistry } from '../../registry/scan';
import { validateRegistry } from '../../registry/validate';

const GOOD = path.join(__dirname, '../fixtures/packages');
const BROKEN = path.join(__dirname, '../fixtures-broken/packages');

describe('validateRegistry', () => {
  it('returns 0 errors for valid fixture', async () => {
    const r = await scanBlockRegistry(GOOD);
    const result = await validateRegistry(r, GOOD);
    expect(result.errors).toHaveLength(0);
  });

  it('catches MISSING_ASTRO when puckConfig exists без .astro', async () => {
    const r = await scanBlockRegistry(BROKEN);
    const result = await validateRegistry(r, BROKEN);
    expect(result.errors.some((e) => e.code === 'MISSING_ASTRO' && e.block === 'MissingAstro')).toBe(true);
  });

  it('catches BROKEN_IMPORT when .astro импортирует не-existent module', async () => {
    const r = await scanBlockRegistry(BROKEN);
    const result = await validateRegistry(r, BROKEN);
    expect(result.errors.some((e) => e.code === 'BROKEN_IMPORT' && e.block === 'BrokenImport')).toBe(true);
  });

  it('warns ORPHAN_OVERRIDE когда theme-X has block без theme-base entry', async () => {
    const r = await scanBlockRegistry(BROKEN);
    const result = await validateRegistry(r, BROKEN);
    expect(result.warnings.some((w) => w.code === 'ORPHAN_OVERRIDE' && w.block === 'OrphanOverride')).toBe(true);
  });

  it('does not flag package imports (zod etc)', async () => {
    const r = await scanBlockRegistry(GOOD);
    const result = await validateRegistry(r, GOOD);
    expect(result.errors.filter((e) => e.code === 'BROKEN_IMPORT')).toHaveLength(0);
  });
});
