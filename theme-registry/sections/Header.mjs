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
      // Пара схем, у которых --color-text РАЗНЫЙ во ВСЕХ темах:
      //   rose 18 18 18 → 26 26 26 · flux 153 153 153 → 0 0 0 · vanilla 255 255 255 → 38 49 28.
      // 1/2 не годилась (у vanilla обе белые), 1/3 тоже (у flux обе рендерятся белыми:
      // цвет меню там задаёт CSS-правило по классу схемы, а не токен).
      values: ['scheme-2', 'scheme-3'],
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
