import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Стёртый заголовок/текст секции остаётся пустым — во всех пяти темах.
 *
 * Владелец 26.09 (bloom, «Коллекция товаров»): стёр заголовок и текст — на их
 * месте снова текст темы. Подменяли два слоя: deepMergeBlockProps брал
 * blockDefaults темы вместо "" и сами порты секций проваливались в заглушку
 * (`heading?.trim() || "Коллекция товаров"`) или в легаси title/subtitle.
 *
 * Правило: поле пришло строкой — рисуем её (пустая = элемента нет, и обёртки
 * без содержимого тоже нет); поле не
 * задано (старые ревизии) — прежняя заглушка темы. Проба (cleared-text-probe.mjs)
 * сравнивает рендер «поля стёрты» с рендером «в полях метка»: лишние слова в
 * первом — подставленный текст.
 */

const PROBE = resolve(__dirname, 'cleared-text-probe.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

type ProbeRow = {
  block: string;
  fields: string[];
  marks?: number;
  extra?: string[];
  emptyLeft?: string[];
  error?: string;
};

const built = (theme: string) =>
  existsSync(resolve(SITES_ROOT, 'dist', 'theme-sections', theme, 'manifest.json')) &&
  existsSync(resolve(SITES_ROOT, 'dist', 'src', 'services', 'preview.service.js'));

function probe(theme: string): ProbeRow[] {
  const raw = execFileSync('node', [PROBE, theme], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const last = raw.trim().split('\n').pop() ?? '[]';
  return JSON.parse(last) as ProbeRow[];
}

describe.each(THEMES)('%s: стёртый текст секции не подменяется текстом темы', (theme) => {
  it('секции темы собраны (pnpm build && pnpm build:blocks && pnpm build:theme-sections)', () => {
    expect(built(theme)).toBe(true);
  });

  (built(theme) ? it : it.skip)('каждая секция со стёртыми полями рисует пустоту', () => {
    const rows = probe(theme);
    // Ноль проверенных секций — не зелёный прогон, а сломанная проба.
    expect(rows.length).toBeGreaterThan(5);
    // Метка дошла до экрана — значит, проба стирает те поля, что рисует секция.
    const unmarked = rows.filter((r) => !r.error && (r.marks ?? 0) === 0).map((r) => r.block);
    expect(unmarked).toEqual([]);
    const substituted = rows
      .filter((r) => r.error || (r.extra ?? []).length > 0)
      .map((r) => `${r.block} [${r.fields.join(',')}]: ${r.error ?? (r.extra ?? []).join(' ')}`);
    expect(substituted).toEqual([]);
    // На месте стёртого текста не остаётся пустого <h2>/<p> или обёртки с отступом.
    const leftovers = rows
      .filter((r) => (r.emptyLeft ?? []).length > 0)
      .map((r) => `${r.block} [${r.fields.join(',')}]: ${(r.emptyLeft ?? []).join(' ')}`);
    expect(leftovers).toEqual([]);
  });
});
