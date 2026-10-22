import { describe, expect, it } from 'vitest';
import { readManifest, sectionGroupsOf } from '../src/format';
import { EMPTY_MENU, menuTreeOf, revisionMenusSchema, sectionMenus } from '../src/menus';

// Место секции и меню (блок 1 «Секций и SDK», часть 4, design.md 3.21–3.22, Р1-4-2, Р1-4-3).
const MENU = { id: 'menu', label: 'Изменить пункты меню', setting: { kind: 'menu', default: 'main' } };
const HEADER = {
  sdk: 1,
  name: 'header',
  kind: 'section',
  title: 'Шапка',
  settings: [MENU],
  groups: ['header'],
  limit: 1,
  removable: false,
  uses: ['theme', 'shop'],
};
const PAGE = {
  sdk: 1,
  name: 'page',
  kind: 'section',
  title: 'Страница',
  settings: [{ id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Страница' } }],
  newPage: 'heading',
};
const filesOf = (manifest: unknown) => ({ 'section.json': JSON.stringify(manifest) });
const problemsOf = (manifest: unknown): string[] => {
  const read = readManifest(filesOf(manifest));
  return read.ok ? [] : read.problems.map((item) => `${item.code} ${item.message}`).sort();
};
const manifestOf = (manifest: unknown) => {
  const read = readManifest(filesOf(manifest));
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  return read.value;
};

describe('groups, limit, removable, uses, newPage в section.json', () => {
  it('шапка и страница проходят; без groups — только страницы', () => {
    expect(sectionGroupsOf(manifestOf(HEADER))).toEqual(['header']);
    expect(sectionGroupsOf(manifestOf(PAGE))).toEqual(['page']);
    expect(manifestOf(HEADER)).toMatchObject({ limit: 1, removable: false, uses: ['theme', 'shop'] });
  });

  it('группа дважды или неизвестная, limit вне 1–50, removable: true, неизвестное и повтор в uses — отказ с путём', () => {
    expect(problemsOf({ ...HEADER, groups: ['header', 'header'] })).toEqual(['manifest-invalid groups: группа дважды']);
    expect(problemsOf({ ...HEADER, groups: ['sidebar'] })).toEqual([
      expect.stringMatching(/^manifest-invalid groups\.0: /),
    ]);
    expect(problemsOf({ ...HEADER, limit: 0 })).toEqual([expect.stringMatching(/^manifest-invalid limit: /)]);
    expect(problemsOf({ ...HEADER, limit: 51 })).toEqual([expect.stringMatching(/^manifest-invalid limit: /)]);
    expect(problemsOf({ ...HEADER, removable: true })).toEqual([
      expect.stringMatching(/^manifest-invalid removable: /),
    ]);
    expect(problemsOf({ ...HEADER, uses: ['cart'] })).toEqual([expect.stringMatching(/^manifest-invalid uses\.0: /)]);
    expect(problemsOf({ ...HEADER, uses: ['shop', 'shop'] })).toEqual(['manifest-invalid uses: значение дважды']);
  });

  it('у глобального скрипта места нет: ключи места — отказ', () => {
    const global = { sdk: 1, name: 'locate', kind: 'global', title: 'Город', settings: [] };
    expect(problemsOf({ ...global, groups: ['page'], uses: ['shop'] })).toEqual([
      'manifest-invalid groups: у глобального скрипта нет места на странице',
      'manifest-invalid uses: у глобального скрипта нет места на странице',
    ]);
  });

  it('newPage — настройка вида string у секции с группой page', () => {
    expect(problemsOf({ ...PAGE, newPage: 'title' })).toEqual([
      'manifest-invalid newPage: нужна настройка вида string, title — не она',
    ]);
    expect(problemsOf({ ...PAGE, groups: ['header'] })).toEqual([
      'manifest-invalid newPage: секция ставится на страницу — нужна группа page',
    ]);
  });

  it('вид menu: значение — id меню; у настроек блока — отказ', () => {
    expect(problemsOf({ ...HEADER, settings: [{ ...MENU, setting: { kind: 'menu', default: 'Главное' } }] })).toEqual([
      'setting-invalid settings.0.default: нужен id меню: строчные латинские буквы и цифры через дефис, до 40 знаков',
    ]);
    const blocks = { link: { title: 'Ссылка', limit: 5, settings: [MENU] } };
    expect(problemsOf({ ...HEADER, blocks })).toEqual([
      'setting-invalid blocks.link.settings.0: вид menu — только у настроек секции',
    ]);
  });
});

describe('меню ревизии', () => {
  const MENUS = [
    {
      id: 'main',
      title: 'Главное меню',
      items: [
        {
          label: 'Каталог',
          url: '/catalog',
          items: [{ label: 'Шарфы', url: '/catalog/scarves', items: [{ label: 'Кашемир', url: '/catalog/cashmere' }] }],
        },
        { label: 'Скрипт', url: 'javascript:alert(1)' },
        { label: 'Почта', url: 'mailto:hi@merfy.ru' },
        { label: 'Чужой', url: '//evil.example' },
      ],
    },
  ];

  it('до трёх уровней; четвёртый уровень, лишний ключ и id не kebab — отказ схемы', () => {
    expect(revisionMenusSchema.safeParse(MENUS).success).toBe(true);
    const leaf = { label: 'c', url: '/', items: [] };
    const deep = [
      { id: 'main', title: '', items: [{ label: 'a', url: '/', items: [{ label: 'b', url: '/', items: [leaf] }] }] },
    ];
    expect(revisionMenusSchema.safeParse(deep).success).toBe(false);
    expect(revisionMenusSchema.safeParse([{ ...MENUS[0], extra: 1 }]).success).toBe(false);
    expect(revisionMenusSchema.safeParse([{ ...MENUS[0], id: 'Main' }]).success).toBe(false);
  });

  it('дерево: items — всегда список; адрес не свой, не http(s), mailto, tel — #; меню нет — пустое', () => {
    const tree = menuTreeOf(revisionMenusSchema.parse(MENUS), 'main');
    expect(tree.title).toBe('Главное меню');
    expect(tree.items.map((item) => [item.label, item.url, item.items.length])).toEqual([
      ['Каталог', '/catalog', 1],
      ['Скрипт', '#', 0],
      ['Почта', 'mailto:hi@merfy.ru', 0],
      ['Чужой', '#', 0],
    ]);
    expect(tree.items[0]?.items[0]?.items[0]).toEqual({ label: 'Кашемир', url: '/catalog/cashmere', items: [] });
    expect(menuTreeOf([], 'main')).toEqual(EMPTY_MENU);
  });

  it('деревья для настроек вида menu секции — по id настройки', () => {
    const fields = [MENU, { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: '' } }];
    const trees = sectionMenus(fields, { menu: 'main', heading: 'x' }, revisionMenusSchema.parse(MENUS));
    expect(Object.keys(trees)).toEqual(['menu']);
    expect(trees.menu?.items).toHaveLength(4);
    expect(sectionMenus(fields, { menu: 'footer', heading: 'x' }, [])).toEqual({ menu: EMPTY_MENU });
  });
});
