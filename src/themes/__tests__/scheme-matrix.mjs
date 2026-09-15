#!/usr/bin/env node
/**
 * СПЛОШНАЯ МАТРИЦА «тема × секция × мишень»: что из краски секции едет за
 * цветовой схемой мерчанта, а что прибито литералом.
 *
 * ЗАЧЕМ. Из 63 пунктов баг-репорта тестера ~25 — одна и та же жалоба разными
 * словами: «не применяется цветовая схема» к секции / кнопке / заголовку /
 * товару / контейнеру в такой-то теме. Точечный гард
 * `section-scheme-targets.spec.ts` закрывает 23 клетки по списку, набитому
 * руками, — и мы всегда отстаём от тестера на один круг. Здесь тот же
 * механизм разложен на ВСЮ площадь: 5 тем × 26 секций, а мишени внутри секции
 * находятся САМИ — обходом отрендеренной разметки.
 *
 * ЧТО СЧИТАЕТСЯ МИШЕНЬЮ. Узел, который КРАСИТ СЕБЯ САМ: у него есть
 * побеждающее объявление `background-color` или `color`. Узел, который цвет
 * наследует, мишенью не является и в знаменатель не идёт — красить его нечем,
 * и спрашивать с него нечего. Поэтому матрица не выдумывает клетки: их ровно
 * столько, сколько мест краски в разметке.
 *
 * ЧЕТЫРЕ УСЛОВИЯ (те же, что у section-scheme-targets — механика проверена):
 *   1) цвет обязан приходить ПЕРЕМЕННОЙ, а не литералом;
 *   2) это обязана быть роль схемы, которую ждёт мишень (для однозначных
 *      мишеней — фон секции и заголовок; для остальных роль пишется в отчёт,
 *      но не роняет);
 *   3) переменная обязана быть объявлена В МЕРЧАНТСКОЙ схеме (`.color-scheme-N`
 *      из `buildTokensCss`), а не только в `:root`;
 *   4) две разные схемы обязаны давать РАЗНЫЕ числа — иначе мишень замрёт.
 *
 * ПОЧЕМУ СХЕМЫ СИНТЕТИЧЕСКИЕ, А НЕ ТЕСТЕРСКИЕ. У магазина тестировщика
 * `--color-accent` одинаков во всех пяти схемах (#fa5109), и условие (4) на
 * нём даёт ЛОЖНОЕ «замерла» для всякого узла на акценте. Поэтому пара
 * `PROBE_A`/`PROBE_B` собрана так, что РАЗЛИЧАЮТСЯ ВСЕ ДЕВЯТЬ полей схемы, —
 * тогда «значение не изменилось» означает ровно одно: схема до узла не дошла.
 * Реальные схемы тестировщика остались в `scripts/qa/tester-schemes.json` и
 * работают контрольной сверкой в spec.
 *
 * КАК СЧИТАЕТСЯ ЦВЕТ. Теми же двумя артефактами, из которых его собирает
 * браузер, плюс каскад:
 *   1) `dist/theme-css/<тема>.css` — правила темы (утилиты Tailwind и обычные
 *      классы), `<style>` из самого рендера и атрибут `style=`;
 *   2) `buildTokensCss(схемы, тема)` — какое ЧИСЛО лежит в переменной.
 * Победитель выбирается по настоящему порядку каскада: `!important` →
 * вне `@layer` важнее, чем внутри → специфичность → позиция в файле.
 * Правила внутри `@media`/`@container` НЕ учитываются: мишень меряется в
 * базовом состоянии, `hover:`/`md:` — это не постоянная краска.
 *
 * ЦЕПОЧКА АЛИАСОВ. У vanilla порты написаны не на `--color-*`, а на своих
 * `--vanilla-*`, которые ремапятся правилом темы
 * (`[data-block="cart-body"][class*="color-scheme-"]{--vanilla-dark:rgb(var(--color-heading))}`).
 * Матрица идёт по цепочке до упора и УЧИТЫВАЕТ СЕЛЕКТОР ремапа: если он
 * привязан к `[data-block="cart-body"]`, то для узла другой секции ремап не
 * применяется и переменная остаётся мёртвой. Без этого vanilla целиком
 * считалась бы то зелёной, то красной — и то и другое неправдой.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 *
 * Использование:
 *   node scheme-matrix.mjs                     → карта покрытия (таблица)
 *   node scheme-matrix.mjs --json              → все клетки в JSON
 *   node scheme-matrix.mjs --bad               → только красные клетки, списком задач
 *   node scheme-matrix.mjs --theme flux        → одна тема
 *   node scheme-matrix.mjs --debt-out <файл>   → записать реестр долгов
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const require_ = createRequire(import.meta.url);

export const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'];

/**
 * Секции = объединение ключей `themes/<t>/sections.map.json` всех пяти тем
 * плюс `Catalog` (он живёт в `packages/theme-<t>/blocks`, а не в карте).
 * Список НЕ выдуман: он читается с диска (см. `discoverBlocks`). Темы, у
 * которой своего порта нет, рендерятся ТОЙ ЖЕ лестницей, что и витрина
 * (порт темы → пакет темы → theme-base), поэтому клетка есть у всех пяти.
 */
export function discoverBlocks() {
  const set = new Set(['Catalog']);
  for (const t of THEMES) {
    const map = JSON.parse(readFileSync(resolve(SITES_ROOT, 'themes', t, 'sections.map.json'), 'utf8'));
    for (const k of Object.keys(map)) set.add(k);
  }
  return [...set].sort();
}

/**
 * Пара схем, у которых РАЗЛИЧАЮТСЯ ВСЕ поля. Числа выбраны так, чтобы ни одно
 * не совпало ни внутри схемы, ни между схемами: тогда по итоговому значению
 * однозначно читается РОЛЬ, на которой висит мишень.
 */
export const PROBE_A = {
  id: 'scheme-1', name: '1',
  background: '#110000', surfaceBg: '#220000', heading: '#330000', text: '#440000', accent: '#550000',
  primaryButton: { background: '#660000', text: '#770000', border: '#880000' },
  secondaryButton: { background: '#990000', text: '#aa0000', border: '#bb0000' },
};
export const PROBE_B = {
  id: 'scheme-4', name: '4',
  background: '#001100', surfaceBg: '#002200', heading: '#003300', text: '#004400', accent: '#005500',
  primaryButton: { background: '#006600', text: '#007700', border: '#008800' },
  secondaryButton: { background: '#009900', text: '#00aa00', border: '#00bb00' },
};
export const SCHEME_A = '1';
export const SCHEME_B = '4';

/** Каталог-заглушка: без него flux/bloom/vanilla не резолвят товар. */
const IMAGES = [1, 2, 3, 4, 5, 6].map((i) => `/p1-${i}.png`);
export const CATALOG = {
  products: [1, 2, 3, 4].map((i) => ({
    id: `p${i}`, name: `Товар ${i}`, slug: `tovar-${i}`, handle: `tovar-${i}`,
    image: IMAGES[0], images: i === 1 ? IMAGES : [IMAGES[0]],
    price: 2500, basePrice: 2500, compareAtPrice: 3500,
    description: 'Описание товара.', collectionIds: ['col-1'],
  })),
  collections: [{ id: 'col-1', name: 'Хиты', slug: 'hity', image: IMAGES[0], images: [], productIds: ['p1', 'p2', 'p3', 'p4'] }],
  publications: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Разметка: живой рендер порта и обход узлов
// ─────────────────────────────────────────────────────────────────────────────

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const CATALOG_STUB = resolve(SITES_ROOT, 'scripts/qa/product-six-images-stub.mjs');

/** Живой рендер ВСЕХ секций темы одним процессом — та же лестница, что у витрины. */
export function renderTheme(theme, blocks, colorScheme = `scheme-${SCHEME_A}`) {
  const jobs = blocks.map((block) => ({
    block, cascade: true, live: true, catalog: CATALOG,
    props: { id: `${block}-1`, productId: 'p1', colorScheme, padding: { top: 40, bottom: 40 } },
  }));
  const out = execFileSync('node', ['--import', CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT, encoding: 'utf-8', maxBuffer: 1 << 28,
  });
  const rows = JSON.parse(out);
  const byBlock = {};
  for (const r of rows) byBlock[r.block] = r;
  return byBlock;
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** Содержимое этих тегов не разметка: внутри `<` не открывает узел. */
const RAW_TAGS = new Set(['script', 'style', 'template', 'noscript', 'svg']);

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

/**
 * Обход разметки. Возвращает плоский список узлов с предками и содержимое
 * `<style>` из самого рендера (Astro печатает scoped-правила прямо в блок).
 *
 * `<script>` СОЗНАТЕЛЬНО пропускается: внутри лежат клиентские шаблоны
 * карточек, которые собираются строкой в рантайме. Их краска — отдельный
 * класс дефектов, статикой он не меряется; честнее сказать об этом прямо,
 * чем делать вид, что покрыт.
 */
export function walk(html) {
  const nodes = [];
  const styles = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    const close = m[1];
    const tag = m[2].toLowerCase();
    const attrsRaw = m[3];
    const selfClose = m[4];
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    if (RAW_TAGS.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      if (tag === 'style' && end >= 0) styles.push(html.slice(re.lastIndex, end));
      if (end >= 0) re.lastIndex = end;
      continue;
    }
    const attrs = parseAttrs(attrsRaw);
    const node = {
      tag, attrs,
      classes: (attrs.class || '').split(/\s+/).filter(Boolean),
      ancestors: [...stack],
      offset: m.index,
    };
    nodes.push(node);
    if (!VOID_TAGS.has(tag) && !selfClose) stack.push(node);
  }
  return { nodes, styles };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Каскад: какое объявление побеждает на узле
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Разбор таблицы стилей в плоский список правил.
 *
 * Внутрь `@layer`/`@supports` заходим (это группировка, правила настоящие),
 * внутрь `@media`/`@container` — НЕТ: базовое состояние мишени меряется без
 * медиазапросов, иначе «фон кнопки» читался бы как мобильный вариант.
 * Имя слоя запоминается: правило ВНЕ слоя бьёт правило В слое — на этом уже
 * ловили дефект «unlayered CSS overrides utilities».
 */
export function collectRules(rawCss, source) {
  // Комментарии убираем ДО разбора: в `<style>` секции satin комментарий стоял
  // прямо перед селектором `[data-catalog-layout] .satin-button-light`, и в
  // селектор попадал весь его текст — правило переставало матчиться, а узел
  // получал краску предыдущего правила. Поймано сверкой с браузером.
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rules = [];
  let i = 0;
  const layerStack = [];
  let order = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    const close = css.indexOf('}', i);
    if (close >= 0 && close < brace) { // конец группирующего блока
      if (layerStack.length) layerStack.pop();
      i = close + 1;
      continue;
    }
    let prelude = css.slice(i, brace).trim();
    // `@layer theme, base, components, utilities;` — объявление порядка слоёв
    // без тела. Без этой обрезки оно приклеивалось к следующему селектору и
    // сбивало учёт слоёв на всём остатке файла.
    const semi = prelude.lastIndexOf(';');
    if (semi >= 0) prelude = prelude.slice(semi + 1).trim();
    if (prelude.startsWith('@')) {
      const at = /^@([a-z-]+)/i.exec(prelude)?.[1]?.toLowerCase();
      if (at === 'media' || at === 'container' || at === 'keyframes' || at === 'font-face' || at === 'property') {
        i = skipBlock(css, brace);            // целиком мимо
        continue;
      }
      layerStack.push(at === 'layer' ? prelude.slice(6).trim() : '');
      i = brace + 1;                           // заходим внутрь
      continue;
    }
    const end = skipBlock(css, brace);
    const body = css.slice(brace + 1, end - 1);
    if (!/[{}]/.test(body)) {
      for (const sel of splitSelectors(prelude)) {
        rules.push({ sel, body, layer: layerStack[layerStack.length - 1] || '', order: order++, source });
      }
    }
    i = end;
  }
  return rules;
}

function skipBlock(css, braceIdx) {
  let depth = 0;
  for (let i = braceIdx; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return css.length;
}

function splitSelectors(prelude) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of prelude) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Компаунд селектора (последняя часть) → части, которые надо найти на узле. */
function parseCompound(compound) {
  const need = { tag: null, ids: [], classes: [], attrs: [], pseudoState: false, rootOnly: false };
  let s = compound.trim();
  // Псевдоклассы состояния — не базовое состояние мишени.
  if (/:(hover|focus|active|visited|focus-within|focus-visible|checked|disabled|target)\b/.test(s)) need.pseudoState = true;
  // `:root` — это <html>. В нашей модели самый внешний узел — обёртка схемы.
  // Без этой оговорки `:root{--vanilla-dark:#0a0a0a}` «объявлялся» прямо на
  // узле и бил ремап ближайшего предка.
  if (/(^|[\s>])html\b/i.test(s) || /:root\b/.test(s)) need.rootOnly = true;
  s = s.replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
  const re = /([#.])([A-Za-z0-9_\\@\[\]().,%/:!*+~='"^$&{}|<>?-]+)|\[([^\]]+)\]|^([a-zA-Z][a-zA-Z0-9-]*)/g;
  let m;
  let first = true;
  while ((m = re.exec(s))) {
    if (m[1] === '#') need.ids.push(unescapeCss(m[2]));
    else if (m[1] === '.') need.classes.push(unescapeCss(m[2]));
    else if (m[3] != null) need.attrs.push(m[3]);
    else if (m[4] && first) need.tag = m[4].toLowerCase();
    first = false;
  }
  return need;
}

const unescapeCss = (s) => s.replace(/\\(.)/g, '$1');

function matchAttr(node, expr) {
  const m = /^\s*([-a-zA-Z0-9_:]+)\s*(?:([~^$*|]?=)\s*("([^"]*)"|'([^']*)'|[^\s\]]+))?/.exec(expr);
  if (!m) return false;
  const name = m[1].toLowerCase();
  if (!(name in node.attrs)) return false;
  if (!m[2]) return true;
  const want = (m[4] ?? m[5] ?? m[3] ?? '').replace(/^['"]|['"]$/g, '');
  const have = node.attrs[name];
  switch (m[2]) {
    case '=': return have === want;
    case '*=': return have.includes(want);
    case '^=': return have.startsWith(want);
    case '$=': return have.endsWith(want);
    case '~=': return have.split(/\s+/).includes(want);
    case '|=': return have === want || have.startsWith(`${want}-`);
    default: return false;
  }
}

function compoundMatches(node, need) {
  if (need.rootOnly) return (node.ancestors?.length ?? 0) === 0;
  if (need.tag && node.tag !== need.tag) return false;
  for (const id of need.ids) if (node.attrs.id !== id) return false;
  for (const c of need.classes) if (!node.classes.includes(c)) return false;
  for (const a of need.attrs) if (!matchAttr(node, a)) return false;
  return true;
}

/**
 * Матчинг селектора на узел. Комбинаторы упрощены до «предок где-то выше»:
 * `>` и ` ` считаются одинаково, `+`/`~` не поддержаны (правило с ними
 * пропускается — лучше недосчитать, чем приписать узлу чужую краску).
 * `:where()`/`:is()` разворачиваются в альтернативы.
 */
export function selectorMatches(node, sel) {
  // Псевдоэлемент красит НЕ узел, а свою коробку — мишенью он не является.
  if (/::/.test(sel)) return null;
  if (/:(?:before|after|first-line|first-letter|selection|marker|placeholder|backdrop|file-selector-button)\b/i.test(sel)) return null;
  // `:host` живёт только в shadow DOM. Tailwind печатает `:root, :host` одной
  // строкой; без этой отбраковки `:host` матчился на что угодно (после снятия
  // псевдокласса компаунд пустой) и перебивал `.color-scheme-N` — акцент
  // выглядел «прибитым», хотя в браузере он едет. Поймано сверкой.
  if (/:host\b/i.test(sel) || /::slotted/i.test(sel)) return null;
  // Структурные псевдоклассы по плоскому обходу не вычислить. Пропускаем
  // правило целиком: недосчитать честнее, чем приписать узлу чужую краску
  // (на `> span:last-child` каталога rose матрица ровно так и ошиблась).
  if (/:(?:nth-[a-z-]+\(|first-child|last-child|only-child|first-of-type|last-of-type|only-of-type|empty|not\(|has\(|lang\()/i.test(sel)) return null;
  if (/[+~]/.test(sel.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, ''))) return null;
  const expanded = expandIsWhere(sel);
  let best = null;
  for (const variant of expanded) {
    const res = matchOne(node, variant);
    // `0` — законная специфичность (`:root` после снятия псевдокласса даёт
    // пустой компаунд). Проверка на истинность вместо `!= null` роняла ВСЕ
    // объявления из `:root`, и палитра Tailwind выглядела «необъявленной».
    if (res != null && (best == null || res > best)) best = res;
  }
  return best;
}

function expandIsWhere(sel) {
  const m = /:(?:is|where)\(([^()]*)\)/.exec(sel);
  if (!m) return [sel];
  const out = [];
  for (const alt of splitSelectors(m[1])) {
    out.push(...expandIsWhere(sel.slice(0, m.index) + alt + sel.slice(m.index + m[0].length)));
  }
  return out;
}

function matchOne(node, sel) {
  const parts = sel.trim().split(/\s*>\s*|\s+/).filter(Boolean);
  const last = parseCompound(parts[parts.length - 1]);
  if (last.pseudoState) return null;             // hover/focus — не базовое состояние
  if (!compoundMatches(node, last)) return null;
  let idx = node.ancestors.length - 1;
  for (let p = parts.length - 2; p >= 0; p--) {
    const need = parseCompound(parts[p]);
    if (need.pseudoState) return null;
    let found = false;
    while (idx >= 0) {
      if (compoundMatches(node.ancestors[idx], need)) { found = true; idx--; break; }
      idx--;
    }
    if (!found) return null;
  }
  return specificity(sel);
}

function specificity(sel) {
  // Псевдоклассы (`:root`, `:not()` мы сюда не пускаем) весят как класс.
  const pseudoClasses = (sel.match(/(?<!:):[a-z-]+/gi) || []).length;
  const clean = sel.replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
  const ids = (clean.match(/#/g) || []).length;
  const cls = (clean.match(/(?<!\\)\./g) || []).length + (clean.match(/\[/g) || []).length + pseudoClasses;
  const tags = (clean.match(/(^|[\s>])[a-zA-Z]/g) || []).length;
  return ids * 10000 + cls * 100 + tags;
}

/**
 * Победившее объявление свойства на узле.
 * Порядок каскада: `!important` → вне `@layer` важнее слоя → специфичность →
 * позиция в файле. Атрибут `style=` считается специфичностью 1e6 (важнее
 * любого селектора), но проигрывает `!important` в таблице.
 */
export function winningDecl(node, prop, index) {
  const cands = [];
  const inline = node.attrs.style && new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(node.attrs.style);
  if (inline) {
    const raw = inline[1].trim();
    cands.push({ value: raw.replace(/\s*!important$/i, ''), important: /!important/i.test(raw), spec: 1e6, layer: '', order: 1e9, sel: 'style=', source: 'style=' });
  }
  for (const r of index.byProp.get(prop) ?? []) {
    const d = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`, 'i').exec(r.body);
    if (!d) continue;
    const spec = selectorMatches(node, r.sel);
    if (spec == null) continue;
    const raw = d[1].trim();
    cands.push({ value: raw.replace(/\s*!important$/i, '').trim(), important: /!important/i.test(raw), spec, layer: r.layer, order: r.order, sel: r.sel, source: r.source });
  }
  if (!cands.length) return null;
  cands.sort((a, b) =>
    Number(b.important) - Number(a.important) ||
    Number(!b.layer) - Number(!a.layer) ||
    b.spec - a.spec ||
    b.order - a.order);
  return cands[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Схема: подстановка переменных ровно так, как это делает браузер
// ─────────────────────────────────────────────────────────────────────────────

const { buildTokensCss } = require_(resolve(SITES_ROOT, 'dist/src/themes/tokens-css.js'));

/** Готовый tokens.css мерчантских схем — идёт в общий список правил наравне с CSS темы. */
export const tokensCssFor = (theme, schemes = [PROBE_A, PROBE_B]) =>
  buildTokensCss({ colorSchemes: schemes }, theme);

const NOT_A_PAINT = /^(transparent|currentcolor|inherit|initial|unset|revert|none|auto)$/i;

/** Индексы: правило попадает в корзину свойства/переменной, которую объявляет. */
export function indexRules(rules) {
  const byProp = new Map();
  const byVar = new Map();
  for (const r of rules) {
    for (const m of r.body.matchAll(/(?:^|[;{\s])(--[a-zA-Z0-9_-]+|background-color|color)\s*:/g)) {
      const key = m[1];
      const bag = key.startsWith('--') ? byVar : byProp;
      if (!bag.has(key)) bag.set(key, []);
      bag.get(key).push(r);
    }
  }
  return { byProp, byVar };
}

function splitTopComma(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Победившее объявление КАСТОМНОГО СВОЙСТВА для узла.
 *
 * Кастомные свойства НАСЛЕДУЮТСЯ: значение приходит от БЛИЖАЙШЕГО предка (или
 * с самого узла), который его объявил, а специфичность решает только внутри
 * одного элемента. Именно поэтому «поиск всегда схема 1» работает: правило
 * `[data-nt="rose-search"]{--color-button-bg:…}` стоит БЛИЖЕ узла, чем обёртка
 * `.color-scheme-4`, и бьёт её независимо от специфичности. Ранняя версия
 * матрицы искала токен сперва в схеме — и считала такие узлы «едущими», хотя
 * браузер показывал одно и то же число в обеих схемах.
 */
function winningVarDecl(node, token, index) {
  const rules = index.byVar.get(token);
  if (!rules) return null;
  const chainNodes = [node, ...[...node.ancestors].reverse()];
  for (let d = 0; d < chainNodes.length; d++) {
    const el = chainNodes[d];
    const probe = d === 0 ? node : { ...el, ancestors: node.ancestors.slice(0, node.ancestors.length - d) };
    const cands = [];
    for (const r of rules) {
      const decl = new RegExp(`(?:^|[;{\\s])${token}\\s*:\\s*([^;]+)`).exec(r.body);
      if (!decl) continue;
      const spec = selectorMatches(probe, r.sel);
      if (spec == null) continue;
      const raw = decl[1].trim();
      cands.push({ value: raw.replace(/\s*!important$/i, '').trim(), important: /!important/i.test(raw), spec, layer: r.layer, order: r.order, sel: r.sel });
    }
    if (!cands.length) continue;
    cands.sort((a, b) =>
      Number(b.important) - Number(a.important) ||
      Number(!b.layer) - Number(!a.layer) ||
      b.spec - a.spec ||
      b.order - a.order);
    return cands[0];
  }
  return null;
}

/**
 * Разворачивает `var(...)` до конца — ровно как браузер: подставляет значение
 * ближайшего объявления, при его отсутствии берёт фолбэк из самой `var()`.
 * Возвращает итоговую строку и след (какие токены прошли и каким селектором
 * получили значение) — по следу и ставится приговор.
 */
export function substituteVars(expr, node, index, trail = [], depth = 0) {
  if (depth > 12) return { value: expr, trail };
  let out = '';
  let i = 0;
  for (;;) {
    const j = expr.indexOf('var(', i);
    if (j < 0) { out += expr.slice(i); break; }
    out += expr.slice(i, j);
    let d = 0, k = j + 3;
    for (; k < expr.length; k++) {
      if (expr[k] === '(') d++;
      else if (expr[k] === ')') { d--; if (d === 0) break; }
    }
    const parts = splitTopComma(expr.slice(j + 4, k));
    const token = parts[0].trim();
    const fallback = parts.length > 1 ? parts.slice(1).join(',').trim() : null;
    const decl = winningVarDecl(node, token, index);
    trail.push({ token, sel: decl ? decl.sel : null, fallback: decl ? null : fallback });
    const repl = decl ? decl.value : fallback;
    out += repl == null ? `«${token}»` : substituteVars(repl, node, index, trail, depth + 1).value;
    i = k + 1;
  }
  return { value: out, trail };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Карта «маркер → ожидаемая роль схемы». ЕДИНСТВЕННОЕ, что задано руками.
// ─────────────────────────────────────────────────────────────────────────────

const BTN_BG = ['--color-button-bg', '--color-button-2-bg', '--color-button-secondary-bg', '--color-bg', '--color-heading', '--color-accent', '--color-surface', '--color-text'];
const BTN_TEXT = ['--color-button-text', '--color-button-2-text', '--color-button-secondary-text', '--color-bg', '--color-text', '--color-heading', '--color-button-bg', '--color-surface'];
const SURFACES = ['--color-bg', '--color-surface', '--color-bg-alt', '--color-checkout-surface', '--color-button-bg', '--color-button-2-bg', '--color-heading', '--color-accent', '--color-text', '--color-muted', '--color-input-bg'];
const INKS = ['--color-text', '--color-heading', '--color-muted', '--color-accent', '--color-bg', '--color-button-bg', '--color-button-text', '--color-surface'];

const attr = (n, name) => n.attrs[name];
const hasAttr = (n, name) => name in n.attrs;
const anyAttr = (n, re) => Object.keys(n.attrs).some((k) => re.test(k));
const cls = (n) => n.classes.join(' ');

/**
 * Мишени. Порядок важен: побеждает ПЕРВОЕ подходящее правило.
 * `strict` — роль проверяется жёстко (мишень однозначна). Для кнопок и текста
 * роль в отчёт пишется, но не роняет: тема вправе красить кнопку фоном секции
 * (инверсная кнопка flux) — это оформление, а не поломка схемы.
 */
export const TARGET_RULES = [
  {
    kind: 'root',
    match: (n) => n.ancestors.length <= 1,
    labels: { 'background-color': 'фон секции', color: 'основной текст секции' },
    expect: { 'background-color': ['--color-bg', '--color-surface', '--color-bg-alt', '--color-checkout-surface'], color: INKS },
    strict: { 'background-color': true, color: false },
  },
  {
    kind: 'field',
    match: (n) => ['input', 'textarea', 'select'].includes(n.tag),
    labels: { 'background-color': 'фон поля ввода', color: 'текст поля ввода' },
    expect: { 'background-color': SURFACES, color: INKS },
    strict: { 'background-color': false, color: false },
  },
  {
    kind: 'button',
    match: (n, paint) =>
      n.tag === 'button' ||
      attr(n, 'role') === 'button' ||
      hasAttr(n, 'data-add-to-cart') ||
      hasAttr(n, 'data-action') ||
      hasAttr(n, 'data-card-cta') ||
      hasAttr(n, 'data-cfg-buy') ||
      (n.tag === 'a' && (/button|btn|cta/i.test(attr(n, 'data-puck-subsection-field') || '') || /\bbtn\b|button/i.test(cls(n)) || !!paint['background-color'])),
    labels: { 'background-color': 'фон кнопки', color: 'текст кнопки' },
    expect: { 'background-color': BTN_BG, color: BTN_TEXT },
    strict: { 'background-color': false, color: false },
  },
  {
    kind: 'heading',
    match: (n) => /^h[1-6]$/.test(n.tag) || /-title$/.test(attr(n, 'id') || '') || hasAttr(n, 'data-cfg-name'),
    labels: { color: 'заголовок', 'background-color': 'фон заголовка' },
    expect: { color: ['--color-heading', '--color-text'], 'background-color': SURFACES },
    strict: { color: true, 'background-color': false },
  },
  {
    kind: 'price',
    match: (n) => anyAttr(n, /price/i) || /price|цена/i.test(cls(n)),
    labels: { color: 'цена / подпись', 'background-color': 'фон цены' },
    expect: { color: INKS, 'background-color': SURFACES },
    strict: { color: false, 'background-color': false },
  },
  {
    kind: 'link',
    match: (n) => n.tag === 'a',
    labels: { color: 'ссылка', 'background-color': 'фон ссылки' },
    expect: { color: INKS, 'background-color': SURFACES },
    strict: { color: false, 'background-color': false },
  },
  {
    kind: 'text',
    match: () => true,
    labels: { color: 'текст', 'background-color': 'фон контейнера' },
    expect: { color: INKS, 'background-color': SURFACES },
    strict: { color: false, 'background-color': false },
  },
];

/**
 * ЗАКОННЫЕ ЛИТЕРАЛЫ. Каждый — с объяснением, почему схема здесь не при чём.
 * Образец — ALLOWED в cart-page-scheme.spec.ts. Список должен оставаться
 * коротким: всё, что сюда попало, матрица больше не сторожит.
 */
export const ALLOWED = [
  // ВАЖНО: правило, которое не покрывает ни одной клетки, отсюда убирается.
  // Мёртвое исключение ничего не сторожит, но однажды молча пропустит
  // настоящий дефект — «зелёный гард» без клеток не доказывает ничего.
  {
    id: 'form-status',
    why: 'статус отправки формы (зелёный успех / красная ошибка) — семафор, а не краска секции: цвет обязан читаться при любой схеме',
    test: (c) => c.node.attrs.role === 'status' || Object.keys(c.node.attrs).some((k) => /status|error|aria-live/.test(k)),
  },
  {
    id: 'error-token',
    why: '--color-error — служебный токен ошибки, схемой не управляется по устройству генератора (tokens-css: errorColor)',
    test: (c) => c.chain.includes('--color-error'),
  },
  {
    id: 'hero-overlay-veil',
    why: 'слой «Затемнение» героя — вуаль МЕЖДУ фото (z-0) и текстом (z-10). По устройству packages/theme-base/styles/hero-over-photo.css цвет текста над фото берёт СХЕМА, а читаемость держит именно затемнение. Осветлять вуаль вместе со схемой — значит отнять у неё смысл: на светлой схеме текст пропадёт на фото. Мерчант управляет ПРОЗРАЧНОСТЬЮ слоя (ползунок 0–100), а не его цветом',
    test: (c) =>
      c.block === 'Hero' &&
      c.prop === 'background-color' &&
      /(^|\s)pointer-events-none(\s|$)/.test(c.nodeClasses) &&
      /(^|\s)absolute(\s|$)/.test(c.nodeClasses) &&
      /(^|\s)inset-0(\s|$)/.test(c.nodeClasses) &&
      /(^|\s)z-\[1\](\s|$)/.test(c.nodeClasses),
  },
  {
    id: 'search-always-scheme-1',
    why: 'панель поиска в шапке ПРИБИТА к схеме 1 решением владельца 15.09 («Всегда Схема 1, жёстко») — правило form[role="search"] в tokens-css, сторож src/themes/__tests__/search-always-scheme-1.spec.ts. Краска не должна ехать за схемой шапки: это не дефект, а требование',
    test: (c) => c.verdict === 'pinned' && /form\[role="search"\]/.test(c.pinnedBy ?? ''),
  },
];

export function allowedFor(cell) {
  return ALLOWED.find((a) => { try { return a.test(cell); } catch { return false; } }) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Где это написано: файл:строка для строки отчёта
// ─────────────────────────────────────────────────────────────────────────────

const SRC_EXT = /\.(astro|ts|tsx|js|mjs|css)$/;
const srcCache = new Map();

function listFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) listFiles(p, acc);
    else if (SRC_EXT.test(e)) acc.push(p);
  }
  return acc;
}

const sectionsMap = (theme) => {
  const key = `map:${theme}`;
  if (!srcCache.has(key)) {
    srcCache.set(key, JSON.parse(readFileSync(resolve(SITES_ROOT, 'themes', theme, 'sections.map.json'), 'utf8')));
  }
  return srcCache.get(key);
};

/**
 * Порядок поиска = лестница витрины. Сначала ИМЕННО ТОТ порт, который рисует
 * эту секцию у этой темы, потом пакет темы, потом theme-base, и только потом
 * всё остальное. Без этого `bg-[rgb(var(--color-bg…))]` находился в первом
 * попавшемся файле темы, и строка отчёта указывала не туда.
 */
function sourceRoots(theme, block) {
  const own = sectionsMap(theme)[block];
  const roots = [];
  if (own) roots.push(resolve(SITES_ROOT, 'themes', theme, own));
  roots.push(
    resolve(SITES_ROOT, 'packages', `theme-${theme}`, 'blocks', block),
    resolve(SITES_ROOT, 'packages', 'theme-base', 'blocks', block),
    resolve(SITES_ROOT, 'themes', theme, 'src'),
    resolve(SITES_ROOT, 'packages', `theme-${theme}`),
    resolve(SITES_ROOT, 'packages', 'theme-base'),
  );
  return roots;
}

/** Первое место в исходниках, где встречается нужная строка. */
export function locate(theme, needle, block = '') {
  if (!needle) return null;
  const key = `files:${theme}:${block}`;
  let files = srcCache.get(key);
  if (!files) {
    files = [];
    for (const r of sourceRoots(theme, block)) {
      if (SRC_EXT.test(r)) { files.push(r); continue; }
      for (const f of listFiles(r)) if (!files.includes(f)) files.push(f);
    }
    srcCache.set(key, files);
  }
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const idx = text.indexOf(needle);
    if (idx < 0) continue;
    const line = text.slice(0, idx).split('\n').length;
    return `${f.replace(`${SITES_ROOT}/`, '')}:${line}`;
  }
  return null;
}

/** Из селектора-победителя делаем строку, которую можно найти в исходнике. */
function needleOf(win) {
  if (!win) return null;
  if (win.sel === 'style=') return win.value.slice(0, 40);
  const m = /^\.(.+)$/.exec(win.sel.trim());
  if (!m) return win.sel.trim();
  return unescapeCss(m[1]).replace(/:.*$/, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Сборка матрицы
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Синтетическая обёртка схемы. На живой витрине `page-generator` оборачивает
 * каждый блок в `<div class="color-scheme-N" data-block-scheme="N">` — без неё
 * правила `.color-scheme-N` (а это и есть носители токенов схемы) не
 * применялись бы вовсе.
 */
/** Сквозной порядок правил: позиция в общем потоке таблиц, а не внутри файла. */
const withOrder = (rules) => rules.map((r, i) => ({ ...r, order: i }));

const schemeWrapper = (id) => ({
  tag: 'div',
  attrs: { class: `color-scheme-${id}`, 'data-block-scheme': id },
  classes: [`color-scheme-${id}`],
  ancestors: [],
  offset: -1,
});

/**
 * Тот же узел, но «во второй схеме». Часть портов печатает `color-scheme-N` на
 * СВОЁМ корне (vanilla CartBody, rose AccountSection) — эта метка бьёт обёртку,
 * поэтому её тоже надо перевести на вторую схему, иначе половина тем мерилась
 * бы дважды в одной и той же схеме.
 */
function inSchemeB(node) {
  const swap = (el) => {
    if (!el.classes.some((c) => c === `color-scheme-${SCHEME_A}`)) return el;
    const classes = el.classes.map((c) => (c === `color-scheme-${SCHEME_A}` ? `color-scheme-${SCHEME_B}` : c));
    return { ...el, classes, attrs: { ...el.attrs, class: classes.join(' ') } };
  };
  return { ...swap(node), ancestors: node.ancestors.map(swap) };
}

/** Числа сравниваем без оглядки на пробелы и регистр. */
const norm = (v) => String(v).replace(/\s+/g, ' ').trim().toLowerCase();

export function buildMatrix({ themes = THEMES, blocks = discoverBlocks() } = {}) {
  const cells = [];
  const renderFacts = [];
  for (const theme of themes) {
    const themeCss = readFileSync(resolve(SITES_ROOT, 'dist/theme-css', `${theme}.css`), 'utf8');
    const tokensCss = tokensCssFor(theme);
    // Сквозная нумерация: tokens.css подключается ПОСЛЕ CSS темы, значит при
    // равной специфичности его правила выигрывают. Без пересчёта `order`
    // каждый файл начинал с нуля, и порядок между файлами терялся.
    const baseRules = withOrder([
      ...collectRules(themeCss, `dist/theme-css/${theme}.css`),
      ...collectRules(tokensCss, 'tokens.css (схемы магазина)'),
    ]);
    const schemeRoles = new Set();
    for (const r of collectRules(tokensCss, 'tokens')) {
      if (!/^\.color-scheme-\d+$/.test(r.sel.trim())) continue;
      for (const m of r.body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) schemeRoles.add(m[1]);
    }
    const rendered = renderTheme(theme, blocks);
    const wrapA = schemeWrapper(SCHEME_A);
    const wrapB = schemeWrapper(SCHEME_B);

    for (const block of blocks) {
      const row = rendered[block];
      if (!row || !row.html) {
        renderFacts.push({ theme, block, ok: false, note: row?.missing ? 'секции нет' : (row?.error ?? row?.pipelineError ?? 'нет html') });
        continue;
      }
      const { nodes, styles } = walk(row.html);
      const rules = withOrder([...baseRules, ...styles.flatMap((st) => collectRules(st, `<style> блока ${block}`))]);
      const index = indexRules(rules);
      let targets = 0;
      for (const raw of nodes) {
        const nodeA = { ...raw, ancestors: [wrapA, ...raw.ancestors] };
        const nodeB = inSchemeB({ ...raw, ancestors: [wrapB, ...raw.ancestors] });
        const paint = {};
        for (const prop of ['background-color', 'color']) {
          const win = winningDecl(nodeA, prop, index);
          if (win && !NOT_A_PAINT.test(win.value.trim())) paint[prop] = win;
        }
        if (!paint['background-color'] && !paint.color) continue;
        const rule = TARGET_RULES.find((r) => r.match(nodeA, paint));
        for (const prop of ['background-color', 'color']) {
          const winA = paint[prop];
          if (!winA) continue;
          const label = rule.labels[prop];
          if (!label) continue;
          targets++;
          const resA = substituteVars(winA.value, nodeA, index);
          const winB = winningDecl(nodeB, prop, index) ?? winA;
          const resB = substituteVars(winB.value, nodeB, index);
          const trail = resA.trail;
          const roleEntry = [...trail].reverse().find((t) => schemeRoles.has(t.token));
          const cell = {
            theme, block, kind: rule.kind, target: label, prop,
            cls: needleOf(winA) ?? winA.sel,
            selector: winA.sel,
            value: winA.value,
            nodeClasses: raw.classes.join(' '),
            node: raw,
            chain: trail.map((t) => t.token),
            trail,
            role: roleEntry?.token ?? (trail.length ? trail[trail.length - 1].token : null),
            hasSchemeRole: !!roleEntry,
            roleFromScheme: roleEntry ? /^\.color-scheme-\d+$/.test((roleEntry.sel ?? '').trim()) : false,
            pinnedBy: roleEntry && !/^\.color-scheme-\d+$/.test((roleEntry.sel ?? '').trim()) ? (roleEntry.sel ?? 'фолбэк var()') : null,
            undeclared: trail.filter((t) => !t.sel && t.fallback == null).map((t) => t.token),
            a: resA.value.trim(),
            b: resB.value.trim(),
            moves: norm(resA.value) !== norm(resB.value),
          };
          cell.verdict = verdictOf(cell, rule);
          cells.push(cell);
        }
      }
      renderFacts.push({ theme, block, ok: true, nodes: nodes.length, targets });
    }
  }
  return dedupe(cells, renderFacts);
}

/**
 * Приговор клетке. Единственный признак «зелени» — цвет узла РЕАЛЬНО меняется
 * при смене схемы. Всё остальное объясняет, ПОЧЕМУ он не поменялся:
 *
 *   ok        — краска едет за схемой;
 *   hex       — литерал прямо в разметке/классе (`text-[#000000]`, `style=`);
 *   palette   — палитра Tailwind (`bg-white`, `text-black`): переменная есть,
 *               схемы в ней нет и не будет;
 *   theme-var — переменная ТЕМЫ, объявленная в `:root` и схемой не двигаемая
 *               (`--vanilla-green-deep`, `--color-text-muted`, `--satin-black`);
 *   pinned    — роль схемы в цепочке ЕСТЬ, но её значение перебито правилом
 *               ближе к узлу (поиск в шапке прибит к схеме 1) — краска
 *               замерла, хотя написана «правильно»;
 *   frozen    — роль схемы дала одно и то же число в обеих схемах;
 *   role      — мишень однозначна, а красится чужим полем схемы.
 */
function verdictOf(cell, rule) {
  if (cell.moves) {
    if (rule.strict?.[cell.prop] && cell.role && !rule.expect[cell.prop].includes(cell.role)) return 'role';
    return 'ok';
  }
  if (cell.undeclared.length) return 'undeclared';
  if (!cell.chain.length) return 'hex';
  const last = cell.chain[cell.chain.length - 1];
  // Роль схемы определяется ТОЧНЫМ совпадением с набором токенов
  // `.color-scheme-N`, а не префиксом: `--color-text-muted` начинается на
  // `--color-text`, но ролью схемы не является и в схеме не объявлен вовсе.
  if (cell.hasSchemeRole) return cell.roleFromScheme ? 'frozen' : 'pinned';
  if (/^--color-(white|black)$/.test(last) || /^--(tw|default)-/.test(last)) return 'palette';
  return 'theme-var';
}

/** Одинаковые клетки (та же краска в том же месте) схлопываются: 4 карточки — одна строка. */
function dedupe(cells, renderFacts) {
  const byKey = new Map();
  for (const c of cells) {
    const key = `${c.theme}|${c.block}|${c.target}|${c.prop}|${c.cls}|${c.value}`;
    const prev = byKey.get(key);
    if (prev) { prev.count++; continue; }
    byKey.set(key, { ...c, count: 1 });
  }
  const list = [...byKey.values()];
  for (const c of list) {
    if (c.verdict === 'ok') continue;
    const allow = allowedFor(c);
    if (allow) { c.verdict = 'allowed'; c.allowed = allow.id; c.why = allow.why; }
  }
  return { cells: list, renderFacts };
}

/** Ключ клетки для реестра долгов — стабилен между прогонами. */
export const cellKey = (c) => `${c.theme}|${c.block}|${c.target}|${c.prop}|${c.cls}`;

/** Строка отчёта: тема · секция · мишень · что пришло вместо схемы · файл:строка. */
export function reportLine(c) {
  const got = {
    hex: `литерал ${c.value}`,
    palette: `палитра Tailwind: ${c.chain.join(' → ')} = ${c.a}`,
    'theme-var': `переменная темы ${c.chain.join(' → ')} = ${c.a} (схема её не двигает)`,
    pinned: `роль ${c.role} прибита правилом «${c.pinnedBy}» — обе схемы дают ${c.a}`,
    frozen: `роль ${c.role} даёт одно число в обеих схемах: ${c.a}`,
    undeclared: `переменная ${c.undeclared.join(', ')} не объявлена НИГДЕ — цвет невалиден, узел наследует чужой`,
    role: `роль ${c.role} — мишень ждёт другую (${c.a})`,
  }[c.verdict] ?? c.verdict;
  const where = locate(c.theme, c.cls, c.block) ?? '—';
  return `${c.theme} · ${c.block} · ${c.target} · ${got} · ${where}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. CLI
// ─────────────────────────────────────────────────────────────────────────────

const CLASS_TITLES = {
  hex: 'ЛИТЕРАЛ В РАЗМЕТКЕ — цвет вписан числом, схема до него не достаёт',
  palette: 'ПАЛИТРА TAILWIND (bg-white / text-black) — переменная есть, схемы в ней нет',
  'theme-var': 'ПЕРЕМЕННАЯ ТЕМЫ — объявлена в :root и схемой не двигается',
  undeclared: 'ПЕРЕМЕННОЙ НЕТ ВООБЩЕ — объявления нет ни в схеме, ни в теме: цвет невалиден',
  pinned: 'РОЛЬ СХЕМЫ ПЕРЕБИТА БЛИЖЕ К УЗЛУ — написано верно, а краска замерла',
  frozen: 'РОЛЬ СХЕМЫ НЕ ДВИГАЕТСЯ — обе схемы дают одно число',
  role: 'НЕ ТА РОЛЬ — мишень однозначна, а красится чужим полем схемы',
};

function coverage(cells, renderFacts) {
  const green = cells.filter((c) => c.verdict === 'ok');
  const white = cells.filter((c) => c.verdict === 'allowed');
  const red = cells.filter((c) => !['ok', 'allowed'].includes(c.verdict));
  return { green, white, red };
}

function printCoverage(matrix) {
  const { cells, renderFacts } = matrix;
  const { green, white, red } = coverage(cells, renderFacts);
  const themes = [...new Set(cells.map((c) => c.theme))];
  const blocks = [...new Set(cells.map((c) => c.block))];
  console.log('══ КАРТА ПОКРЫТИЯ: мишени секций против цветовой схемы ══');
  console.log('');
  console.log(`Поле:      ${themes.length} тем × ${blocks.length} секций = ${renderFacts.filter((r) => r.ok).length} отрендеренных клеток «тема × секция»`);
  console.log(`Мишеней:   ${cells.length} (узлов, которые красят себя сами; повторы схлопнуты)`);
  console.log(`  зелёных: ${green.length}`);
  console.log(`  красных: ${red.length}`);
  console.log(`  в белом списке: ${white.length}`);
  console.log('');
  const notRendered = renderFacts.filter((r) => !r.ok);
  if (notRendered.length) {
    console.log(`Не отрендерилось: ${notRendered.length} — ${notRendered.map((r) => `${r.theme}/${r.block} (${r.note})`).join(', ')}`);
    console.log('');
  }
  console.log('── по темам ─────────────────────────────────────────────');
  console.log('тема      мишеней  зелёных  красных  белый список   % зелени');
  for (const t of themes) {
    const own = cells.filter((c) => c.theme === t);
    const g = own.filter((c) => c.verdict === 'ok').length;
    const w = own.filter((c) => c.verdict === 'allowed').length;
    const r = own.length - g - w;
    console.log(`${t.padEnd(9)} ${String(own.length).padStart(6)} ${String(g).padStart(8)} ${String(r).padStart(8)} ${String(w).padStart(13)}   ${String(Math.round((g / own.length) * 100)).padStart(4)}%`);
  }
  console.log('');
  console.log('── по классам дефекта ───────────────────────────────────');
  for (const k of Object.keys(CLASS_TITLES)) {
    const n = red.filter((c) => c.verdict === k).length;
    if (n) console.log(`${String(n).padStart(4)}  ${CLASS_TITLES[k]}`);
  }
  console.log('');
  console.log('── по мишеням ───────────────────────────────────────────');
  const targets = [...new Set(cells.map((c) => c.target))];
  console.log('мишень                       всего  зелёных  красных');
  for (const tg of targets.sort()) {
    const own = cells.filter((c) => c.target === tg);
    const g = own.filter((c) => c.verdict === 'ok').length;
    const w = own.filter((c) => c.verdict === 'allowed').length;
    console.log(`${tg.padEnd(28)} ${String(own.length).padStart(5)} ${String(g).padStart(8)} ${String(own.length - g - w).padStart(8)}`);
  }
  console.log('');
  console.log('── секции, где красных больше всего ─────────────────────');
  const byBlock = {};
  for (const c of red) byBlock[`${c.theme}/${c.block}`] = (byBlock[`${c.theme}/${c.block}`] ?? 0) + 1;
  for (const [k, v] of Object.entries(byBlock).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`${String(v).padStart(4)}  ${k}`);
  }
}

function printBad(matrix) {
  const red = matrix.cells.filter((c) => !['ok', 'allowed'].includes(c.verdict));
  for (const k of Object.keys(CLASS_TITLES)) {
    const own = red.filter((c) => c.verdict === k);
    if (!own.length) continue;
    console.log(`\n### ${CLASS_TITLES[k]} — ${own.length}`);
    for (const c of own.sort((a, b) => cellKey(a).localeCompare(cellKey(b)))) console.log(`  ${reportLine(c)}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const themes = arg('--theme') ? [arg('--theme')] : THEMES;
  const blocks = arg('--block') ? [arg('--block')] : discoverBlocks();
  const matrix = buildMatrix({ themes, blocks });
  if (argv.includes('--json')) {
    const slim = matrix.cells.map(({ node, trail, ...rest }) => ({ ...rest, where: locate(rest.theme, rest.cls, rest.block) }));
    process.stdout.write(JSON.stringify({ cells: slim, renderFacts: matrix.renderFacts }, null, 2));
    return;
  }
  const debtOut = arg('--debt-out');
  if (debtOut) {
    const red = matrix.cells.filter((c) => !['ok', 'allowed'].includes(c.verdict));
    const entries = red.map((c) => ({
      key: cellKey(c), verdict: c.verdict, value: c.value,
      role: c.role, chain: c.chain, where: locate(c.theme, c.cls, c.block),
    })).sort((a, b) => a.key.localeCompare(b.key));
    writeFileSync(debtOut, `${JSON.stringify({ generated: 'node src/themes/__tests__/scheme-matrix.mjs --debt-out <файл>', total: entries.length, entries }, null, 2)}\n`);
    console.log(`долгов записано: ${entries.length} → ${debtOut}`);
    return;
  }
  if (argv.includes('--guard-json')) {
    // Всё, что нужно гарду, одним куском: jest (CJS) не грузит этот ESM-модуль
    // в своём процессе — ровно та же причина, по которой рядом живут
    // panel-canon.mjs и render-theme-sections.mjs.
    process.stdout.write(JSON.stringify({
      renderFacts: matrix.renderFacts,
      allowed: ALLOWED.map((a) => ({ id: a.id, why: a.why })),
      cells: matrix.cells.map((c) => ({
        key: cellKey(c), theme: c.theme, block: c.block, target: c.target, prop: c.prop,
        cls: c.cls, verdict: c.verdict, allowedBy: c.allowed ?? null, role: c.role,
        a: c.a, b: c.b, count: c.count, line: reportLine(c),
      })),
    }));
    return;
  }
  if (argv.includes('--bad')) { printBad(matrix); return; }
  printCoverage(matrix);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
