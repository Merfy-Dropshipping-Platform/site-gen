import { describe, expect, it } from 'vitest';
import { MANIFEST_FILE, readManifest } from '../src/format';
import { PROBLEM_CODES } from '../src/problems';
import { SECTION_TOKEN_EXAMPLES, sectionTokensOf, tokenProblems } from '../src/token-rules';

// Свои токены секции в section.json (блок 4 «Секций и SDK», Р4-9).
const textOf = (tokens?: unknown): string =>
  JSON.stringify(
    { sdk: 1, name: 'swatch-grid', kind: 'section', title: 'Образцы ткани', settings: [], tokens },
    null,
    2,
  );

function manifestOf(text: string) {
  const read = readManifest({ [MANIFEST_FILE]: text });
  if (!read.ok) throw new Error(read.problems.map((item) => item.message).join('\n'));
  return read.value;
}

const SWATCH = {
  'custom-swatch': { kind: 'color', about: 'Обводка образца ткани', derive: { rule: 'alias', from: 'primary' } },
};

describe('токены секции в section.json', () => {
  it('шесть новых кодов — в общем списке', () => {
    for (const code of [
      'class-unknown',
      'class-arbitrary',
      'class-dark',
      'class-theme-token',
      'class-dynamic',
      'token-invalid',
    ]) {
      expect(PROBLEM_CODES).toContain(code);
    }
  });

  it('верные токены — без проблем, sectionTokensOf отдаёт их', () => {
    const text = textOf(SWATCH);
    const manifest = manifestOf(text);
    expect(tokenProblems(manifest, text)).toEqual([]);
    expect(Object.keys(sectionTokensOf(manifest))).toEqual(['custom-swatch']);
  });

  it('нет ключа tokens — токенов нет', () => {
    const text = textOf();
    expect(tokenProblems(manifestOf(text), text)).toEqual([]);
    expect(sectionTokensOf(manifestOf(text))).toEqual({});
  });

  it('токен без метки custom — token-invalid с местом в section.json', () => {
    const text = textOf({ gold: { kind: 'color', about: 'Золото', default: '#c9a227' } });
    const problems = tokenProblems(manifestOf(text), text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'token-invalid', file: MANIFEST_FILE });
    expect(problems[0]?.line).not.toBeNull();
    expect(problems[0]?.message).toContain('gold');
    expect(problems[0]?.message).toContain('Верно: "custom-gold": { "kind": "color"');
  });

  it('значение рядом с kind — отказ с верной строкой того же вида и именем автора', () => {
    const text = textOf({ 'custom-hero': { kind: 'text', about: 'Заголовок', min: 40, max: 72, leading: 1.1 } });
    const [found] = tokenProblems(manifestOf(text), text);
    expect(found?.message).toContain('Верно: "text-custom-hero": { "kind": "text"');
    expect(found?.message).toContain('"default": { "min": 40, "max": 72, "leading": 1.05 }');
    expect(found?.message).toContain('значение — в default, не рядом с kind');
  });

  it('напоминание про default — только когда значение лежит рядом с kind, а не при ошибке имени', () => {
    const text = textOf({ plate: { kind: 'color', about: 'Подложка', default: '#f1ece4' } });
    const [found] = tokenProblems(manifestOf(text), text);
    expect(found?.message).toContain('"custom-plate": { "kind": "color"');
    expect(found?.message).not.toContain('не рядом с kind');
  });

  it('вид «size» не бывает — перечень видов и пример цвета', () => {
    const text = textOf({ 'custom-big': { kind: 'size', about: 'Размер', default: 10 } });
    const [found] = tokenProblems(manifestOf(text), text);
    expect(found?.message).toContain('Виды токена секции: color, weight, text');
    expect(found?.message).toContain(SECTION_TOKEN_EXAMPLES.color);
  });

  it('plate без custom- у любого вида получает верное имя с приставкой', () => {
    const text = textOf({ 'text-size': { kind: 'text', about: 'Размер', default: { min: 10, max: 20, leading: 1.2 } } });
    const [found] = tokenProblems(manifestOf(text), text);
    expect(found?.message).toContain('"text-custom-size"');
  });

  it('тень — alias от тени словаря проходит; тень с default — отказ с верной строкой от shadow-raised (шаг 6)', () => {
    const good = textOf({ 'shadow-custom-lift': { kind: 'shadow', about: 'Тень', derive: { rule: 'alias', from: 'shadow-card' } } });
    expect(tokenProblems(manifestOf(good), good)).toEqual([]);
    const bad = textOf({ 'shadow-lift': { kind: 'shadow', about: 'Тень', default: { x: 0, y: 4, blur: 8, spread: 0, opacity: 0.2 } } });
    const messages = tokenProblems(manifestOf(bad), bad).map((item) => item.message).join('\n');
    expect(messages).toContain('"shadow-custom-lift"');
    expect(messages).toContain('"from": "shadow-raised"');
  });

  it('все девять примеров принимает проверка токенов', () => {
    const text = textOf(JSON.parse(`{${Object.values(SECTION_TOKEN_EXAMPLES).join(',')}}`));
    expect(tokenProblems(manifestOf(text), text)).toEqual([]);
  });
});
