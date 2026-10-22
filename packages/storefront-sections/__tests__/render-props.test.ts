import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate } from '../src/compile';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// menus, theme и shop в Astro.props (блок 1 «Секций и SDK», часть 4, Р1-4-3, Р1-4-4, Р1-4-6): меню — деревом в
// settings по id настройки, theme — настройки темы, shop — данные магазина; в запросе старой формы их нет — пустые.
const HEADER = `---
const { settings, theme, shop } = Astro.props;
---
<nav>
  <a href="/">{shop.name}</a>
  <ul>{settings.menu.items.map((item) => <li><a href={item.url}>{item.label}</a>{item.items.length}</li>)}</ul>
  <p>{theme['social-telegram']}|{shop.contacts.phone}|{String(shop.payments.online)}</p>
</nav>`;
const EMPTY = `---
const { theme, shop } = Astro.props;
---
<p>[{shop.name}][{theme.x}][{shop.contacts.fields.length}][{String(shop.payments.online)}]</p>`;
const OPTIONS = {
  richtext: { section: new Set<string>(), block: new Set<string>() },
  blocks: false,
  uses: ['theme', 'shop'] as const,
};
const MENU = {
  title: 'Главное меню',
  items: [{ label: 'Каталог', url: '/catalog', items: [{ label: 'Шарфы', url: '/catalog/scarves', items: [] }] }],
};
const SHOP = {
  name: 'Шарфы',
  contacts: { phone: '+7 999 000-00-00', email: '', fields: [] },
  policies: [],
  payments: { online: true },
};

const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

async function requestOf(template: string, section: string) {
  const checked = await checkTemplate(template, OPTIONS);
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  return {
    section,
    hash: sha256(Buffer.from(checked.render, 'utf8')),
    module: checked.render,
    settings: { menu: 'main' },
  };
}

describe('menus, theme и shop в процессе рендера', () => {
  it('меню — деревом вместо id, настройки темы и данные магазина — в Astro.props', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const request = await requestOf(HEADER, 'shop:header');
    const theme = { 'social-telegram': 'https://t.me/scarves' };
    const html = await renderer.render({ ...request, menus: { menu: MENU }, theme, shop: SHOP });
    expect(html).toContain('<a href="/">Шарфы</a>');
    expect(html).toContain('<li><a href="/catalog">Каталог</a>1</li>');
    expect(html).toContain('https://t.me/scarves|+7 999 000-00-00|true');
  }, 30_000);

  it('запрос без theme и shop — пустые настройки темы и пустой магазин', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const html = await renderer.render(await requestOf(EMPTY, 'shop:footer'));
    expect(html).toContain('<p>[][][0][false]</p>');
  }, 30_000);
});
