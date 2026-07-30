#!/usr/bin/env node
/**
 * Матрица настроек Header: для каждой настройки рендерим блок с двумя
 * РАЗНЫМИ значениями и убеждаемся, что разметка на них реагирует.
 *
 * Проверяется механизм, а не картинка: настройка, которая не меняет разметку —
 * мёртвая, сколько бы её ни крутили в панели.
 *
 *   node flux-baseline/header-settings-matrix.mjs [siteId]
 */
const SITE = process.argv[2] || '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const URL_ = `http://localhost:3114/api/sites/${SITE}/preview/block`;

const BASE = {
  id: 'Header-test',
  siteTitle: 'Flux',
  logoPosition: 'top-left',
  stickiness: 'scroll-up',
  padding: { top: 12, bottom: 12 },
  menuType: 'dropdown',
  colorScheme: 'scheme-2',
  navigationLinks: [
    { label: 'Главная', href: '/' },
    { label: 'Каталог', href: '/catalog' },
  ],
  actionButtons: { showCart: 'true', showSearch: 'true', showProfile: 'true' },
};

async function render(props) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockType: 'Header', themeId: 'flux', props: { ...BASE, ...props } }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Настройка → [значение A, значение B, что искать в разметке]. */
const CASES = [
  ['Положение логотипа', { logoPosition: 'top-left' }, { logoPosition: 'center-absolute' },
    (h) => /flex-col/.test(h) ? 'два ряда' : 'один ряд'],
  ['Положение логотипа (центр)', { logoPosition: 'top-left' }, { logoPosition: 'top-center' },
    (h) => (h.match(/justify-center|items-center/g) || []).length],
  ['Статичность', { stickiness: 'none' }, { stickiness: 'always' },
    (h) => /sticky/.test(h) ? 'sticky' : 'обычный'],
  ['Отступы', { padding: { top: 12, bottom: 12 } }, { padding: { top: 40, bottom: 40 } },
    (h) => (h.match(/padding-top:\s*\d+px/) || [/py-6/.test(h) ? 'py-6 (литерал вёрстки)' : '—'])[0]],
  ['Тип меню', { menuType: 'dropdown' }, { menuType: 'sidebar' },
    (h) => /data-nav-drawer|flux-burger/.test(h) && !/md:flex/.test(h.split('nav')[1] || '') ? 'шторка' : 'inline-nav'],
  ['Тип меню (расширенное)', { menuType: 'dropdown' }, { menuType: 'mega-menu' },
    (h) => /tracking-\[0\.06em\]/.test(h) ? 'mega (tracking)' : 'обычное'],
  ['Цветовая схема', { colorScheme: 'scheme-2' }, { colorScheme: 'scheme-1' },
    (h) => (h.match(/color-scheme-\d/g) || ['нет']).join(',')],
  ['Цветовая схема меню', {}, { menuColorScheme: 'scheme-1' },
    (h) => (h.match(/color-scheme-\d/g) || ['нет']).join(',')],
  ['Пункты меню', { navigationLinks: [{ label: 'Один', href: '/a' }] },
    { navigationLinks: [{ label: 'Один', href: '/a' }, { label: 'Два', href: '/b' }, { label: 'Три', href: '/c' }] },
    (h) => (h.match(/>(Один|Два|Три)</g) || []).length + ' пункт(ов)'],
  ['Кнопка поиска', { actionButtons: { showSearch: 'true', showCart: 'true', showProfile: 'true' } },
    { actionButtons: { showSearch: 'false', showCart: 'true', showProfile: 'true' } },
    (h) => /toggle-search/.test(h) ? 'есть' : 'нет'],
  ['Кнопка корзины', { actionButtons: { showSearch: 'true', showCart: 'true', showProfile: 'true' } },
    { actionButtons: { showSearch: 'true', showCart: 'false', showProfile: 'true' } },
    (h) => (h.match(/data-cart-open/g) || []).length + ' шт'],
  ['Кнопка профиля', { actionButtons: { showSearch: 'true', showCart: 'true', showProfile: 'true' } },
    { actionButtons: { showSearch: 'true', showCart: 'true', showProfile: 'false' } },
    (h) => /icons\/user\.svg/.test(h) ? 'есть' : 'нет'],
  ['Название сайта', { siteTitle: 'Flux' }, { siteTitle: 'ДРУГОЕ ИМЯ' },
    (h) => /ДРУГОЕ ИМЯ/.test(h) ? 'ДРУГОЕ ИМЯ' : 'Flux'],
  ['Логотип-картинка', {}, { logo: 'https://example.com/my-logo.png' },
    (h) => /my-logo\.png/.test(h) ? 'своя картинка' : 'дефолт logo-flux.svg'],
];

const rows = [];
for (const [name, a, b, probe] of CASES) {
  try {
    const [ha, hb] = await Promise.all([render(a), render(b)]);
    const va = probe(ha), vb = probe(hb);
    rows.push({ name, va, vb, live: String(va) !== String(vb) });
  } catch (e) {
    rows.push({ name, va: 'ОШИБКА', vb: String(e.message), live: false });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('настройка', 26) + pad('значение A', 24) + pad('значение B', 24) + 'вердикт');
console.log('-'.repeat(86));
for (const r of rows) {
  console.log(pad(r.name, 26) + pad(r.va, 24) + pad(r.vb, 24) + (r.live ? 'работает ✓' : 'НЕ РЕАГИРУЕТ ✗'));
}
const dead = rows.filter((r) => !r.live);
console.log(`\nживых: ${rows.length - dead.length}/${rows.length}`);
if (dead.length) console.log('под вопросом: ' + dead.map((d) => d.name).join(', '));
