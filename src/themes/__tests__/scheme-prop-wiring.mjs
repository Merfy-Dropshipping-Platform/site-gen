#!/usr/bin/env node
/**
 * ДЫРА В МАТРИЦЕ (найдена саботажем 17.09, задача b84): `scheme-matrix.mjs`
 * рендерит КАЖДУЮ секцию РОВНО ОДИН РАЗ с зашитым пропом
 * `colorScheme = scheme-${SCHEME_A}` (см. `renderTheme()` в scheme-matrix.mjs,
 * единственный вызов — buildMatrix():984) и дальше проверяет только то, что
 * КРАСКА следует за содержимым CSS-правила `.color-scheme-N`, подменяя это
 * содержимое между PROBE_A/PROBE_B. Она НИКОГДА не меняет сам проп на живой
 * секции — то есть путь «мерчант выбрал схему в панели → проп долетел до
 * секции → на КОРНЕ секции встал СООТВЕТСТВУЮЩИЙ класс `color-scheme-N`» не
 * проверяется вообще. Секция может игнорировать свой `colorScheme`-проп и
 * всегда печатать один и тот же класс — матрица это не заметит, потому что
 * никогда не просит другой.
 *
 * ЭТОТ ФАЙЛ проверяет ИМЕННО путь «проп → класс на корне», отдельно от
 * «класс → цвет» (тем занимается scheme-matrix.mjs).
 *
 * ОБЪЁМ. Только секции, которые ПЕЧАТАЮТ СВОЙ СОБСТВЕННЫЙ класс
 * `color-scheme-N` НА СОБСТВЕННОМ КОРНЕ безусловно (то есть при изолированном
 * рендере блока, БЕЗ композитора страницы) — это «страничные» секции
 * (Footer/LoginSection/OrdersSection/AccountSection/WishlistSection —
 * список читается из STANDALONE_SECTIONS, он же исходный список жалоб
 * тестировщика). У ОБЫЧНЫХ контентных блоков (Hero, MultiRows, Newsletter,
 * …) свой класс схемы на корне НЕ печатают — класс им ставит СНАРУЖИ
 * `composeV2Page`/`v2-page-composer.ts` оборачивающим `<div
 * class="color-scheme-N" data-block-scheme="N">` при сборке страницы. Их
 * прогон через ЭТОТ файл (проверено вручную 17.09: 44 ложных «красных» из
 * 50 при прогоне по всем 31 блокам с полем `colorScheme`) — это не дефект
 * блоков, а неверный уровень проверки: композитор здесь не участвует.
 * Проверка композитора — отдельная задача, здесь не покрыта (см. TODO внизу).
 *
 * Требует сборки: pnpm build && pnpm build:theme-sections:all
 *
 * Использование:
 *   node scheme-prop-wiring.mjs                 → сводка
 *   node scheme-prop-wiring.mjs --bad            → только красные, списком задач
 *   node scheme-prop-wiring.mjs --json           → все клетки в JSON
 *   node scheme-prop-wiring.mjs --guard-json      → { cells, renderFacts } для jest
 */
import { THEMES, renderTheme, locate } from './scheme-matrix.mjs';

// Список = ровно те «страничные» секции, у которых собственный проп
// colorScheme читается прямо в компоненте и печатается на СВОЁМ корне
// (`schemeClass`/`footerSchemeClass`, «класс ставим ВСЕГДА» — см. комментарии
// в AccountSection.astro/WishlistSection.astro/Footer.astro). Это ровно тот
// список секций, на который жаловался тестировщик 15–16.09 и владелец 17.09
// (баги №6/№9): Подвал, Вход, Заказы, Личный кабинет, Избранное.
export const STANDALONE_SECTIONS = [
  'Footer',
  'LoginSection',
  'OrdersSection',
  'AccountSection',
  'WishlistSection',
];

// Две схемы, ЗАВЕДОМО разные по номеру (важен только номер в классе, не
// цвет — цветом занимается scheme-matrix.mjs).
const PROP_A = 'scheme-2';
const PROP_B = 'scheme-5';
const NUM_A = '2';
const NUM_B = '5';

function rootClassesOf(html) {
  const m = /<[a-zA-Z][a-zA-Z0-9:-]*\s[^>]*\bclass="([^"]*)"[^>]*>/.exec(html);
  return m ? m[1] : '';
}

export function buildWiringMatrix({ themes = THEMES, blocks = STANDALONE_SECTIONS } = {}) {
  const cells = [];
  const renderFacts = [];
  for (const theme of themes) {
    const renderedA = renderTheme(theme, blocks, PROP_A);
    const renderedB = renderTheme(theme, blocks, PROP_B);
    for (const block of blocks) {
      const rowA = renderedA[block];
      const rowB = renderedB[block];
      if (!rowA?.html || !rowB?.html) {
        renderFacts.push({
          theme, block, ok: false,
          note: rowA?.missing || rowB?.missing ? 'секции нет' : (rowA?.error ?? rowB?.error ?? 'нет html'),
        });
        continue;
      }
      renderFacts.push({ theme, block, ok: true });
      const clsA = rootClassesOf(rowA.html);
      const clsB = rootClassesOf(rowB.html);
      const hasA = new RegExp(`(^|\\s)color-scheme-${NUM_A}(\\s|$)`).test(clsA);
      const hasB = new RegExp(`(^|\\s)color-scheme-${NUM_B}(\\s|$)`).test(clsB);
      const verdict = hasA && hasB ? 'ok' : 'red';
      const where = verdict === 'red' ? locate(theme, 'colorScheme', block) : null;
      cells.push({
        theme, block, verdict,
        propA: PROP_A, propB: PROP_B,
        rootClassA: clsA, rootClassB: clsB,
        hasA, hasB,
        where,
        line: verdict === 'red'
          ? `${theme} · ${block} · проп colorScheme не долетает до класса на корне (${PROP_A}→"${clsA || '(нет класса)'}", ${PROP_B}→"${clsB || '(нет класса)'}")${where ? ` · ${where}` : ''}`
          : null,
      });
    }
  }
  return { cells, renderFacts };
}

function main() {
  const args = process.argv.slice(2);
  const { cells, renderFacts } = buildWiringMatrix();
  if (args.includes('--json')) {
    console.log(JSON.stringify({ cells, renderFacts }, null, 2));
    return;
  }
  if (args.includes('--guard-json')) {
    console.log(JSON.stringify({ cells, renderFacts }));
    return;
  }
  const bad = cells.filter((c) => c.verdict === 'red');
  if (args.includes('--bad')) {
    for (const c of bad) console.log(c.line);
    process.exitCode = bad.length ? 1 : 0;
    return;
  }
  console.log(`═ ПРОВЕРКА «проп colorScheme → класс на корне» (страничные секции): ${cells.length} клеток ═`);
  console.log(`  зелёных: ${cells.length - bad.length}`);
  console.log(`  красных: ${bad.length}`);
  if (bad.length) {
    console.log('');
    for (const c of bad) console.log('  ✗ ' + c.line);
  }
  const failedRender = renderFacts.filter((r) => !r.ok);
  if (failedRender.length) {
    console.log(`\n  не отрендерилось: ${failedRender.length}`);
    for (const r of failedRender) console.log(`    ${r.theme}/${r.block} — ${r.note}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

// TODO (вне объёма b84, честно не покрыто): у ОБЫЧНЫХ контентных секций
// (Hero, MultiRows, Newsletter, Collections, …) прокидку `colorScheme` в
// класс-обёртку делает `composeV2Page`/`v2-page-composer.ts` НА УРОВНЕ
// СТРАНИЦЫ, не сам блок. Нужен отдельный сторож на composeV2Page(pageData) —
// собрать фейковую страницу с двумя разными colorScheme на секции и
// проверить обёртывающий `<div data-block-scheme="N">`.
