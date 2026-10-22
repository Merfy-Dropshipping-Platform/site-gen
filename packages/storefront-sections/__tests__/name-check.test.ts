import { describe, expect, it } from 'vitest';
import { kebabOf, nameIssue, nameIssues } from '../src/name-check';
import type { RuleField, RuleSection } from '../src/rule-types';

const UNKNOWN = 'такого имени нет в словаре';
const field = (id: string, kind: string): RuleField => ({ id, label: id, setting: { kind } });

describe('имя поля — по словарю', () => {
  it.each([
    ['heading', 'string'],
    ['text', 'richtext'],
    ['heading-size', 'select'],
    ['autoplay', 'toggle'],
  ])('%s (%s) — имя и вид из словаря', (id, kind) => {
    expect(nameIssue(id, kind)).toBeUndefined();
  });

  it.each([
    ['coatColor', 'select', 'color-scheme'],
    ['palette', 'select', 'color-scheme'],
    ['button-text', 'string', 'button-label'],
    ['title', 'string', 'heading'],
    ['img', 'image', 'image'],
    ['photo-position', 'radio', 'image-position'],
    ['heding', 'string', 'heading'],
    ['ansmr', 'richtext', 'answer'],
    ['text-align', 'alignment', 'align'],
    ['cta', 'url', 'button-link'],
    ['cta', 'string', 'button-label'],
    ['name', 'string', 'author'],
    ['mobile-image', 'image', 'image'],
  ])('%s (%s) → ближе всего %s', (id, kind, nearest) => {
    expect(nameIssue(id, kind)).toEqual({
      code: 'setting-name-unknown',
      message: `поле \`${id}\`: ${UNKNOWN}, ближе всего — \`${nearest}\``,
    });
  });

  it('ничего похожего — ближе всего нет, имена — командой', () => {
    expect(nameIssue('zzz', 'string')?.message).toBe(
      `поле \`zzz\`: ${UNKNOWN}, ближе всего — нет; имена — \`merfy section names\``,
    );
  });

  it.each([['headingSize'], ['heading_size']])('%s — не kebab-case: подсказка формы', (id) => {
    expect(nameIssue(id, 'select')).toEqual({
      code: 'setting-name-unknown',
      message: `поле \`${id}\`: имена — kebab-case, в словаре — \`heading-size\``,
    });
  });

  it.each([
    [
      'layout',
      'Секция другого вида — новая секция: её делает ИИ или автор. Мелкие отличия — поля `image-position`, `columns`, `height`',
    ],
    ['showTitle', 'Показать или скрыть часть секции — блок с `limit: 1`: его скрывают в конструкторе'],
    [
      'fontSize',
      'Шрифт и насыщенность — токены темы `font-heading` и `font-body`; размер — поля `heading-size` и `text-size`',
    ],
    ['sticky', 'Общая настройка секции: в `settings` её не объявляют, секция перечисляет её в `wrapper`'],
    [
      'products',
      'Полей выбора товаров, товара, коллекции и публикаций у секций пока нет: они появятся вместе с данными магазина в секциях',
    ],
  ])('%s — отказ с подсказкой', (id, refusal) => {
    expect(nameIssue(id, 'string')).toEqual({ code: 'setting-name-unknown', message: `поле \`${id}\`: ${UNKNOWN}. ${refusal}` });
  });

  it.each([
    ['cart-type', 'cart-type', 'Корзина → Вид корзины'],
    ['socialTelegram', 'social-telegram', 'Социальные сети → Telegram'],
    ['logo-image', 'logo-image', 'Логотип → Картинка'],
  ])('%s — настройка «Настроек темы»', (id, key, place) => {
    expect(nameIssue(id, 'string')?.message).toBe(
      `поле \`${id}\`: ${UNKNOWN}. Это настройка «Настроек темы» «${place}»; секция её читает: ` +
        `\`"uses": ["theme"]\`, в шаблоне \`theme['${key}']\``,
    );
  });

  it('вид не из словаря — setting-name-kind: виды имени и имена с этим видом', () => {
    expect(nameIssue('heading', 'richtext')).toEqual({
      code: 'setting-name-kind',
      message: 'поле `heading`: в словаре это `string`, здесь `richtext`; имена с видом `richtext` — `text`, `answer`',
    });
    expect(nameIssue('text-size', 'string')?.message).toBe(
      'поле `text-size`: в словаре это `select` или `radio`, здесь `string`; имена с видом `string` — `heading`, ' +
        '`subheading`, `button-label`, `label`, `question`, `author`, `caption`',
    );
    expect(nameIssue('heading', 'padding')?.message).toBe(
      'поле `heading`: в словаре это `string`, здесь `padding`; имён с видом `padding` в словаре нет',
    );
  });

  it('kebabOf: заглавные, подчёркивания и пробелы — через дефис', () => {
    expect(['coatColor', 'heading_size', 'Button Label', 'social--max', '-x-'].map(kebabOf)).toEqual([
      'coat-color',
      'heading-size',
      'button-label',
      'social-max',
      'x',
    ]);
  });

  it('nameIssues: место — значение id, у вида — setting.kind; поля блока — со своим путём', () => {
    const section: RuleSection = {
      lists: [
        { of: 'section', path: ['settings'], owner: 'секции', fields: [field('heading', 'string'), field('coatColor', 'select')] },
        { of: 'block', path: ['blocks', 'question', 'settings'], owner: 'блока `question`', fields: [field('heading', 'richtext')] },
      ],
      blocks: [{ type: 'question', title: 'Вопрос', limit: 20 }],
    };
    expect(nameIssues(section)).toEqual([
      {
        code: 'setting-name-unknown',
        path: ['settings', 1, 'id'],
        message: `поле \`coatColor\`: ${UNKNOWN}, ближе всего — \`color-scheme\``,
      },
      {
        code: 'setting-name-kind',
        path: ['blocks', 'question', 'settings', 0, 'setting', 'kind'],
        message: 'поле `heading`: в словаре это `string`, здесь `richtext`; имена с видом `richtext` — `text`, `answer`',
      },
    ]);
  });
});
