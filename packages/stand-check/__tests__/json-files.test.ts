import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonText, readJsonFile, writeTextFile } from '../src/json-files';

const tempDir = () => mkdtemp(path.join(tmpdir(), 'stand-check-'));

describe('файлы JSON', () => {
  it('readJsonFile отдаёт разобранный JSON', async () => {
    const file = path.join(await tempDir(), 'a.json');
    await writeFile(file, '{"page":"/theme-stand"}');
    expect(await readJsonFile(file)).toEqual({ page: '/theme-stand' });
  });

  it('файла нет — ошибка file-unreadable с именем файла', async () => {
    const file = path.join(await tempDir(), 'missing.json');
    await expect(readJsonFile(file)).rejects.toThrow(/^file-unreadable: .*missing\.json: файл не прочитан/);
  });

  it('файл не JSON — ошибка file-unreadable', async () => {
    const file = path.join(await tempDir(), 'broken.json');
    await writeFile(file, '{ page: ');
    await expect(readJsonFile(file)).rejects.toThrow(/broken\.json: не JSON/);
  });

  it('writeTextFile создаёт папки, jsonText — отступ 2 и перевод строки в конце', async () => {
    const file = path.join(await tempDir(), 'reports', 'run', 'after.json');
    await writeTextFile(file, jsonText({ a: 1 }));
    expect(await readFile(file, 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});
