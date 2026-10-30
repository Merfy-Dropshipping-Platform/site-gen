import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAMES, prepareSection } from '@merfy/storefront-sections';
import { beforeAll, describe, expect, it } from 'vitest';
import { docsFiles, NAMES_JSON, type DocsFiles } from '../src/docs';
import { PACKAGE_DIR } from '../src/meta';
import { readSources } from '../src/sources';

// quick.md и names.json (30.10, шаг 4 «MCP-опыта»): шпаргалка не длиннее 10 000 знаков, её примеры принимает проверка,
// словарь имён данными совпадает с пакетом секций и отдаётся рядом со страницами.
const QUICK_MAX = 10_000;
let files: DocsFiles;
beforeAll(async () => {
  files = docsFiles(await readSources());
});

const blockOf = (text: string, fence: string, index = 0): string =>
  [...text.matchAll(new RegExp('```' + fence + '\\n([\\s\\S]*?)```', 'g'))][index]?.[1] ?? '';

const field = (id: string, kind: string, setting: object = {}) => ({
  id,
  label: id,
  setting: { kind, default: '', ...setting },
});

describe('quick.md', () => {
  it(`не длиннее ${QUICK_MAX} знаков, в оглавлении llms.txt, ссылки ведут на файлы`, () => {
    const text = files['quick.md'] ?? '';
    expect(text.length).toBeGreaterThan(2_000);
    expect(text.length).toBeLessThanOrEqual(QUICK_MAX);
    expect(files['llms.txt']).toContain('- [Шпаргалка: секция с нуля](quick.md):');
  });

  it('минимальная секция из шпаргалки проходит проверку без отказов и предупреждений', async () => {
    const text = files['quick.md'] ?? '';
    const result = await prepareSection({
      prefix: 'shop',
      files: { 'section.json': blockOf(text, 'json'), 'template.astro': blockOf(text, 'astro') },
    });
    expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
  });

  it('приёмы из шпаргалки (включатель, картинка, кнопка) проходят проверку', async () => {
    const text = files['quick.md'] ?? '';
    const manifest = {
      sdk: 1,
      name: 'tricks',
      kind: 'section',
      title: 'Приёмы',
      settings: [
        field('heading', 'string'),
        field('image', 'image', { maxBytes: 5_000_000 }),
        field('button-label', 'string'),
        field('button-link', 'url'),
        field('capitals', 'toggle', { default: false, labels: { on: 'Да', off: 'Нет' } }),
      ],
    };
    const result = await prepareSection({
      prefix: 'shop',
      files: {
        'section.json': JSON.stringify(manifest),
        'template.astro': `---\nconst { settings } = Astro.props;\n---\n${blockOf(text, 'astro', 1)}`,
      },
    });
    expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
  });
});

describe('names.json', () => {
  it('копия names.json пакета секций, без изменений', () => {
    const own = readFileSync(join(PACKAGE_DIR, '../storefront-sections/names.json'), 'utf8');
    expect(files[NAMES_JSON]).toBe(own);
  });

  it('словарь разбирается: те же имена, что в проверке; файл в docs.json, ссылка в llms.txt', () => {
    const parsed: unknown = JSON.parse(files[NAMES_JSON] ?? '');
    const names: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'names') : undefined;
    expect(Object.keys(names ?? {}).sort()).toEqual(NAMES.names.map((entry) => entry.name).sort());
    const docs: unknown = JSON.parse(files['docs.json'] ?? '{}');
    expect(typeof docs === 'object' && docs !== null ? Reflect.get(docs, 'files') : []).toContain(NAMES_JSON);
    expect(files['llms.txt']).toContain('- [names.json](names.json):');
  });
});
