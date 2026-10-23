import { describe, expect, it } from 'vitest';
import { NAMES, SDK_KINDS, parseNames, sharedSettingHint } from '../src/names';

const GROUP = { id: 'content', title: 'Содержимое' };
const ENTRY = { kinds: ['string'], label: 'Заголовок', group: 'content', about: 'Заголовок секции', asks: ['title'] };

const problemsOf = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message.split('\n') : ['не Error'];
  }
  return [];
};

describe('словарь имён полей', () => {
  it('файлы пакета читаются: 33 имени в трёх группах, 8 отказов, 9 сквозных', () => {
    expect(NAMES.names).toHaveLength(33);
    expect(NAMES.groups.map((group) => group.title)).toEqual(['Содержимое', 'Вид', 'Поведение']);
    expect(NAMES.refusals.map((refusal) => refusal.id)).toEqual([
      'section-view',
      'own-color',
      'font',
      'spacing',
      'width',
      'show-hide',
      'wrapper',
      'shop-data',
    ]);
    expect(NAMES.shared.map((item) => item.id)).toEqual([
      'logo-image',
      'social-telegram',
      'social-vk',
      'social-dzen',
      'social-youtube',
      'social-tiktok',
      'social-max',
      'cart-type',
      'cookie-banner-enabled',
    ]);
  });

  it('имена — по порядку файла, виды — из списка SDK', () => {
    expect(NAMES.names.slice(0, 4).map((entry) => entry.name)).toEqual([
      'heading',
      'subheading',
      'text',
      'button-label',
    ]);
    expect(NAMES.names.flatMap((entry) => entry.kinds).every((kind) => SDK_KINDS.includes(kind))).toBe(true);
  });

  it('запись словаря — с именем', () => {
    const names = parseNames({ v: 1, groups: [GROUP], names: { heading: ENTRY } }, [], []);
    expect(names.names).toEqual([{ name: 'heading', ...ENTRY }]);
  });

  it('форма: имя не kebab-case, вид не из списка, описание короче трёх знаков', () => {
    const file = {
      v: 1,
      groups: [GROUP],
      names: { Heading: ENTRY, rating: { ...ENTRY, kinds: ['stars'] }, image: { ...ENTRY, about: 'да' } },
    };
    expect(problemsOf(() => parseNames(file, [], [])).map((line) => line.split(': ').slice(0, 2).join(': '))).toEqual([
      'names.json: names.Heading',
      'names.json: names.rating.kinds.0',
      'names.json: names.image.about',
    ]);
  });

  it('смысл: группа дважды, группы нет, отказ — уже имя или повтор, сквозная — уже имя или отказ', () => {
    const file = { v: 1, groups: [GROUP, GROUP], names: { heading: ENTRY, text: { ...ENTRY, group: 'look' } } };
    const notNames = [
      { id: 'font', names: ['font', 'heading'], refusal: 'Шрифт — токены темы' },
      { id: 'font-size', names: ['font'], refusal: 'Размер — поля размера' },
    ];
    const shared = [
      { id: 'heading', label: 'Заголовок', group: 'Шапка' },
      { id: 'font', label: 'Шрифт', group: 'Типографика' },
    ];
    expect(problemsOf(() => parseNames(file, notNames, shared))).toEqual([
      'names.json: группа content повторяется',
      'names.json: имя text: группы look нет',
      'not-names.json: heading — уже имя словаря',
      'not-names.json: font — в отказах дважды',
      'shared-settings.json: heading — уже имя словаря',
      'shared-settings.json: font — уже в отказах',
    ]);
  });

  it('подсказка сквозной настройки — группа и подпись, uses и ключ в шаблоне', () => {
    expect(sharedSettingHint({ id: 'cart-type', label: 'Вид корзины', group: 'Корзина' })).toBe(
      'настройка «Настроек темы» «Корзина → Вид корзины»; секция её читает: `"uses": ["theme"]`, в шаблоне `theme[\'cart-type\']`',
    );
  });
});
