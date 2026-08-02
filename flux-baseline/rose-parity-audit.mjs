#!/usr/bin/env node
/**
 * Аудит паритета Flux vs Rose — «работает ли настройка секции ТАК ЖЕ, как у
 * Rose» (не «выглядит идентично» — визуал каждой темы = её собственная
 * вёрстка by design; проверяем ЛОГИКУ/МЕХАНИЗМ настройки).
 *
 * Метод: puckConfig (fields) ОБЩИЙ для всех тем (theme-base) — значит у
 * Rose и Flux для одного блока НАБОР настроек идентичен. Для каждой
 * структурной настройки (select/radio/toggle/alignment/slider — не текст,
 * не массивы, не colorScheme) рендерим ОБА порта через `/preview/block` с
 * ОДИНАКОВЫМИ пропами (кроме проверяемого поля, которое меняем на 2 разных
 * значения) и сравниваем ДВА сигнала:
 *
 *   1. REACTS-BOTH: меняется ли HTML блока между вариантами A/B У ОБЕИХ тем.
 *      Если Rose реагирует, а Flux — нет (или наоборот) → настройка «работает
 *      в одной теме и молча ничего не делает в другой» — САМЫЙ важный класс
 *      несоответствия «Flux работает не как Rose», и он полностью
 *      автоматизируем без знания конкретной вёрстки.
 *   2. Для полей с семантикой позиционирования (alignment/position-like —
 *      определяем по названию поля и содержимому options) — ДОПОЛНИТЕЛЬНО
 *      сравниваем КАТЕГОРИИ классов (items-, justify-, text- варианты),
 *      которые формула вернула, а не полный HTML — это ловит «реагируют оба, но
 *      результат зеркальный/неправильный» (тоньше чем просто REACTS-BOTH).
 *
 * ⚠️ ГРАНИЦЫ (см. предысторию — settings-liveness3.mjs шапка, три ловушки,
 * найденные в этой же сессии; здесь актуальны первая и вторая):
 *  - Требует, чтобы `dist/theme-sections/<theme>/manifest.json` СУЩЕСТВОВАЛ
 *    для ОБЕИХ тем — иначе `/preview/block` тихо падает на generic
 *    theme-base компонент вместо реального порта темы, и сравнение
 *    сравнивает НЕ то, что рендерит живой сайт. Проверка внизу перед стартом.
 *  - НЕ проверяет client-side reveal-invisibility баг (тот класс закрыт
 *    отдельно, settings-liveness3.mjs, там нужен реальный браузер+GSAP —
 *    здесь голый серверный HTML, специально для сравнения ЛОГИКИ, а не
 *    видимости).
 *  - «Реагируют оба одинаково по категории классов» — не гарантия
 *    ПИКСЕЛЬНОГО совпадения (это и не цель: вёрстка своя у каждой темы).
 *    Гарантия того, что МЕХАНИЗМ (какое значение → какая категория
 *    поведения) — тот же.
 *  - Поля с типом aiText/text (заголовок/текст) — реагируют почти всегда
 *    тривиально (текст просто печатается) — включены с низким приоритетом
 *    внимания, основная ценность — в select/radio/toggle/alignment/slider.
 *
 *   node flux-baseline/rose-parity-audit.mjs [siteId]
 */
import { execSync } from 'node:child_process';

const SITE_ID = process.argv[2] || '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const API = 'http://localhost:3110/api';
const IMG = 'https://minio.merfy.ru/product-images/f92e309e-009c-4e15-85cc-87a59a439dea.png';
const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

// Проверка перед стартом — обе темы должны быть реально скомпилированы в
// theme-sections, иначе сравнение бессмысленно (см. шапку).
for (const t of ['flux', 'rose']) {
  try {
    execSync(`test -f "dist/theme-sections/${t}/manifest.json"`);
  } catch {
    console.error(`ОСТАНОВЛЕНО: dist/theme-sections/${t}/manifest.json не найден.`);
    console.error(`Прогони сначала: node scripts/compile-theme-sections.mjs ${t}`);
    process.exit(1);
  }
}

// Реалистичная база пропов на блок — активирует условные ветки (не пустое
// состояние). Общая для обеих тем: поля из общего puckConfig, форму пропов
// (nested/flat) обе темы поддерживают через fallback-цепочки нормализации.
const BASE = {
  Hero: {
    backgroundImages: { url1: IMG, url2: IMG },
    title: 'Проба заголовка', subtitle: 'Проба текста',
    cta: { text: 'Кнопка', href: '/catalog' },
  },
  Collections: { heading: 'Коллекции', subtitle: 'Подзаголовок пробы' },
  Product: { productId: PRODUCT_ID },
  PopularProducts: { heading: 'Товары', text: 'Описание пробы' },
  Gallery: {
    text: 'Текст пробы',
    items: [
      { id: 'g1', type: 'image', url: IMG },
      { id: 'g2', type: 'image', url: IMG },
      { id: 'g3', type: 'image', url: IMG },
    ],
  },
  ImageWithText: { image: { url: IMG }, heading: 'Проба', text: 'Текст пробы', button: { text: 'Кнопка', href: '/catalog' } },
  Header: {},
  Footer: {
    newsletter: { enabled: 'true' },
    navigationColumn: { title: 'Навигация', links: [{ label: 'Каталог', href: '/catalog' }] },
    informationColumn: { title: 'Инфо', links: [{ label: 'Возврат', href: '/legal/returns' }] },
    socialColumn: { title: 'Соцсети', email: 'a@b.ru', socialLinks: [{ platform: 'telegram', href: 'https://t.me/x' }] },
    copyright: { companyName: 'Проба', showYear: 'true' },
  },
  PromoBanner: { text: 'Акция недели', link: { href: '/catalog', text: 'Смотреть' } },
  MainText: { heading: 'Проба заголовка', text: 'Проба текста', button: { text: 'Кнопка', link: '/catalog' } },
  MultiColumns: {
    heading: 'Колонки',
    columns: [
      { id: 'c1', title: 'Раз', text: 'Текст раз', image: IMG },
      { id: 'c2', title: 'Два', text: 'Текст два', image: IMG },
    ],
  },
  MultiRows: {
    heading: 'Ряды',
    rows: [{ id: 'r1', title: 'Ряд один', description: 'Текст', image: IMG, button: { text: 'Кнопка', link: '/catalog' } }],
  },
  Slideshow: {
    slides: [
      { id: 's1', imageUrl: IMG, heading: { text: 'Слайд 1' }, text: { content: 'Текст 1' }, buttonText: 'Кнопка' },
      { id: 's2', imageUrl: IMG, heading: { text: 'Слайд 2' }, text: { content: 'Текст 2' }, buttonText: 'Кнопка' },
    ],
  },
  Newsletter: { heading: 'Рассылка', text: 'Подпишитесь', placeholder: 'e-mail', buttonText: 'Ок' },
  ContactForm: { heading: 'Свяжитесь с нами' },
  CollapsibleSection: {
    heading: 'Вопросы',
    sections: [{ id: 'q1', heading: 'Вопрос 1', content: 'Ответ 1' }, { id: 'q2', heading: 'Вопрос 2', content: 'Ответ 2' }],
  },
  Publications: { heading: 'Блог' },
  Video: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', heading: 'Видео', subheading: 'Подзаголовок' },
  Catalog: { categoryTitle: 'Каталог', categorySubtitle: 'Все товары' },
};
const BLOCKS = Object.keys(BASE);

const SKIP_FIELDS = new Set(['colorScheme', 'containerColorScheme', 'copyrightColorScheme', 'menuColorScheme']);

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
  if (t === 'aiText' || t === 'text') return ['Проба А', 'Проба Б'];
  return null;
}

const norm = (h) =>
  String(h).replace(/astro-[a-z0-9]+/gi, 'astro-X').replace(/data-astro-[^\s">]+/g, '').replace(/\s+/g, ' ');

async function render(theme, blockType, props) {
  const r = await fetch(`${API}/sites/${SITE_ID}/preview/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockType, themeId: theme, props: { id: `${blockType}-probe`, siteId: SITE_ID, ...BASE[blockType], ...props } }),
  });
  return r.ok ? r.text() : `ОШИБКА ${r.status}`;
}

// Категория alignment-классов — для полей с явной позиционной семантикой
// (по имени поля или его типу) сравниваем не только «поменялось ли», но и
// СКОЛЬКО категорий (items-*/justify-*/text-*) отличаются — обе темы должны
// давать РАЗНОЕ значение категории между A и B, если поле про позицию/выравнивание.
function alignmentCategories(html) {
  const items = [...html.matchAll(/\bitems-(start|end|center)\b/g)].map((m) => m[0]);
  const justify = [...html.matchAll(/\bjustify-(start|end|center)\b/g)].map((m) => m[0]);
  const textAlign = [...html.matchAll(/\btext-(left|right|center)\b/g)].map((m) => m[0]);
  return JSON.stringify({ items: items.sort(), justify: justify.sort(), textAlign: textAlign.sort() });
}
const POSITION_LIKE = /position|align|justify/i;

const cfgFlux = await (await fetch(`${API}/themes/flux/puck-config`)).json();
const cfgRose = await (await fetch(`${API}/themes/rose/puck-config`)).json();

const jobs = [];
for (const block of BLOCKS) {
  const fFields = cfgFlux.components?.[block]?.fields ?? {};
  const rFields = cfgRose.components?.[block]?.fields ?? {};
  for (const [name, field] of Object.entries(fFields)) {
    if (field?.type === 'hidden' || SKIP_FIELDS.has(name)) continue;
    if (!rFields[name]) {
      jobs.push({ block, name, label: field.label || name, missingInRose: true });
      continue;
    }
    const vals = probeValues(field);
    if (!vals) continue;
    jobs.push({ block, name, label: field.label || name, vals, isPositionLike: POSITION_LIKE.test(name) || POSITION_LIKE.test(field.label || '') });
  }
}
console.log(`проб: ${jobs.filter((j) => j.vals).length} (+ ${jobs.filter((j) => j.missingInRose).length} полей отсутствуют в Rose)\n`);

const results = [];
const POOL = 5;
const testable = jobs.filter((j) => j.vals);
for (let i = 0; i < testable.length; i += POOL) {
  const chunk = testable.slice(i, i + POOL);
  const rs = await Promise.all(chunk.map(async (j) => {
    const [fluxA, fluxB, roseA, roseB] = await Promise.all([
      render('flux', j.block, { [j.name]: j.vals[0] }),
      render('flux', j.block, { [j.name]: j.vals[1] }),
      render('rose', j.block, { [j.name]: j.vals[0] }),
      render('rose', j.block, { [j.name]: j.vals[1] }),
    ]);
    const err = [fluxA, fluxB, roseA, roseB].some((h) => String(h).startsWith('ОШИБКА'));
    if (err) return { ...j, err, errDetail: [fluxA, fluxB, roseA, roseB].find((h) => String(h).startsWith('ОШИБКА')) };
    const fluxReacts = norm(fluxA) !== norm(fluxB);
    const roseReacts = norm(roseA) !== norm(roseB);
    let alignMismatch = false;
    if (j.isPositionLike && fluxReacts && roseReacts) {
      const fluxCatsDiffer = alignmentCategories(fluxA) !== alignmentCategories(fluxB);
      const roseCatsDiffer = alignmentCategories(roseA) !== alignmentCategories(roseB);
      // Обе реагируют HTML-ом, но категория выравнивания у Flux не меняется,
      // хотя у Rose меняется (или наоборот) — механизм расходится тоньше,
      // чем «работает/не работает».
      alignMismatch = fluxCatsDiffer !== roseCatsDiffer;
    }
    return { ...j, err: false, fluxReacts, roseReacts, alignMismatch };
  }));
  results.push(...rs);
  process.stdout.write(`… ${Math.min(i + POOL, testable.length)}/${testable.length}\n`);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('блок', 16) + pad('настройка', 30) + 'вердикт');
console.log('-'.repeat(70));
const flagged = [];
for (const r of results) {
  let verdict;
  if (r.err) verdict = 'ОШИБКА рендера';
  else if (r.fluxReacts && !r.roseReacts) verdict = '⚠️ работает во Flux, НЕ в Rose (неожиданно — возможно Rose тоже сломан или поле лишнее)';
  else if (!r.fluxReacts && r.roseReacts) verdict = '❌ работает в Rose, НЕ во Flux';
  else if (!r.fluxReacts && !r.roseReacts) verdict = 'не реагирует НИ В ОДНОЙ теме (проверить пропы/условия)';
  else if (r.alignMismatch) verdict = '⚠️ обе реагируют, но категория выравнивания расходится';
  else verdict = '✓ паритет';
  if (verdict !== '✓ паритет') flagged.push({ ...r, verdict });
  console.log(pad(r.block, 16) + pad(r.label, 30) + verdict);
}
for (const j of jobs.filter((j) => j.missingInRose)) {
  console.log(pad(j.block, 16) + pad(j.label, 30) + '(поле есть во Flux, нет в Rose — не с чем сравнивать)');
}

console.log(`\nпаритет: ${results.length - flagged.length}/${results.length}`);
if (flagged.length) {
  console.log('\nтребуют внимания:');
  flagged.forEach((f) => console.log(`  ${f.block}.${f.name} «${f.label}» — ${f.verdict}${f.errDetail ? ' :: ' + String(f.errDetail).slice(0, 100) : ''}`));
}
process.exit(flagged.some((f) => f.verdict.includes('❌')) ? 1 : 0);
