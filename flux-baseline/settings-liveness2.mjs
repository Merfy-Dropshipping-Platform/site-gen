#!/usr/bin/env node
/**
 * Матрица «живости» настроек v2 — по всем секциям flux.
 *
 * Отличие от v1: у каждого блока РЕАЛИСТИЧНАЯ база пропов. v1 слал пустые
 * пропы — Hero без картинки уходил в плейсхолдер-ветку, где «Позиция» и не
 * должна работать, и матрица объявляла живую настройку мёртвой. Ложные трупы:
 * Hero.position, Hero.overlay, Product.layout.
 *
 * colorScheme не пробуем на фрагменте: схему вешает ОБЁРТКА компоновщика на
 * странице (проверено вживую: смена blockDefaults красит секции) — фрагмент
 * этого не видит, сигнал ложный.
 *
 *   node flux-baseline/settings-liveness2.mjs [siteId]
 */
const SITE = process.argv[2] || '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const API = 'http://localhost:3110/api';
const IMG = 'https://minio.merfy.ru/product-images/f92e309e-009c-4e15-85cc-87a59a439dea.png?probe=1';
const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

/** Реалистичная база пропов на блок — чтобы условные ветки были активны. */
const BASE = {
  Hero: {
    backgroundImages: { url1: IMG },
    heading: { text: 'Проба заголовка' },
    text: { content: 'Проба текста' },
    primaryButton: { text: 'Кнопка', link: '/catalog' },
  },
  Collections: { heading: { text: 'Коллекции' }, subtitle: 'Подзаголовок пробы' },
  Product: { productId: PRODUCT_ID },
  PopularProducts: { heading: { text: 'Товары' }, text: 'Описание пробы' },
  Gallery: {
    text: { content: 'Текст пробы' },
    items: [
      { id: 'g1', type: 'image', url: IMG },
      { id: 'g2', type: 'image', url: IMG },
      { id: 'g3', type: 'image', url: IMG },
    ],
  },
  ImageWithText: {
    image: { url: IMG },
    heading: 'Проба',
    text: 'Текст пробы',
    button: { text: 'Кнопка', href: '/catalog' },
  },
  Footer: {
    newsletter: { enabled: 'true' },
    navigationColumn: { title: 'Навигация', links: [{ label: 'Каталог', href: '/catalog' }] },
    informationColumn: { title: 'Инфо', links: [{ label: 'Возврат', href: '/legal/returns' }] },
    socialColumn: { title: 'Соцсети', email: 'a@b.ru', socialLinks: [{ platform: 'telegram', href: 'https://t.me/x' }] },
    copyright: { companyName: 'Flux', showYear: 'true' },
  },
  PromoBanner: { text: 'Акция недели', link: '/catalog' },
};

const BLOCKS = Object.keys(BASE);

const render = async (blockType, props) => {
  const r = await fetch(`${API}/sites/${SITE}/preview/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blockType,
      themeId: 'flux',
      props: { id: `${blockType}-probe`, siteId: SITE, ...BASE[blockType], ...props },
    }),
  });
  return r.ok ? r.text() : `ОШИБКА ${r.status}`;
};

function probeValues(field) {
  const t = field?.type;
  if (t === 'select' || t === 'radio') {
    const o = (field.options || []).map((x) => x.value);
    return o.length >= 2 ? [o[0], o[o.length - 1]] : null;
  }
  if (t === 'toggle') return ['true', 'false'];
  if (t === 'slider') {
    const min = field.min ?? 0, max = field.max ?? 100;
    return min !== max ? [min, max] : null;
  }
  if (t === 'alignment') return ['left', 'right'];
  return null;
}

const norm = (h) =>
  String(h)
    .replace(/astro-[a-z0-9]+/gi, 'astro-X')
    .replace(/data-astro-[^\s">]+/g, '')
    .replace(/\s+/g, ' ');

const cfg = await (await fetch(`${API}/themes/flux/puck-config`)).json();

const jobs = [];
for (const block of BLOCKS) {
  const fields = cfg.components?.[block]?.fields ?? {};
  for (const [name, field] of Object.entries(fields)) {
    if (field?.type === 'hidden') continue;
    if (name === 'colorScheme' || name === 'containerColorScheme' || name === 'copyrightColorScheme' || name === 'menuColorScheme') continue;
    const vals = probeValues(field);
    if (!vals) continue;
    jobs.push({ block, name, label: field.label || name, vals });
  }
}

console.log(`проб: ${jobs.length}\n`);
const results = [];
const POOL = 6;
for (let i = 0; i < jobs.length; i += POOL) {
  const chunk = jobs.slice(i, i + POOL);
  const rs = await Promise.all(chunk.map(async (j) => {
    const [a, b] = await Promise.all([
      render(j.block, { [j.name]: j.vals[0] }),
      render(j.block, { [j.name]: j.vals[1] }),
    ]);
    const err = String(a).startsWith('ОШИБКА') || String(b).startsWith('ОШИБКА');
    return { ...j, live: !err && norm(a) !== norm(b), err };
  }));
  results.push(...rs);
  process.stdout.write(`… ${Math.min(i + POOL, jobs.length)}/${jobs.length}\n`);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('секция', 16) + pad('настройка', 30) + 'вердикт');
console.log('-'.repeat(60));
const dead = [];
for (const r of results) {
  const v = r.err ? 'ОШИБКА рендера' : r.live ? 'живая' : 'НЕ РЕАГИРУЕТ';
  if (!r.live) dead.push(r);
  console.log(pad(r.block, 16) + pad(r.label, 30) + v);
}
console.log(`\nживых: ${results.length - dead.length}/${results.length}`);
if (dead.length) {
  console.log('кандидаты в мёртвые (проверить руками):');
  dead.forEach((d) => console.log(`  ${d.block}.${d.name} «${d.label}» [${d.vals[0]} ↔ ${d.vals[1]}]`));
}
