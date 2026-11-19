import { describe, expect, it } from 'vitest';
import type { CopyAction, ResaveCommand, ResaveDeps, ResaveReport, ShopResult } from '../../src/release/section';
import { allLines, resaveAll, totalsOf, type FolderResult } from '../../src/release/section-all';

// theme-release section --all (20.11): все библиотечные папки по очереди, версии — только из истории библиотеки.
const shop = (siteId: string, action: CopyAction | 'failed'): ShopResult => ({ siteId, action, inRelease: false });
const reportOf = (name: string, actions: readonly (CopyAction | 'failed')[], release = false): ResaveReport => {
  const shops = actions.map((action, index) => shop(`s${index}`, action));
  const count = (action: string): number => shops.filter((item) => item.action === action).length;
  return {
    name,
    sourceHash: 'sha256:x',
    write: false,
    shops,
    release: release ? { id: 7, status: 'testing' } : null,
    counts: {
      updated: count('update'),
      pending: count('pending'),
      already: count('already'),
      skipped: count('changed') + count('not-ours') + count('live-changed'),
      failed: count('failed'),
    },
  };
};

// Обходу нужны только версии: git-версия у него должна быть заменена пустой историей.
const deps = (): Pick<ResaveDeps, 'versions'> => ({
  versions: () => Promise.resolve([{ 'section.json': 'git-версия' }]),
});
const command = { write: false, testShop: null, theme: 'nova', only: 's0' };

describe('обход библиотечных папок', () => {
  it('папки идут по очереди и без git: versions пуст, command получает папку и --only', async () => {
    const seen: { folder: string; only?: string; versions: number }[] = [];
    const results = await resaveAll(deps(), ['a', 'b'], command, async (given, asked: ResaveCommand) => {
      seen.push({ folder: asked.folder, only: asked.only, versions: (await given.versions(asked.folder)).length });
      return reportOf(asked.folder, ['update']);
    });
    expect(seen).toEqual([
      { folder: 'a', only: 's0', versions: 0 },
      { folder: 'b', only: 's0', versions: 0 },
    ]);
    expect(results.map(({ folder }) => folder)).toEqual(['a', 'b']);
  });

  it('папка, не прошедшая проверку, остальные не останавливает: ошибка в её результате', async () => {
    const results = await resaveAll(deps(), ['bad', 'ok'], command, (_given, asked) =>
      asked.folder === 'bad'
        ? Promise.reject(new Error('новая версия не прошла проверку'))
        : Promise.resolve(reportOf('ok', [])),
    );
    expect(results[0]).toMatchObject({ folder: 'bad', report: null });
    expect(results[0]?.error).toContain('не прошла проверку');
    expect(results[1]?.report?.name).toBe('ok');
  });
});

describe('итог обхода', () => {
  const results: FolderResult[] = [
    { folder: 'a', report: reportOf('catalog', ['update', 'update', 'changed', 'already'], true) },
    { folder: 'b', report: reportOf('collection', ['update', 'not-ours', 'live-changed', 'pending']) },
    { folder: 'c', report: reportOf('faq', []) },
    { folder: 'd', report: null, error: 'сломана' },
  ];

  it('числа: обновится, ждут, уже, changed, прочие пропуски, упало (папка с ошибкой — упавшая)', () => {
    expect(totalsOf(results)).toEqual({
      folders: 4,
      withCopies: 2,
      updated: 3,
      pending: 1,
      already: 1,
      changed: 1,
      other: 2,
      failed: 1,
    });
  });

  it('строки: секции без копий нет, ошибка папки видна, выпуск назван, последней — JSON', () => {
    const lines = allLines(results, false);
    expect(lines[0]).toContain('сухой прогон');
    expect(
      lines.some((line) => line.startsWith('catalog:') && line.includes('обновится 2') && line.includes('выпуск №7')),
    ).toBe(true);
    expect(lines.some((line) => line.startsWith('faq:'))).toBe(false);
    expect(lines).toContain('d: ошибка — сломана');
    expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({ write: false, totals: { updated: 3, changed: 1 } });
  });
});
