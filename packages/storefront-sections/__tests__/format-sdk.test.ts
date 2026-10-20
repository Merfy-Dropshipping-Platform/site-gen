import { describe, expect, it } from 'vitest';
import { fileProblems, kindProblems, readManifest } from '../src/format';

const manifestFile = (value: unknown) => ({ 'section.json': JSON.stringify(value) });
const HERO = { sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран' };
const codesAndTexts = (result: ReturnType<typeof readManifest>) =>
  result.ok ? [] : result.problems.map((item) => [item.code, item.message]);

describe('формат секции SDK 1', () => {
  it('template.astro и styles.css — отказ с подсказкой', () => {
    const problems = fileProblems({ 'template.html': '', 'styles.css': '' });
    expect(problems.map((item) => [item.code, item.file, item.message])).toEqual([
      ['file-unknown', 'template.html', 'шаблон теперь template.astro'],
      ['file-unknown', 'styles.css', 'своего CSS у секции нет: классы Tailwind из словаря (7 Г)'],
    ]);
  });

  it('незнакомый файл — список файлов формата', () => {
    expect(fileProblems({ 'notes.md': '' }).map((item) => item.message)).toEqual([
      'в формате секции: section.json, template.astro, .ts/.js',
    ]);
  });

  it('ключи v и fields — подсказка нового имени', () => {
    const old = { v: 1, name: 'hero', kind: 'section', title: 'Первый экран', fields: [] };
    expect(codesAndTexts(readManifest(manifestFile(old)))).toEqual([
      ['manifest-invalid', 'ключ v: теперь "sdk": 1'],
      ['manifest-invalid', 'ключ fields: теперь settings'],
    ]);
  });

  it('sdk 2 — sdk-unsupported', () => {
    expect(codesAndTexts(readManifest(manifestFile({ ...HERO, sdk: 2 })))).toEqual([
      ['sdk-unsupported', 'версия SDK 2 не поддерживается, поддерживается только 1'],
    ]);
  });

  it('поле с неверным умолчанием — setting-invalid', () => {
    const settings = [{ id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'я'.repeat(201) } }];
    const result = readManifest(manifestFile({ ...HERO, settings }));
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['setting-invalid']);
  });

  it('без settings — пустой список полей', () => {
    const result = readManifest(manifestFile(HERO));
    expect(result.ok ? result.value.settings : null).toEqual([]);
  });

  it('секции нужен template.astro', () => {
    const result = readManifest(manifestFile(HERO));
    if (!result.ok) throw new Error('манифест не прочитан');
    expect(kindProblems(result.value, manifestFile(HERO)).map((item) => item.message)).toEqual([
      'у секции нужен template.astro',
    ]);
  });
});
