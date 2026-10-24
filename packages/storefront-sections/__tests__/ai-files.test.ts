import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_FILES, withoutAiFiles } from '../src/ai-files';
import { readSectionFolder } from '../src/read-folder';

// AGENTS.md и CLAUDE.md в корне папки секции — файлы для ИИ (блок 14, п. 12): проверка и сохранение их не видят.
describe('файлы для ИИ в папке секции', () => {
  it('чтение папки пропускает AGENTS.md и CLAUDE.md в корне, lib/AGENTS.md — читает', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'merfy-ai-files-'));
    await mkdir(join(dir, 'lib'));
    for (const [path, text] of [
      ['section.json', '{}'],
      ['template.astro', '<div></div>'],
      ['AGENTS.md', '# правила'],
      ['CLAUDE.md', '@AGENTS.md\n'],
      ['lib/AGENTS.md', '# не в корне'],
    ])
      await writeFile(join(dir, path), text);
    expect(Object.keys(await readSectionFolder(dir))).toEqual(['lib/AGENTS.md', 'section.json', 'template.astro']);
  });

  it('файлы из тела запроса — без AGENTS.md и CLAUDE.md в корне', () => {
    const files = { 'AGENTS.md': 'a', 'CLAUDE.md': 'b', 'section.json': '{}', 'lib/CLAUDE.md': 'c' };
    expect(withoutAiFiles(files)).toEqual({ 'section.json': '{}', 'lib/CLAUDE.md': 'c' });
    expect(AI_FILES).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });
});
