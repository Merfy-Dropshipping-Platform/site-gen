import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PROBLEM_CODES, problemDoc } from '@merfy/storefront-sections';
import { beforeAll, describe, expect, it } from 'vitest';
import { docsDate, docsFiles, type DocsFiles } from '../src/docs';
import { DOCS_BASE, PACKAGE_DIR } from '../src/meta';
import { PAGES } from '../src/pages';
import { readSources } from '../src/sources';

// Сверка документации SDK с кодом (блок 14, тесты 1, 4, 5, 6, 8 раздела 14.2). Тесты 2, 3, 7 — examples.test.ts и
// template.test.ts.
const GENERATED = join(PACKAGE_DIR, 'generated');

function filesOnDisk(dir: string): DocsFiles {
  const all = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((path) =>
    statSync(join(dir, path)).isFile(),
  );
  return Object.fromEntries(
    all.map((path) => [relative(dir, join(dir, path)).split('\\').join('/'), readFileSync(join(dir, path), 'utf8')]),
  );
}

// Якорь заголовка, как у GitHub: строчные, без знаков, пробелы — дефисы.
const anchor = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
const anchorsOf = (text: string): Set<string> =>
  new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map((match) => anchor(match[1] ?? '')));
// Ссылки Markdown на свои файлы: [текст](путь#якорь), без http и mailto.
const linksOf = (text: string): string[] =>
  [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? '').filter((href) => !/^[a-z]+:/.test(href));

let files: DocsFiles;
let version: string;

beforeAll(async () => {
  const sources = await readSources();
  files = docsFiles(sources);
  version = sources.version;
});

describe('документация SDK', () => {
  it('1. generated/ совпадает с генерацией: забытый pnpm generate — красный тест', () => {
    expect(filesOnDisk(GENERATED)).toEqual(files);
  });

  it('4. у каждого кода проверки — раздел в errors.md', () => {
    const anchors = anchorsOf(files['errors.md'] ?? '');
    for (const code of PROBLEM_CODES) expect(anchors.has(code), code).toBe(true);
  });

  it('doc ответа проверки ведёт на файл и якорь generated/: правила кода — разделы code.md', () => {
    for (const code of PROBLEM_CODES) {
      const [file = '', hash = ''] = problemDoc(code).split('#');
      expect(anchorsOf(files[file] ?? '').has(hash), `${code} → ${problemDoc(code)}`).toBe(true);
    }
    expect(problemDoc('taste-class-branches')).toBe('code.md#значения-настройки');
  });

  it('code.md: в оглавлении llms.txt, пример подставлен, выжимка и ссылка — в template/AGENTS.md', () => {
    expect(files['llms.txt']).toContain('- [Как писать код секции](code.md):');
    expect(files['code.md']).not.toContain('<!-- example:');
    expect(files['code.md']).toContain('hero-clean/');
    expect(files['template/AGENTS.md']).toContain('code.md');
    expect(files['template/AGENTS.md']).toContain('taste-*');
  });

  it('5. ссылки llms.txt и страниц ведут на файлы и якоря generated/', () => {
    for (const [path, text] of Object.entries(files).filter(([name]) => /\.(md|txt)$/.test(name))) {
      for (const href of linksOf(text)) {
        const [target = '', hash] = href.split('#');
        const base = path.includes('/') ? `${path.slice(0, path.lastIndexOf('/') + 1)}` : '';
        const file = target === '' ? path : `${base}${target}`.replace(/^template\/\.\.\//, '');
        expect(Object.hasOwn(files, file), `${path} → ${href}`).toBe(true);
        if (hash !== undefined) expect(anchorsOf(files[file] ?? '').has(hash), `${path} → ${href}`).toBe(true);
      }
    }
  });

  it('6. в шапке каждой страницы — версия SDK, версия документации и дата', () => {
    const date = docsDate(files['changelog.md'] ?? '');
    for (const page of PAGES.filter((item) => !item.file.startsWith('template/')))
      expect((files[page.file] ?? '').split('\n')[2], page.file).toBe(`> SDK 1 · документация ${version} · ${date}`);
    expect(files['llms.txt']).toContain(`SDK 1 · документация ${version} · ${date}`);
  });

  it('8. в changelog.md есть запись текущей версии', () => {
    expect(files['changelog.md']).toMatch(
      new RegExp(`^## ${version.replaceAll('.', '\\.')} — \\d{4}-\\d{2}-\\d{2}$`, 'm'),
    );
  });

  it('llms.txt: страницы по порядку PAGES; адреса — адрес документации прода', () => {
    const order = [...(files['llms.txt'] ?? '').matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map((match) => match[1]);
    expect(order).toEqual([...PAGES.map((page) => page.file), 'llms-full.txt']);
    expect(files['template/AGENTS.md']).toContain(`${DOCS_BASE}llms.txt`);
    expect(JSON.parse(files['docs.json'] ?? '{}')).toMatchObject({
      sdk: 1,
      version,
      api: 'https://gateway.merfy.ru/api/',
    });
  });

  it('llms.txt: раздел «Гайд» идёт первым, в нём обе страницы гайда', () => {
    const sections = [...(files['llms.txt'] ?? '').matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(sections[0]).toBe('Гайд');
    const guide = (files['llms.txt'] ?? '').split('## Гайд\n')[1]?.split('\n## ')[0] ?? '';
    expect(guide).toContain('- [Из чего состоит секция](anatomy.md):');
    expect(guide).toContain('- [Путь секции до витрины](path.md):');
  });

  it('script.md: каждый член ctx и El из таблиц есть в типах ядра', () => {
    const types = readFileSync(join(PACKAGE_DIR, '../storefront-shell/src/core/types.ts'), 'utf8');
    const members = [...(files['script.md'] ?? '').matchAll(/^\| `(?:ctx\.)?([a-zA-Z]+)[(`]/gm)].map(
      (match) => match[1] ?? '',
    );
    expect(members.length).toBeGreaterThan(15);
    for (const name of members) expect(types, name).toMatch(new RegExp(`\\b${name}[?]?[(:<]`));
  });

  it('метки примеров заменены файлами примера', () => {
    expect(files['start.md']).not.toContain('<!-- example:');
    expect(files['start.md']).toContain("import { defineSection } from '@merfy/shell';");
    expect(files['template.md']).toContain('`<script>`');
  });
});
