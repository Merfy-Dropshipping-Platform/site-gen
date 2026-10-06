import { describe, expect, it } from 'vitest';
import standManifest from '../fixtures/stand-manifest.json';
import { entityHashes } from '../src/entities';
import { changedEntities, dependentPages } from '../src/graph';
import { checkManifest } from '../src/manifest';
import { changedInputs, standInputs } from './support';

const SITE = 'site:00000000-0000-4000-8000-000000000001';
const SCARF = 'product:00000000-0000-4000-8000-000000000101';
const manifest = checkManifest(standManifest);

describe('changedEntities', () => {
  it('добавленные, убранные и правленые — по порядку; одинаковые — нет', () => {
    const before = { 'policy:privacy': 'a', [SCARF]: 'b', [SITE]: 'c' };
    const after = { 'billing:main': 'd', [SCARF]: 'x', [SITE]: 'c' };
    expect(changedEntities(before, after)).toEqual(['billing:main', 'policy:privacy', SCARF]);
  });

  it('правка цены шарфа во входах — поменялся только шарф', () => {
    const repriced = changedInputs((inputs) => (inputs.data.entities[0].data.price = 2300));
    expect(changedEntities(entityHashes(standInputs), entityHashes(repriced))).toEqual([SCARF]);
  });
});

describe('dependentPages', () => {
  it('правка товара — страницы, которые его рисуют', () => {
    expect(dependentPages(manifest, [SCARF])).toEqual(['/products/scarf/']);
  });

  it('правка сайта — все страницы, которые от него зависят', () => {
    expect(dependentPages(manifest, [SITE])).toEqual(['/', '/products/scarf/']);
  });

  it('правка сущности, которой страницы не рисуют, — ни одной', () => {
    expect(dependentPages(manifest, ['billing:main'])).toEqual([]);
  });
});
