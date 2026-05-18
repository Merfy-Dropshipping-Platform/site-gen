import path from 'node:path';
import { scanBlockRegistry } from '../../registry/scan';

const FIX = path.join(__dirname, '../fixtures/packages');

describe('scanBlockRegistry', () => {
  it('discovers Hero from theme-base/blocks', async () => {
    const r = await scanBlockRegistry(FIX);
    const hero = r.blocks.find((b) => b.name === 'Hero');
    expect(hero).toBeDefined();
    expect(hero!.label).toBe('Главный экран');
    expect(hero!.category).toBe('media');
    expect(hero!.hasAstroRenderer).toBe(true);
    expect(hero!.paletteOrder).toBe(10);
  });

  it('detects theme override (rose)', async () => {
    const r = await scanBlockRegistry(FIX);
    const hero = r.blocks.find((b) => b.name === 'Hero')!;
    expect(hero.hasOverride).toContain('rose');
  });

  it('returns scannedAt ISO timestamp', async () => {
    const r = await scanBlockRegistry(FIX);
    expect(r.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('lists sibling .ts files', async () => {
    const r = await scanBlockRegistry(FIX);
    const hero = r.blocks.find((b) => b.name === 'Hero')!;
    expect(hero.siblings).toEqual(expect.arrayContaining(['Hero.puckConfig.ts', 'Hero.classes.ts']));
  });

  it('handles Empty block (no puckConfig, no .astro)', async () => {
    const r = await scanBlockRegistry(FIX);
    const empty = r.blocks.find((b) => b.name === 'Empty');
    expect(empty).toBeDefined();
    expect(empty!.hasAstroRenderer).toBe(false);
    expect(empty!.label).toBe('Empty'); // fallback to name
  });
});
