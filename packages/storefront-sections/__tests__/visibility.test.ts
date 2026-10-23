import { describe, expect, it } from 'vitest';
import type { FieldList, RuleField, RuleSection } from '../src/rule-types';
import { CONDITION_KINDS, visibleWhenIssues } from '../src/visibility';

type When = { setting: string; equals: string | boolean };
const field = (id: string, kind: string, visibleWhen?: When, values: string[] = []): RuleField => ({
  id,
  label: id,
  visibleWhen,
  setting: values.length === 0 ? { kind } : { kind, options: values.map((value) => ({ value, label: value })) },
});
const sectionOf = (fields: RuleField[], blockFields?: RuleField[]): RuleSection => {
  const owner = 'блока `slide`';
  const block: FieldList[] =
    blockFields === undefined ? [] : [{ of: 'block', path: ['blocks', 'slide', 'settings'], owner, fields: blockFields }];
  return { lists: [{ of: 'section', path: ['settings'], owner: 'секции', fields }, ...block], blocks: [] };
};
const linesOf = (section: RuleSection): string[][] =>
  visibleWhenIssues(section).map((issue) => [issue.path.join('.'), issue.message]);

describe('условия показа поля', () => {
  it('ссылаться можно на четыре вида', () => {
    expect(CONDITION_KINDS).toEqual(['toggle', 'select', 'radio', 'alignment']);
  });

  it('цепочка из трёх полей — можно', () => {
    const fields = [
      field('autoplay', 'toggle'),
      field('content-position', 'select', { setting: 'autoplay', equals: true }, ['a', 'b']),
      field('heading', 'string', { setting: 'content-position', equals: 'a' }),
    ];
    expect(visibleWhenIssues(sectionOf(fields))).toEqual([]);
  });

  it('четыре поля — цепочка длиннее двух', () => {
    const fields = [
      field('autoplay', 'toggle'),
      field('content-position', 'select', { setting: 'autoplay', equals: true }, ['a', 'b']),
      field('aspect-ratio', 'select', { setting: 'content-position', equals: 'a' }, ['a', 'b']),
      field('heading', 'string', { setting: 'aspect-ratio', equals: 'a' }),
    ];
    expect(visibleWhenIssues(sectionOf(fields))).toEqual([
      {
        code: 'visible-when-invalid',
        path: ['settings', 3, 'visibleWhen'],
        message: 'поле `heading`: цепочка условий длиннее двух — `heading` → `aspect-ratio` → `content-position` → `autoplay`',
      },
    ]);
  });

  it('условия по кругу — у каждого поля круга', () => {
    const fields = [
      field('logo-position', 'select', { setting: 'menu-type', equals: 'a' }, ['a', 'b']),
      field('menu-type', 'select', { setting: 'logo-position', equals: 'a' }, ['a', 'b']),
    ];
    expect(linesOf(sectionOf(fields))).toEqual([
      ['settings.0.visibleWhen', 'поле `logo-position`: условия по кругу — `logo-position` → `menu-type` → `logo-position`'],
      ['settings.1.visibleWhen', 'поле `menu-type`: условия по кругу — `menu-type` → `logo-position` → `menu-type`'],
    ]);
  });

  it('цели нет, вид не тот, значение не из значений цели — по одной проблеме на поле', () => {
    const fields = [
      field('interval', 'string', { setting: 'open-first', equals: true }),
      field('subheading', 'string', { setting: 'heading', equals: 'x' }),
      field('heading', 'string'),
      field('autoplay', 'toggle'),
      field('caption', 'string', { setting: 'autoplay', equals: 'да' }),
      field('height', 'select', undefined, ['a', 'b']),
      field('label', 'string', { setting: 'height', equals: 'c' }),
      field('align', 'alignment'),
      field('question', 'string', { setting: 'align', equals: 'top' }),
      field('answer', 'string', { setting: 'align', equals: 'center' }),
    ];
    expect(linesOf(sectionOf(fields))).toEqual([
      ['settings.0.visibleWhen', 'поле `interval`: условие ссылается на поле `open-first`, его нет среди полей секции'],
      [
        'settings.1.visibleWhen',
        'поле `subheading`: условие — только по полю вида `toggle`, `select`, `radio` или `alignment`, у `heading` — `string`',
      ],
      ['settings.4.visibleWhen', 'поле `caption`: в условии `да`, у поля `autoplay` значения — `true` или `false`'],
      ['settings.6.visibleWhen', 'поле `label`: в условии `c`, у поля `height` значения — `a` или `b`'],
      ['settings.8.visibleWhen', 'поле `question`: в условии `top`, у поля `align` значения — `left`, `center` или `right`'],
    ]);
  });

  it('radio — значение из вариантов', () => {
    const fields = [
      field('image-position', 'radio', undefined, ['left', 'right']),
      field('caption', 'string', { setting: 'image-position', equals: 'right' }),
    ];
    expect(visibleWhenIssues(sectionOf(fields))).toEqual([]);
  });

  it('поле блока ссылается только на поля своего типа блока', () => {
    const section = sectionOf([field('autoplay', 'toggle')], [field('heading', 'string', { setting: 'autoplay', equals: true })]);
    expect(linesOf(section)).toEqual([
      [
        'blocks.slide.settings.0.visibleWhen',
        'поле `heading`: условие ссылается на поле `autoplay`, его нет среди полей блока `slide`',
      ],
    ]);
  });
});
