// Контракт секции «Шапка» (Header). Смысл настроек снят с эталона Rose:
// themes/rose/src/components/Header.astro. Особенность: у Header схемы/паддинги
// применяет ЛОКАЛЬНЫЙ патчер превью-агента (LOCAL_PATCH_REGISTRY.Header) —
// канал update-block их доносит, поэтому colorScheme здесь ПОКРЫВАЕМ.
const NAV2 = [
  { label: 'НавПроба Каталог', href: '/catalog' },
  { label: 'НавПроба О нас', href: '/about' },
];
const NAV3 = [...NAV2, { label: 'НавПроба Доставка', href: '/delivery' }];

export default {
  block: 'Header',
  fields: {
    logoPosition: {
      label: 'Положение логотипа',
      values: ['top-left', 'top-center'],
      meaning: 'логотип слева ↔ по центру (Header.astro:54-61; top-* = двухрядная шапка)',
      check: { type: 'selector-x', mediaSelector: 'a[href$="/"]', map: { 'top-left': 'left', 'top-center': 'center' } },
    },
    stickiness: {
      label: 'Статичность',
      values: ['none', 'always'],
      meaning: 'always = шапка липнет (position:sticky на блоке/обёртке); none = в потоке',
      check: { type: 'position-sticky', map: { none: false, always: true } },
    },
    colorScheme: {
      label: 'Цветовая схема',
      values: ['scheme-1', 'scheme-4'],
      meaning: 'схема перекрашивает шапку — у rose фон прозрачный, красится ТЕКСТ (лого) через vars схемы',
      check: { type: 'scheme-change', mediaSelector: ['a[href$="/"]', 'header'] },
    },
    menuColorScheme: {
      label: 'Цветовая схема меню',
      // пара схем с РАЗНЫМ --color-text в обеих темах (у flux схемы 1 и 4
      // совпадают по цвету текста — обе white)
      values: ['scheme-1', 'scheme-2'],
      meaning: 'схема перекрашивает ТОЛЬКО строку меню (патчер menuColorScheme на [data-nav-inline])',
      also: { navigationLinks: NAV2 },
      check: { type: 'scheme-change', mediaSelector: '[data-nav-inline] a' },
    },
    menuType: {
      label: 'Тип меню',
      values: ['dropdown', 'sidebar'],
      meaning: 'sidebar = пункты уходят из инлайн-полосы в шторку (инлайн-меню скрыто)',
      also: { navigationLinks: NAV2 },
      needle: 'НавПроба Каталог',
      check: { type: 'needle-visibility', needle: 'НавПроба Каталог', map: { dropdown: true, sidebar: false } },
    },
    navigationLinks: {
      label: 'Изменить пункты меню',
      values: [NAV2, NAV3],
      meaning: 'каждый добавленный пункт виден в меню',
      check: { type: 'nav-labels' },
    },
    padding: {
      label: 'Отступы',
      values: [{ top: 0, bottom: 0 }, { top: 40, bottom: 40 }],
      meaning: 'вертикальные отступы шапки (патчер Header.padding, инлайн на <header>)',
      check: { type: 'padding-delta' },
    },
  },
  uncovered: {},
};
