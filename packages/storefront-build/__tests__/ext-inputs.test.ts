import { describe, expect, it } from 'vitest';
import { parseBuildInputs } from '../src/inputs';
import { buildKey, dataKey } from '../src/key';
import { errorOf, rawInputs } from './support';
import { SHELL } from './support-code';
import { EXT_META, REVIEWS, TEST_EXT, withReviews } from './support-ext';

// Описания сторов и методов расширений и "ext:<id>" в meta секции во входах сборки (блок 9 «Секций и SDK», часть 9в;
// Р9в-20, Р9в-23). Расширение — test-ext «Отзывы-тест».
const rawWith = (section: Record<string, unknown>) =>
  rawInputs((value) => Object.assign(value, { shell: SHELL, code: { sections: [section], pages: {}, globals: [] } }));

describe('описания расширений во входах сборки', () => {
  it('code.extensions и ext:<id> в meta.uses проходят схему входов', () => {
    const inputs = withReviews();
    expect(parseBuildInputs(inputs)).toEqual(inputs);
  });

  it('описание не той формы — inputs-invalid', () => {
    const inputs = withReviews((changed) => {
      changed.code.extensions = { 'test-ext': { ...TEST_EXT, stores: { $summary: { fn: 'shopSummary' } } } };
    });
    expect(errorOf(() => parseBuildInputs(inputs))).toMatchObject({ code: 'inputs-invalid' });
  });

  it.each([
    ['ext: без id в meta.uses', { ...REVIEWS, meta: { ...EXT_META, uses: ['ext:'] } }, 'code.sections.0.meta.uses.0'],
    [
      'ext:<id> в meta.parts',
      { ...REVIEWS, meta: { ...EXT_META, parts: ['ext:test-ext'] } },
      'code.sections.0.meta.parts.0',
    ],
    ['ext:<id> в uses данных шаблона', { ...REVIEWS, uses: ['ext:test-ext'] }, 'code.sections.0.uses.0'],
  ])('inputs-invalid: %s', (_name, section, path) => {
    expect(errorOf(() => parseBuildInputs(rawWith(section)))).toMatchObject({ code: 'inputs-invalid', path });
  });

  it('описания — во входах ключа сборки; ключ данных их не включает', () => {
    const changed = withReviews((inputs) => {
      inputs.code.extensions = { 'test-ext': { ...TEST_EXT, methods: {} } };
    });
    expect(buildKey(changed)).not.toBe(buildKey(withReviews()));
    expect(dataKey(changed)).toBe(dataKey(withReviews()));
  });
});
