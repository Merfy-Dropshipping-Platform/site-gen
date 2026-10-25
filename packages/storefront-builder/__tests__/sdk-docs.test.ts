import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSdkDocs } from '../src/sdk-docs';

// Документация SDK из образа (блок 14, Р14-15): адрес прода в файлах — адрес API своего контура.
const PROD = 'https://gateway.merfy.ru/api/';

// expect.any возвращает any: через хелпер с типом unknown — без unsafe-assignment (RULES секций, §8, с 24.10).
const anyText = (): unknown => expect.any(String);

async function rootWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'merfy-sdk-docs-'));
  const dir = join(root, 'packages/sdk-docs/generated');
  await mkdir(join(dir, 'template'), { recursive: true });
  const docs = { sdk: 1, version: '1.0.0', date: '2026-10-30', api: PROD, files: Object.keys(files).sort() };
  await writeFile(join(dir, 'docs.json'), `${JSON.stringify(docs, null, 2)}\n`);
  for (const [path, text] of Object.entries(files)) await writeFile(join(dir, path), text);
  return root;
}

describe('документация SDK в сборщике', () => {
  it('файлы — с адресом своего контура и своим типом', async () => {
    const root = await rootWith({
      'llms.txt': `- [Шаблон](${PROD}storefront/sdk/template/AGENTS.md)\n`,
      'errors.md': '# Коды\n',
      'section.schema.json': `{"$id":"${PROD}storefront/sdk/section.schema.json"}\n`,
      'template/AGENTS.md': `Документация — ${PROD}storefront/sdk/llms.txt\n`,
    });
    const docs = await loadSdkDocs(root, 'https://gateway.dev.merfy.ru/api', () => undefined);
    const llms = docs.answer('llms.txt');
    expect(llms).toMatchObject({ status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    expect(llms.body).toBe('- [Шаблон](https://gateway.dev.merfy.ru/api/storefront/sdk/template/AGENTS.md)\n');
    expect(docs.answer('errors.md').headers).toMatchObject({ 'Content-Type': 'text/markdown; charset=utf-8' });
    expect(docs.answer('section.schema.json').headers).toMatchObject({ 'Content-Type': 'application/schema+json' });
    expect(docs.answer('template/AGENTS.md').body).toContain(
      'https://gateway.dev.merfy.ru/api/storefront/sdk/llms.txt',
    );
  });

  it('файла нет в docs.json — 404 doc-not-found; путь наружу — тоже', async () => {
    const docs = await loadSdkDocs(await rootWith({ 'llms.txt': 'x' }), PROD, () => undefined);
    for (const file of ['secret.md', '../docs.json', null]) {
      const answer = docs.answer(file);
      expect([answer.status, JSON.parse(answer.body)]).toEqual([
        404,
        { ok: false, error: { code: 'doc-not-found', message: anyText() } },
      ]);
    }
  });

  it('папки документации нет — сборщик работает, файлов нет, строка журнала', async () => {
    const logged: string[] = [];
    const docs = await loadSdkDocs(await mkdtemp(join(tmpdir(), 'merfy-no-docs-')), PROD, (event) => {
      logged.push(event);
    });
    expect(docs.answer('llms.txt').status).toBe(404);
    expect(logged).toEqual(['sdk-docs-missing']);
  });
});
