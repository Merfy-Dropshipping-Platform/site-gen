import { describe, expect, it } from 'vitest';
import { SETTINGS_LIMITS, limitIssues } from '../src/limits';
import type { BlockType, FieldList, RuleField, RuleSection } from '../src/rule-types';

const string = (id: string, extra: Partial<RuleField> = {}): RuleField => ({
  id,
  label: id,
  setting: { kind: 'string' },
  ...extra,
});
const select = (id: string, labels: string[]): RuleField => ({
  id,
  label: id,
  setting: { kind: 'select', options: labels.map((label, index) => ({ value: String.fromCharCode(97 + index), label })) },
});
const many = (count: number, prefix: string): RuleField[] =>
  Array.from({ length: count }, (_, index) => string(`${prefix}-${index + 1}`));
const blockList = (type: string, fields: RuleField[]): FieldList => ({
  of: 'block',
  path: ['blocks', type, 'settings'],
  owner: `блока \`${type}\``,
  fields,
});
const sectionOf = (fields: RuleField[], lists: FieldList[] = [], blocks: BlockType[] = []): RuleSection => ({
  lists: [{ of: 'section', path: ['settings'], owner: 'секции', fields }, ...lists],
  blocks,
});
const types = (count: number, limit: number): BlockType[] =>
  Array.from({ length: count }, (_, index) => ({ type: `t${index + 1}`, title: `Тип ${index + 1}`, limit }));
const variants = (count: number): string[] => Array.from({ length: count }, (_, index) => `Вариант ${index + 1}`);
const long = (length: number): string => 'я'.repeat(length);

describe('лимиты полей секции', () => {
  it('числа — из раздела 3.4 design.md блока 3', () => {
    expect(SETTINGS_LIMITS).toEqual({
      sectionFields: 20,
      blockFields: 16,
      blockTypes: 6,
      blocksTotal: 50,
      optionsMin: 2,
      optionsMax: 10,
      labelMax: 32,
      sublabelMax: 120,
    });
  });

  it('на границе — проблем нет', () => {
    const fields = [
      ...many(18, 'f'),
      select('height', variants(10)),
      { ...select('align', variants(2)), label: long(32), sublabel: long(120), section: long(32), row: long(32) },
    ];
    const blocks = [...types(5, 8), { type: 't6', title: long(32), limit: 10 }];
    expect(limitIssues(sectionOf(fields, [blockList('t1', many(16, 'c'))], blocks))).toEqual([]);
  });

  it('21 поле у секции, 17 у типа блока', () => {
    const lists = [blockList('card', many(16, 'c')), blockList('slide', many(17, 's'))];
    expect(limitIssues(sectionOf(many(21, 'f'), lists))).toEqual([
      { code: 'settings-limit', path: ['settings'], message: 'полей у секции — 21, можно не больше 20' },
      {
        code: 'settings-limit',
        path: ['blocks', 'slide', 'settings'],
        message: 'полей у блока `slide` — 17, можно не больше 16',
      },
    ]);
  });

  it('7 типов блоков, сумма limit — 51', () => {
    const blocks = [...types(6, 8), { type: 't7', title: 'Тип 7', limit: 3 }];
    expect(limitIssues(sectionOf([], [], blocks))).toEqual([
      { code: 'settings-limit', path: ['blocks'], message: 'типов блоков — 7, можно не больше 6' },
      { code: 'settings-limit', path: ['blocks'], message: 'блоков по `limit` — 51, можно не больше 50' },
    ]);
  });

  it('вариантов 11 и 1 — проблема, 10 — нет', () => {
    const fields = [select('height', variants(10)), select('aspect-ratio', variants(11)), select('text-size', variants(1))];
    expect(limitIssues(sectionOf(fields))).toEqual([
      {
        code: 'settings-limit',
        path: ['settings', 1, 'setting', 'options'],
        message: 'поле `aspect-ratio`: вариантов — 11, можно от 2 до 10',
      },
      {
        code: 'settings-limit',
        path: ['settings', 2, 'setting', 'options'],
        message: 'поле `text-size`: вариантов — 1, можно от 2 до 10',
      },
    ]);
  });

  it('подписи: label, section, row, title блока и подпись варианта — до 32 знаков, sublabel — до 120', () => {
    const fields = [
      string('heading', { label: long(32), sublabel: long(120) }),
      string('subheading', { label: long(33), sublabel: long(121), section: long(33), row: long(33) }),
      select('height', [long(32), long(33)]),
    ];
    const blocks = [
      { type: 'slide', title: long(33), limit: 5 },
      { type: 'card', title: long(32), limit: 5 },
    ];
    expect(limitIssues(sectionOf(fields, [], blocks)).map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['settings.1.label', 'поле `subheading`: `label` длиннее 32 знаков'],
      ['settings.1.section', 'поле `subheading`: `section` длиннее 32 знаков'],
      ['settings.1.row', 'поле `subheading`: `row` длиннее 32 знаков'],
      ['settings.1.sublabel', 'поле `subheading`: `sublabel` длиннее 120 знаков'],
      ['settings.2.setting.options.1.label', 'поле `height`: подпись варианта `b` длиннее 32 знаков'],
      ['blocks.slide.title', 'блок `slide`: `title` длиннее 32 знаков'],
    ]);
  });
});
