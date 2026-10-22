import { describe, expect, it } from 'vitest';
import { fieldRuleProblems, ruleSectionOf } from '../src/field-rules';
import { readManifest, sectionManifestSchema } from '../src/format';
import { prepareSection } from '../src/prepare';
import { problemText } from '../src/problems';
import { prepareInWorker } from '../src/sandbox';

const SIZE_OPTIONS = [
  { value: 'medium', label: 'Средний' },
  { value: 'large', label: 'Крупный' },
];
const HEADING = { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: '' } };
const manifestOf = (settings: object[], extra: object = {}) => ({
  sdk: 1,
  name: 'coat-colors',
  kind: 'section',
  title: 'Цвета пальто',
  settings,
  ...extra,
});
const COAT = manifestOf([{ id: 'coatColor', label: 'Цвет', setting: { kind: 'select', default: 'medium', options: SIZE_OPTIONS } }]);
const textOf = (raw: object): string => JSON.stringify(raw, null, 2);
const linesOf = (raw: object): string[] =>
  fieldRuleProblems(sectionManifestSchema.parse(raw), textOf(raw)).map((item) => `${problemText(item)} [${item.code}]`);

describe('правила полей в section.json', () => {
  it('имя не из словаря — место значения id', () => {
    expect(linesOf(COAT)).toEqual([
      'section.json:8:13 — поле `coatColor`: такого имени нет в словаре, ближе всего — `color-scheme` [setting-name-unknown]',
    ]);
  });

  it('поле блока — путь через blocks', () => {
    const answer = { id: 'answr', label: 'Ответ', setting: { kind: 'richtext', default: '<p>Ответ</p>' } };
    const blocks = { question: { title: 'Вопрос', limit: 20, settings: [answer] } };
    expect(linesOf(manifestOf([], { blocks }))).toEqual([
      'section.json:13:17 — поле `answr`: такого имени нет в словаре, ближе всего — `answer` [setting-name-unknown]',
    ]);
  });

  it('вид не из словаря — место setting.kind', () => {
    expect(linesOf(manifestOf([{ ...HEADING, setting: { kind: 'text', default: '' } }]))).toEqual([
      'section.json:11:17 — поле `heading`: в словаре это `string`, здесь `text`; имена с видом `text` — `text` [setting-name-kind]',
    ]);
  });

  it('условие на поле, которого нет, — место visibleWhen', () => {
    const heading = { id: 'heading', label: 'Заголовок', visibleWhen: { setting: 'autoplay', equals: true }, setting: HEADING.setting };
    expect(linesOf(manifestOf([heading]))).toEqual([
      'section.json:10:22 — поле `heading`: условие ссылается на поле `autoplay`, его нет среди полей секции [visible-when-invalid]',
    ]);
  });

  it('поля по словарю — проблем нет', () => {
    const size = { id: 'heading-size', label: 'Размер заголовка', setting: { kind: 'select', default: 'medium', options: SIZE_OPTIONS } };
    expect(linesOf(manifestOf([HEADING, size]))).toEqual([]);
  });

  it('ruleSectionOf: свой список у секции и у каждого типа блока, типы блоков', () => {
    const question = { id: 'question', label: 'Вопрос', setting: { kind: 'string', default: 'Новый вопрос' } };
    const answer = { id: 'answer', label: 'Ответ', setting: { kind: 'richtext', default: '<p>Ответ</p>' } };
    const blocks = { question: { title: 'Вопрос', limit: 20, settings: [question, answer] } };
    const section = ruleSectionOf(sectionManifestSchema.parse(manifestOf([HEADING], { blocks })));
    expect(section.blocks).toEqual([{ type: 'question', title: 'Вопрос', limit: 20 }]);
    expect(section.lists.map((list) => [list.of, list.path, list.owner, list.fields.map((item) => item.id)])).toEqual([
      ['section', ['settings'], 'секции', ['heading']],
      ['block', ['blocks', 'question', 'settings'], 'блока `question`', ['question', 'answer']],
    ]);
  });

  it('shared у поля секции — лишний ключ: manifest-invalid', () => {
    const cart = { id: 'cart-type', label: 'Вид корзины', shared: true, setting: { kind: 'string', default: '' } };
    const result = readManifest({ 'section.json': JSON.stringify(manifestOf([cart])) });
    expect(result.ok ? [] : result.problems.map((item) => [item.code, item.message.includes('"shared"')])).toEqual([
      ['manifest-invalid', true],
    ]);
  });

  it('"$schema" в section.json можно', () => {
    const raw = { $schema: '../../generated/section.schema.json', ...manifestOf([HEADING]) };
    expect(readManifest({ 'section.json': JSON.stringify(raw) }).ok).toBe(true);
  });

  it('prepareSection: правила полей и запрет в шаблоне — разом', async () => {
    const files = { 'section.json': textOf(COAT), 'template.astro': '<button onclick="x">Купить</button>' };
    const result = await prepareSection({ prefix: 'shop', files });
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['setting-name-unknown', 'template-forbidden']);
  });

  it('процесс проверки под правами — то же место и тот же текст', async () => {
    const files = { 'section.json': textOf(COAT), 'template.astro': '<p class="m-0">Пальто</p>' };
    const result = await prepareInWorker({ prefix: 'shop', files });
    expect(result.ok ? [] : result.problems.map(problemText)).toEqual([
      'section.json:8:13 — поле `coatColor`: такого имени нет в словаре, ближе всего — `color-scheme`',
    ]);
  }, 30_000);
});
