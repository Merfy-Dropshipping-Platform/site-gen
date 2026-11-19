import { hashOf } from '@merfy/storefront-build';
import type { LibraryHistory } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { copyAction, knownHashes, type ShopCopy } from '../../src/release/section';

// Какие копии нашей секции команда считает нетронутыми (20.11): версии папки из git, все версии из истории библиотеки и
// новая. Без git (образ сборщика) хватает истории.
const v1 = { 'section.json': '{"name":"badge"}', 'template.astro': '<a>1</a>' };
const v2 = { ...v1, 'template.astro': '<a>2</a>' };
const v3 = { ...v1, 'template.astro': '<a>3</a>' };
const [h1, h2, h3] = [hashOf(v1), hashOf(v2), hashOf(v3)];
const history: LibraryHistory = {
  [h1]: { name: 'badge', version: 1 },
  [h2]: { name: 'badge', version: 2 },
  [hashOf({ x: 1 })]: { name: 'other', version: 1 },
};
const noGit = (): Promise<never[]> => Promise.resolve([]);
const copy = (draft: string): ShopCopy => ({ siteId: 's', published: true, draft, live: draft, hashes: [draft] });

describe('известные отпечатки секции', () => {
  it('без git — версии из истории по имени секции и новая; чужие секции истории не входят', async () => {
    const known = await knownHashes({ versions: noGit, history }, 'x', 'badge', h3);
    expect(known).toEqual(new Set([h1, h2, h3]));
  });

  it('версии из git добавляются к истории', async () => {
    const known = await knownHashes({ versions: () => Promise.resolve([v1]), history: {} }, 'x', 'badge', h3);
    expect(known).toEqual(new Set([h1, h3]));
  });

  it('копия на версии из истории — обновить; копия вне истории — правка мерчанта', async () => {
    const known = await knownHashes({ versions: noGit, history }, 'x', 'badge', h3);
    expect(copyAction(copy(h1), known, h3)).toBe('update');
    expect(copyAction(copy('sha256:merchant'), known, h3)).toBe('not-ours');
    expect(copyAction({ ...copy(h3), live: h2 }, known, h3)).toBe('pending');
  });
});
