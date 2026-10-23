import { describe, expect, it } from 'vitest';
import { MANIFEST_FILE, readManifest } from '../src/format';
import { PROBLEM_CODES } from '../src/problems';
import { sectionTokensOf, tokenProblems } from '../src/token-rules';

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
  });
});
