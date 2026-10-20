import { describe, expect, it } from 'vitest';
import { SOURCE_LIMITS, fileProblems, kindProblems, limitProblems, readManifest, scriptEntryOf } from '../src/format';
import { problem, problemText, type SectionProblem } from '../src/problems';

const MANIFEST = { sdk: 1, name: 'color-match', kind: 'section', title: 'Подбор шарфа по цвету пальто' } as const;
const section = (extra: Record<string, string> = {}): Record<string, string> => ({
  'section.json': JSON.stringify(MANIFEST),
  'template.astro': '<p>Подбор</p>',
  ...extra,
});
const codesOf = (problems: readonly SectionProblem[]): string[] => problems.map((item) => item.code);

describe('section.json', () => {
  it('разбор; поля настроек по умолчанию пусты', () => {
    expect(readManifest(section())).toEqual({ ok: true, value: { ...MANIFEST, settings: [] } });
  });

  it('нет section.json — manifest-missing', () => {
    expect(readManifest({ 'template.astro': '' })).toEqual({
      ok: false,
      problems: [problem('manifest-missing', 'section.json', 'нет section.json')],
    });
  });

  it('не JSON — manifest-invalid со строкой и колонкой из сообщения разбора', () => {
    const result = readManifest({ 'section.json': '{\n  "sdk": 1,\n  "name" "x"\n}' });
    expect(result.ok ? [] : result.problems).toMatchObject([
      { code: 'manifest-invalid', file: 'section.json', line: 3, column: 10 },
    ]);
  });

  it('не по схеме — по проблеме на поле, путь — в начале текста', () => {
    const result = readManifest({
      'section.json': JSON.stringify({ ...MANIFEST, name: 'Color Match', kind: 'island' }),
    });
    const problems = result.ok ? [] : result.problems;
    expect(codesOf(problems)).toEqual(['manifest-invalid', 'manifest-invalid']);
    expect(problems.map((item) => item.message.split(':')[0])).toEqual(['name', 'kind']);
  });
});

describe('файлы секции', () => {
  it('незнакомый файл, файл тяжелее предела, два входа скрипта', () => {
    const files = section({
      'README.md': '# секция',
      'lib/../../evil.ts': '',
      'script.ts': 'export default {}',
      'script.js': 'export default {}',
      'lib/big.ts': 'x'.repeat(SOURCE_LIMITS.fileBytes + 1),
    });
    // Пределы — первыми (prepare.ts на них останавливается), потом файлы.
    expect(fileProblems(files).map((item) => [item.code, item.file])).toEqual([
      ['file-too-large', 'lib/big.ts'],
      ['file-unknown', 'README.md'],
      ['file-unknown', 'lib/../../evil.ts'],
      ['script-invalid', 'script.js'],
    ]);
  });

  it('пределы исходника: число файлов и общий вес', () => {
    const many = Object.fromEntries(
      Array.from({ length: SOURCE_LIMITS.files }, (_, index) => [`lib/f${index}.ts`, '']),
    );
    expect(codesOf(limitProblems(section(many)))).toEqual(['source-too-large']);
    const heavy = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [`lib/h${index}.ts`, 'x'.repeat(60 * 1024)]),
    );
    expect(codesOf(limitProblems(section(heavy)))).toEqual(['source-too-large']);
  });

  it('секция — с шаблоном; глобальный скрипт — без шаблона и стилей, со скриптом', () => {
    const sectionManifest = { ...MANIFEST, settings: [] };
    expect(kindProblems(sectionManifest, { 'section.json': '' }).map((item) => item.file)).toEqual(['template.astro']);
    const globalManifest = { ...sectionManifest, kind: 'global' as const };
    expect(kindProblems(globalManifest, { 'template.astro': '' }).map((item) => item.file)).toEqual([
      'template.astro',
      'script.ts',
    ]);
    expect(kindProblems(globalManifest, { 'script.js': '' })).toEqual([]);
  });

  it('вход скрипта — script.ts, иначе script.js, иначе скрипта нет', () => {
    expect(scriptEntryOf({ 'script.js': '', 'script.ts': '' })).toBe('script.ts');
    expect(scriptEntryOf({ 'script.js': '' })).toBe('script.js');
    expect(scriptEntryOf({ 'template.astro': '' })).toBeNull();
  });

  it('текст проблемы — «файл:строка:колонка — текст»', () => {
    const forbidden = problem('template-forbidden', 'template.astro', 'обработчик onclick', { line: 3, column: 5 });
    expect(problemText(forbidden)).toBe('template.astro:3:5 — обработчик onclick');
    expect(problemText(problem('manifest-missing', 'section.json', 'нет section.json'))).toBe(
      'section.json — нет section.json',
    );
    expect(problemText(problem('build-timeout', '', 'сборка дольше 10000 мс'))).toBe('сборка дольше 10000 мс');
  });
});
