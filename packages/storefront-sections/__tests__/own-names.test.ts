import { describe, expect, it } from 'vitest';
import { fieldRuleProblems } from '../src/field-rules';
import { sectionManifestSchema } from '../src/format';
import { problemText } from '../src/problems';

// Свои имена секции: раздел `names` в section.json (задача 6 proof of concept MCP).
const SKU = { kinds: ['toggle'], label: 'Артикул', asks: ['артикул'] };
const TOGGLE = { kind: 'toggle', default: false, labels: { on: 'Да', off: 'Нет' } };
const SKU_FIELD = { id: 'sku', label: 'Показывать артикул', setting: TOGGLE };
const manifestOf = (settings: object[], names?: object) => ({
  sdk: 1,
  name: 'product-card',
  kind: 'section',
  title: 'Карточка товара',
  settings,
  ...(names === undefined ? {} : { names }),
});
const linesOf = (raw: object): string[] =>
  fieldRuleProblems(sectionManifestSchema.parse(raw), JSON.stringify(raw, null, 2)).map(
    (item) => `${problemText(item)} [${item.code}]`,
  );
const codesOf = (raw: object): string[] =>
  fieldRuleProblems(sectionManifestSchema.parse(raw), JSON.stringify(raw, null, 2)).map((item) => item.code);
// n своих имён вида own-1…own-n и по полю вида string на каждое.
const manyNames = (count: number) => {
  const ids = Array.from({ length: count }, (_, index) => `own-${index + 1}`);
  return manifestOf(
    ids.map((id) => ({ id, label: id, setting: { kind: 'string', default: '' } })),
    Object.fromEntries(ids.map((id) => [id, { kinds: ['string'], label: id, asks: [id] }])),
  );
};

describe('свои имена секции', () => {
  it('имя из names секции принято', () => {
    expect(linesOf(manifestOf([SKU_FIELD], { sku: SKU }))).toEqual([]);
  });

  it('имя не из словаря и без names — прежний отказ setting-name-unknown', () => {
    const lines = linesOf(manifestOf([SKU_FIELD]));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('поле `sku`: такого имени нет в словаре');
    expect(lines[0]).toContain('[setting-name-unknown]');
  });

  it('имя есть в names другого поля, но не этого: отказ остаётся', () => {
    expect(codesOf(manifestOf([SKU_FIELD], { sale: { ...SKU, label: 'Скидка' } }))).toEqual(['setting-name-unknown']);
  });

  it('вид поля не из kinds — setting-name-kind с текстом про names', () => {
    const field = { ...SKU_FIELD, setting: { kind: 'string', default: '' } };
    expect(linesOf(manifestOf([field], { sku: SKU }))).toEqual([
      'section.json:11:17 — поле `sku`: в `names` секции это `toggle`, здесь `string` [setting-name-kind]',
    ]);
  });

  it('поле блока тоже берёт свои имена секции', () => {
    const blocks = { card: { title: 'Карточка', limit: 6, settings: [SKU_FIELD] } };
    expect(linesOf({ ...manifestOf([], { sku: SKU }), blocks })).toEqual([]);
  });

  describe('name-own-invalid', () => {
    it.each([['Show_Sku'], ['sku--x'], ['артикул'], ['a'.repeat(33)]])('имя %s — отказ', (name) => {
      const lines = linesOf(manifestOf([], { [name]: SKU }));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`своё имя \`${name}\`: нужны строчные латинские буквы и цифры через одиночный дефис, до 32 знаков`);
      expect(lines[0]).toContain('[name-own-invalid]');
    });

    it('32 знака — можно', () => {
      const name = 'a'.repeat(32);
      expect(linesOf(manifestOf([], { [name]: SKU }))).toEqual([]);
    });

    it('имя из not-names.json — отказ с подсказкой, что вместо', () => {
      const lines = linesOf(manifestOf([], { layout: SKU }));
      expect(lines).toEqual([
        'section.json:8:15 — своё имя `layout`: такое имя нельзя. Секция другого вида — новая секция: её делает ИИ или автор. Мелкие отличия — поля `image-position`, `columns`, `height` [name-own-invalid]',
      ]);
    });

    it('поле с отклонённым своим именем остаётся без имени: setting-name-unknown', () => {
      const field = { id: 'Show_Sku', label: 'Артикул', setting: TOGGLE };
      expect(codesOf(manifestOf([field], { Show_Sku: SKU }))).toEqual(['name-own-invalid', 'setting-name-unknown']);
    });
  });

  it('name-own-in-dictionary — имя уже есть в словаре', () => {
    expect(linesOf(manifestOf([], { heading: { kinds: ['string'], label: 'Заголовок', asks: ['заголовок'] } }))).toEqual([
      'section.json:8:16 — своё имя `heading` уже есть в словаре: убери его из `names` — поле возьмёт имя, виды и подпись из словаря [name-own-in-dictionary]',
    ]);
  });

  it('поле с именем из словаря берёт вид из словаря, а не из names', () => {
    const own = { kinds: ['richtext'], label: 'Заголовок', asks: ['заголовок'] };
    const field = { id: 'heading', label: 'Заголовок', setting: { kind: 'richtext', default: '' } };
    expect(codesOf(manifestOf([field], { heading: own }))).toEqual(['name-own-in-dictionary', 'setting-name-kind']);
  });

  describe('names-limit', () => {
    it('10 своих имён — можно', () => {
      expect(linesOf(manyNames(10))).toEqual([]);
    });

    it('11 своих имён — отказ, место — ключ names', () => {
      expect(linesOf(manyNames(11))).toEqual([
        expect.stringMatching(/^section\.json:\d+:\d+ — своих имён в `names` — 11, можно не больше 10; .* \[names-limit\]$/),
      ]);
    });
  });

  it('форма значения: пустые kinds, лишний ключ или вид не из SDK — отказ схемы формата', () => {
    const bad = [{ ...SKU, kinds: [] }, { ...SKU, kinds: ['switch'] }, { ...SKU, about: 'лишнее' }, { kinds: ['toggle'] }];
    expect(bad.map((own) => sectionManifestSchema.safeParse(manifestOf([], { sku: own })).success)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
