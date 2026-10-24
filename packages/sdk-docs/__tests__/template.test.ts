import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SANDBOX, prepareInWorker, readSectionFolder } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { AGENTS_MAX_CHARS, DOCS_BASE, PACKAGE_DIR } from '../src/meta';

// Шаблон секции (блок 14, 14.5; тесты 3 и 7 раздела 14.2): проходит проверку при сохранении, AGENTS.md — до 2000 знаков.
const TEMPLATE = join(PACKAGE_DIR, 'template');
const text = (name: string): string => readFileSync(join(TEMPLATE, name), 'utf8');

describe('шаблон секции', () => {
  it('проходит проверку без предупреждений; AGENTS.md и CLAUDE.md проверка не видит', async () => {
    const files = await readSectionFolder(TEMPLATE);
    expect(Object.keys(files)).toEqual(['section.json', 'template.astro']);
    const result = await prepareInWorker({ prefix: 'shop', files }, DEFAULT_SANDBOX);
    expect(result).toMatchObject({ ok: true, section: { name: 'shop:new-section', warnings: [] } });
  });

  it('AGENTS.md — не длиннее 2000 знаков, с адресом llms.txt; CLAUDE.md — строка @AGENTS.md', () => {
    expect([...text('AGENTS.md')].length).toBeLessThanOrEqual(AGENTS_MAX_CHARS);
    expect(text('AGENTS.md')).toContain(`${DOCS_BASE}llms.txt`);
    expect(text('CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('$schema ведёт на схему по адресу документации', () => {
    expect(JSON.parse(text('section.json'))).toMatchObject({ $schema: `${DOCS_BASE}section.schema.json`, sdk: 1 });
  });
});
