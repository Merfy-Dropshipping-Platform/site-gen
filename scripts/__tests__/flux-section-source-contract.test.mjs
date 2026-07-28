// Render-contract для оживлённых секций темы Flux (spec 111-flux-constructor-live-markup, Task 2).
//
// В отличие от flux-home-contract.test.mjs (Task 1, проверяет seed/wiring —
// packages/theme-flux/pages/home.json + themes/flux/sections.map.json +
// SOURCE.lock.json), этот тест читает КАЖДЫЙ из 9 исходников секций напрямую
// (themes/flux/src/components/**/*.astro) и проверяет структурные маркеры из
// матрицы prop-маркеров плана (Task 2, Step 1):
//   - файл существует;
//   - читает Astro.props;
//   - использует корневой data-puck-component-id={id};
//   - не содержит React/TSX;
//   - для полей-«массивов» (editable arrays из puckConfig конкретного блока)
//     присутствуют data-puck-subsection-field="<field>" маркеры;
//   - нет ссылок на отсутствующие /placeholders/* ассеты
//     (источник ассетов — packages/theme-base/public/placeholders, копируется
//     на каждую тему build-пайплайном assemble-from-packages);
//   - <script>-блоки не содержат жёсткого (непустого) site/shop id литерала
//     (canon-паттерн — `const shopId = "";` пропатчивается build.service
//     ПОСЛЕ сборки; пустая строка — не хардкод).
//
// Это RED-тест (Task 2): на момент написания
//   - FeaturedProduct.astro ЕЩЁ НЕ СУЩЕСТВУЕТ (Task 5 создаст его) → все
//     подпункты Product падают на "файл существует";
//   - Puk.astro (текущий источник ImageWithText по SOURCE.lock.json/матрице
//     плана) — секция "Основной текст"/CTA верстальщиков, БЕЗ image/imagePosition
//     пропсов контракта ImageWithText → падает на этих двух проп-точках
//     (Task 7 канонизирует).
// Другие блоки (Header/Hero/Collections/PopularProducts/Gallery/Footer/
// PromoBanner) уже оживлены предыдущими фазами и, по факту чтения исходников
// на момент написания теста, проходят контракт — это не требование ЭТОЙ
// задачи (Task 4 отдельно владеет полным соответствием Hero/Collections), а
// побочный результат более ранней работы. Тест не должен провалиться по вине
// бага в helper-регулярках; если это случится — регулярку нужно чинить, а не
// production-файл (см. Task 2 бриф, Step 2).
//
// ───────── PromoBanner: разрешение неоднозначности файла ─────────
// SOURCE.lock.json (Task 0) указывает канон-источник PromoBanner на
// `src/components/header/PromoBanner.astro`. Однако themes/flux/sections.map.json
// (реальная проводка сборки) сопоставляет тип "PromoBanner" на
// `src/components/sections/PromoBanner.astro` — СОВСЕМ ДРУГОЙ файл. Проверено
// чтением обоих:
//   - header/PromoBanner.astro — простой демо-компонент (Props {text,link,
//     linkText}), НЕ читает id, НЕ имеет data-puck-component-id, нигде не
//     импортируется как секция (Header.astro использует DS NtPromoBanner для
//     статик-режима, не этот файл). Это orphan-компонент.
//   - sections/PromoBanner.astro — ПОЛНАЯ канон-секция (Astro.props, id,
//     data-puck-component-id, data-puck-subsection-field="text", text/link.text/
//     link.href + legacy linkText/linkUrl), РЕАЛЬНО сопоставлена в sections.map.json.
// Брифа Task 2 file-list также ограничивает область теста глобом
// `src/components/sections/*.astro` — что однозначно указывает на
// sections/PromoBanner.astro. Тест ниже проверяет ИМЕННО этот файл.
// Несостыковка SOURCE.lock.json/sections.map.json НЕ разрешена этой задачей
// (архитектурное решение вне полномочий Task 2) — см. task-2-report.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const THEME_ROOT = path.resolve(__dirname, '../../themes/flux');
// Общий источник /placeholders/* ассетов для всех тем (assemble-from-packages
// копирует их по скану .astro на каждую тему на build) — themes/flux/public/
// НЕ содержит своей копии placeholders/, поэтому валидируем против общего источника.
const PLACEHOLDERS_DIR = path.resolve(
  __dirname,
  '../../packages/theme-base/public/placeholders',
);

// ───────── низкоуровневые помощники ─────────

async function readFileOrNull(absPath) {
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

function findScriptBlocks(content) {
  const blocks = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(content))) blocks.push(m[1]);
  return blocks;
}

// React/TSX-конструкции, которым не место в Astro-секции (renderer Astro-only,
// правило @merfy/theme-base/CLAUDE.md "Forbidden: .tsx files next to blocks").
function findReactTsxViolations(content) {
  const violations = [];
  if (/from\s+["'][^"']*\.tsx["']/.test(content)) violations.push('импорт .tsx-файла');
  if (/from\s+["']react(?:-dom)?["']/.test(content)) violations.push('импорт из "react"');
  if (/\bimport\s+React\b/.test(content)) violations.push('import React');
  if (/\bclassName=/.test(content)) violations.push('className= (React) вместо class= (Astro)');
  return violations;
}

// Статические ссылки на /placeholders/* — только внутри обычных ' " кавычек
// (JS-строка или HTML-атрибут). Шаблонные литералы с интерполяцией
// (`/placeholders/sweater-${color}.svg`, Popular.astro) сознательно НЕ
// разбираются статически — набор реальных путей там нельзя проверить без
// исполнения кода; ложных срабатываний это не создаёт (backtick ≠ '/").
function findStaticPlaceholderRefs(content) {
  const refs = new Set();
  const re = /["'](\/placeholders\/[^"'`]+)["']/g;
  let m;
  while ((m = re.exec(content))) refs.add(m[1]);
  return [...refs];
}

async function findMissingPlaceholders(content) {
  const refs = findStaticPlaceholderRefs(content);
  const missing = [];
  for (const ref of refs) {
    const name = ref.replace(/^\/placeholders\//, '');
    try {
      await fs.access(path.join(PLACEHOLDERS_DIR, name));
    } catch {
      missing.push(ref);
    }
  }
  return missing;
}

// Хардкод site/shop id ТОЛЬКО внутри <script>-блоков, ТОЛЬКО непустой строковый
// литерал. `const shopId = "";` (Footer.astro) — canon-паттерн впрыска
// build.service (patchShopIdInDist ПОСЛЕ сборки заменяет пустую строку на
// реальный id) — это НЕ хардкод, пустое значение проходит проверку.
function findHardcodedShopIds(content) {
  const violations = [];
  const re = /\b(shopId|siteId|store_id)\b\s*[:=]\s*["'`]([^"'`]+)["'`]/g;
  for (const block of findScriptBlocks(content)) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(block))) {
      const [, name, value] = m;
      if (value.trim().length > 0) violations.push(`${name}="${value}"`);
    }
  }
  return violations;
}

function hasAny(content, patterns) {
  return patterns.some((re) => re.test(content));
}

// ───────── корневой data-puck-component-id: якорь к СОБСТВЕННОМУ корню секции ─────────
//
// Наивная проверка `/data-puck-component-id=\{/.test(content)` (использовавшаяся
// раньше) — это whole-file поиск, не привязанный к корневому элементу секции.
// Она держится сегодня для всех 9 файлов (либо ровно одно вхождение, либо два —
// оба на взаимоисключающих корневых ветках тернарника вида
// `isEmpty ? <section ...marker> : <section ...marker>`, см. Hero/PromoBanner),
// но structurally не защищает от БУДУЩЕГО ложного прохождения: секция может
// рендерить ДОЧЕРНИЙ Puck-блок с СОБСТВЕННЫМ `data-puck-component-id` на его
// корне, при этом собственный корень секции маркера не имеет — сегодняшняя
// naive-проверка такое пропустит.
//
// Ниже — минимальный tag-aware сканер: находит только те открывающие/
// самозакрывающиеся теги, что стоят на "верхнем уровне" (глубина 0) шаблона
// (после закрытия frontmatter-забора `---`), т.е. сам корень секции и, при
// тернарнике, каждую взаимоисключающую корневую ветку — и проверяет маркер
// ТОЛЬКО среди их собственных открывающих тегов (не throughout всего файла).
// Вложенные дочерние блоки (глубина > 0) сознательно исключены из
// рассмотрения — их собственный `data-puck-component-id` не защитывается как
// корневой маркер СЕКЦИИ.

function getTemplateBody(content) {
  const lines = content.split('\n');
  let firstFence = -1;
  let secondFence = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (firstFence === -1) firstFence = i;
      else {
        secondFence = i;
        break;
      }
    }
  }
  if (firstFence === -1 || secondFence === -1) return content;
  return lines.slice(secondFence + 1).join('\n');
}

// Убираем то, что может испортить наивный посимвольный проход по тегам:
// содержимое <script>/<style> (там `<`/`>` — операторы JS, не теги) и
// комментарии (HTML `<!-- -->` и JS/JSX `/* ... */` — в них попадаются
// примеры тегов вроде "Сырой <img>" в человеческом комментарии, Hero.astro).
function stripNonStructural(body) {
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// Разбирает шаблон на поток тегов { type: 'open'|'close'|'self', name, tagText }.
// tagText для open/self — полный текст открывающего тега от `<Name` до его
// СОБСТВЕННОГО закрывающего `>`/`/>`, с учётом строк ('"`) и вложенных `{}`
// (`data-x={cond ? "a>" : "b"}`, шаблонные литералы с `${...}`), чтобы `>`
// внутри JS-выражения атрибута не спутать с концом тега.
function extractTags(body) {
  const tags = [];
  const len = body.length;
  let i = 0;
  while (i < len) {
    if (body[i] !== '<') {
      i++;
      continue;
    }
    const closingMatch = /^<\/([A-Za-z][\w.]*)\s*>/.exec(body.slice(i));
    if (closingMatch) {
      tags.push({ type: 'close', name: closingMatch[1] });
      i += closingMatch[0].length;
      continue;
    }
    const openStart = /^<([A-Za-z][\w.]*)/.exec(body.slice(i));
    if (!openStart) {
      i++;
      continue;
    }
    let j = i + openStart[0].length;
    let braceDepth = 0;
    let inString = null;
    let selfClosing = false;
    while (j < len) {
      const ch = body[j];
      if (inString) {
        if (ch === inString && body[j - 1] !== '\\') inString = null;
        j++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        j++;
        continue;
      }
      if (ch === '{') {
        braceDepth++;
        j++;
        continue;
      }
      if (ch === '}') {
        braceDepth--;
        j++;
        continue;
      }
      if (braceDepth === 0 && ch === '/' && body[j + 1] === '>') {
        selfClosing = true;
        j += 2;
        break;
      }
      if (braceDepth === 0 && ch === '>') {
        j++;
        break;
      }
      j++;
    }
    tags.push({
      type: selfClosing ? 'self' : 'open',
      name: openStart[1],
      tagText: body.slice(i, j),
    });
    i = j;
  }
  return tags;
}

// Все теги, встреченные на глубине 0 (т.е. сам корень секции, а при
// тернарнике — обе взаимоисключающие корневые ветки; вложенные дочерние
// элементы/блоки — глубина > 0, не попадают в выборку).
function findRootLevelTags(content) {
  const body = stripNonStructural(getTemplateBody(content));
  const tags = extractTags(body);
  let depth = 0;
  const candidates = [];
  for (const tag of tags) {
    if (tag.type === 'close') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) candidates.push(tag);
    if (tag.type === 'open') depth++;
  }
  return candidates;
}

function hasRootPuckMarker(content) {
  return findRootLevelTags(content).some((tag) =>
    tag.tagText.includes('data-puck-component-id={'),
  );
}

// ───────── матрица секций (Task 2 brief, Step 1) ─────────
//
// `subsectionFields` — ТОЛЬКО поля, которые в theme-base *.puckConfig.ts
// объявлены как редактируемый массив (`type: 'array'`) или как объект,
// НЕПОСРЕДСТВЕННО оборачивающий такой массив (Footer columns/socialColumn
// оборачивают `links`/`socialLinks`) — именно они требуют
// data-puck-subsection-field="<field>" маркеров по брифу ("для редактируемых
// массивов"). Скалярные/композитные (не массив) поля из матрицы (heading,
// text, button, backgroundImages, siteTitle, ...) проверяются ТОЛЬКО как
// проп-точки (ссылка в Astro.props), без требования subsection-маркера —
// так короче написано в брифе, и это не мешает найти обе документированные
// RED-причины (отсутствующий FeaturedProduct.astro, Puk.astro без
// image/imagePosition).
const BLOCKS = [
  {
    type: 'PromoBanner',
    file: 'src/components/sections/PromoBanner.astro',
    props: [
      { key: 'text', patterns: [/p\.text\b/] },
      { key: 'linkText', patterns: [/p\.link\??\.\s*text/, /p\.linkText\b/] },
      { key: 'linkHref', patterns: [/p\.link\??\.\s*href/, /p\.linkUrl\b/, /p\.linkHref\b/] },
    ],
    subsectionFields: [],
  },
  {
    type: 'Header',
    file: 'src/components/Header.astro',
    props: [
      { key: 'siteTitle', patterns: [/p\.siteTitle\b/] },
      { key: 'logo', patterns: [/p\.logo\b/] },
      { key: 'navigationLinks', patterns: [/p\.navigationLinks\b/] },
      { key: 'actionButtons', patterns: [/p\.actionButtons\b/] },
      { key: 'stickiness', patterns: [/p\.stickiness\b/] },
    ],
    // navigationLinks: HeaderSchema.navigationLinks = z.array(...), type:'array' в puckConfig.
    subsectionFields: ['navigationLinks'],
  },
  {
    type: 'Hero',
    file: 'src/components/sections/Hero.astro',
    props: [
      { key: 'heading/title', patterns: [/p\.heading\b/, /p\.title\b/] },
      { key: 'text/subtitle', patterns: [/p\.text\b/, /p\.subtitle\b/] },
      { key: 'buttons', patterns: [/p\.primaryButton\b/, /p\.secondaryButton\b/, /p\.cta\b/] },
      { key: 'backgroundImages', patterns: [/p\.backgroundImages\b/] },
    ],
    // Hero.puckConfig не объявляет ни одного type:'array' поля (heading/text/
    // primaryButton/secondaryButton/backgroundImages — все object/imagePair).
    subsectionFields: [],
  },
  {
    type: 'Collections',
    file: 'src/components/sections/Collections.astro',
    props: [
      { key: 'heading', patterns: [/p\.heading\b/] },
      { key: 'collections/items', patterns: [/p\.collections\b/, /p\.items\b/] },
      { key: 'columns', patterns: [/p\.columns\b/] },
    ],
    // collections: Collections.puckConfig.fields.collections = { type:'array', ... }.
    subsectionFields: ['collections'],
  },
  {
    type: 'Product',
    file: 'src/components/sections/FeaturedProduct.astro',
    props: [
      { key: 'productId', patterns: [/p\.productId\b/] },
      { key: 'layout', patterns: [/p\.layout\b/] },
      { key: 'photoPosition', patterns: [/p\.photoPosition\b/] },
      // Product.puckConfig: quantity = z.object({ enabled }) — "показать
      // количество" переключатель живёт в quantity.enabled, не в отдельном
      // булеве showQuantity.
      { key: 'showQuantity', patterns: [/p\.quantity\b/, /p\.showQuantity\b/] },
      // Product.puckConfig: visualConfig.showDescription (theme-driven, скрыто
      // от мерчанта) ИЛИ description-объект — оба admissible. Якорим к
      // реальному проп-доступу (`.showDescription` после ЛЮБОГО идентификатора —
      // `p.showDescription`, `visual.showDescription`, `visualConfig.showDescription`,
      // `Astro.props.showDescription`, …) либо к деструктуризации из props
      // (`const { showDescription } = Astro.props`) — голый идентификатор
      // `showDescription\b` без якоря (как было раньше) мог совпасть со
      // случайной локальной переменной или упоминанием в комментарии.
      {
        key: 'showDescription',
        patterns: [
          /\.showDescription\b/,
          /\{[^{}]*\bshowDescription\b[^{}]*\}\s*=/,
          /p\.description\b/,
        ],
      },
      // Task 5 brief Step 1 расширяет матрицу: variants, add-to-cart, share
      // (productId/layout/photoPosition/quantity/description уже были покрыты
      // выше до Task 5 — см. историю файла).
      { key: 'variants', patterns: [/p\.variants\b/] },
      // add-to-cart — не проп-имя, а declarative cart-wiring контракт (canon
      // паттерн nt-cart delegate: `[data-add-to-cart]` + data-* атрибуты,
      // используемый всеми секциями flux с корзиной — Popular/FluxProductDetail).
      { key: 'add-to-cart', patterns: [/data-add-to-cart/] },
      { key: 'share', patterns: [/p\.share\b/] },
    ],
    // Product.puckConfig не объявляет type:'array' полей.
    subsectionFields: [],
  },
  {
    type: 'PopularProducts',
    file: 'src/components/sections/Popular.astro',
    props: [
      { key: 'collection', patterns: [/p\.collection\b/] },
      { key: 'cards', patterns: [/p\.cards\b/] },
      { key: 'columns', patterns: [/p\.columns\b/] },
      // PopularProductsSchema.quickAddMode — канон-поле, управляющее рендером
      // CTA "В корзину"; quickAdd (булев) — legacy/hidden alias той же фичи.
      { key: 'quickAdd', patterns: [/p\.quickAdd\w*\b/] },
      // PopularProductsSchema.imageView (Figma 314-34614 «Вид изображения»:
      // Квадрат/Портрет/Широкий) — aspect-ratio медиа карточки (Task 6, Step 1/3).
      { key: 'imageView', patterns: [/p\.imageView\b/] },
    ],
    // PopularProducts.puckConfig не объявляет type:'array' полей (cards/columns —
    // числовые слайдеры, не массив карточек — карточки приходят из фида коллекции).
    subsectionFields: [],
  },
  {
    type: 'ImageWithText',
    file: 'src/components/sections/Puk.astro',
    // Task 7 брифа Step 2 расширяет матрицу: alignment/size/width/schemes/padding
    // (image/heading/text/button/imagePosition уже были покрыты выше до Task 7 —
    // это была RED-причина по Task 2 note, image-колонка отсутствовала в Puk.astro
    // до Task 7). "schemes" из брифа = containerColorScheme (hidden-поле канона
    // ImageWithText.puckConfig.ts, применяется на ВНУТРЕННЕМ контейнере — внешний
    // `colorScheme` навешивается обёрткой composeV2Page, не читается в компоненте,
    // паттерн rose ImageWithText.astro).
    props: [
      { key: 'image', patterns: [/p\.image\b/] },
      { key: 'heading', patterns: [/p\.heading\b/] },
      { key: 'text', patterns: [/p\.text\b/] },
      { key: 'button', patterns: [/p\.button\b/] },
      { key: 'imagePosition', patterns: [/p\.imagePosition\b/] },
      { key: 'alignment', patterns: [/p\.alignment\b/] },
      { key: 'size', patterns: [/p\.size\b/] },
      { key: 'width', patterns: [/p\.width\b/] },
      { key: 'schemes (containerColorScheme)', patterns: [/p\.containerColorScheme\b/] },
      { key: 'padding', patterns: [/p\.padding\b/] },
    ],
    subsectionFields: [],
  },
  {
    type: 'Gallery',
    file: 'src/components/sections/Gallery.astro',
    props: [
      { key: 'heading', patterns: [/p\.heading\b/] },
      { key: 'items', patterns: [/p\.items\b/] },
      { key: 'imagePosition', patterns: [/p\.imagePosition\b/] },
    ],
    // items: Gallery.puckConfig.fields.items = { type:'array', ... }.
    subsectionFields: ['items'],
  },
  {
    type: 'Footer',
    file: 'src/components/Footer.astro',
    props: [
      { key: 'newsletter', patterns: [/p\.newsletter\b/] },
      { key: 'columns', patterns: [/p\.navigationColumn\b/, /p\.informationColumn\b/] },
      { key: 'social links', patterns: [/p\.socialColumn\b/] },
      { key: 'copyright', patterns: [/p\.copyright\b/] },
    ],
    // navigationColumn/informationColumn/socialColumn — puckConfig type:'hidden'
    // ОБЪЕКТЫ, НЕПОСРЕДСТВЕННО оборачивающие type:'array' (`links`/`socialLinks`,
    // linkArrayField) — это и есть "колонки"/"социальные ссылки" матрицы.
    subsectionFields: ['navigationColumn', 'informationColumn', 'socialColumn'],
  },
];

// ───────── регистрация тестов ─────────

for (const block of BLOCKS) {
  const absPath = path.resolve(THEME_ROOT, block.file);

  test(`${block.type} (${block.file}): render-contract секции`, async (t) => {
    const content = await readFileOrNull(absPath);

    await t.test('файл существует', () => {
      assert.ok(content !== null, `ожидался файл ${block.file}`);
    });

    if (content === null) {
      // Файл отсутствует (ожидаемо для Product/FeaturedProduct.astro на
      // момент Task 2) — остальные подпункты неприменимы, явный skip вместо
      // дублирования одной и той же причины падения во всех подтестах.
      await t.test('читает Astro.props', (t) => t.skip('файл отсутствует'));
      await t.test('имеет корневой data-puck-component-id={id}', (t) =>
        t.skip('файл отсутствует'),
      );
      await t.test('без React/TSX', (t) => t.skip('файл отсутствует'));
      for (const p of block.props) {
        await t.test(`проп-точка: ${p.key}`, (t) => t.skip('файл отсутствует'));
      }
      for (const field of block.subsectionFields) {
        await t.test(`data-puck-subsection-field="${field}"`, (t) =>
          t.skip('файл отсутствует'),
        );
      }
      await t.test('нет отсутствующих /placeholders/*', (t) => t.skip('файл отсутствует'));
      await t.test('нет жёсткого site/shop id в <script>', (t) =>
        t.skip('файл отсутствует'),
      );
      return;
    }

    await t.test('читает Astro.props', () => {
      assert.match(content, /Astro\.props/, 'ожидался доступ к Astro.props');
    });

    await t.test('имеет корневой data-puck-component-id={id}', () => {
      assert.ok(
        hasRootPuckMarker(content),
        'ожидался маркер data-puck-component-id={...} на СОБСТВЕННОМ корневом ' +
          'элементе секции (глубина 0) — не просто где-то в файле (вложенный ' +
          'дочерний Puck-блок с маркером на корень секции не защитывается)',
      );
    });

    await t.test('без React/TSX', () => {
      const violations = findReactTsxViolations(content);
      assert.deepEqual(
        violations,
        [],
        `найдены React/TSX-конструкции: ${violations.join(', ')}`,
      );
    });

    for (const p of block.props) {
      await t.test(`проп-точка: ${p.key}`, () => {
        assert.ok(
          hasAny(content, p.patterns),
          `ожидалась ссылка на проп "${p.key}" (искали один из: ${p.patterns
            .map(String)
            .join(' | ')})`,
        );
      });
    }

    for (const field of block.subsectionFields) {
      await t.test(`data-puck-subsection-field="${field}"`, () => {
        const marker = `data-puck-subsection-field="${field}"`;
        assert.ok(content.includes(marker), `ожидался маркер ${marker}`);
      });
    }

    await t.test('нет отсутствующих /placeholders/*', async () => {
      const missing = await findMissingPlaceholders(content);
      assert.deepEqual(
        missing,
        [],
        `ссылки на отсутствующие ассеты: ${missing.join(', ')}`,
      );
    });

    await t.test('нет жёсткого site/shop id в <script>', () => {
      const violations = findHardcodedShopIds(content);
      assert.deepEqual(
        violations,
        [],
        `найдены хардкод id в <script>: ${violations.join(', ')}`,
      );
    });
  });
}

// ───────── Task 4 (Step 1): точечные assertions Hero + Collections ─────────
//
// Матрица выше (BLOCKS) — это генерик regex-присутствие ("ссылка на p.heading
// где-то в файле"), которое проходит даже если поле молча ломается (см. ниже).
// Эмпирическая проверка через render-probe (Task 4 investigation) нашла
// РЕАЛЬНЫЙ баг: Hero.astro читал heading/text ТОЛЬКО как канон-объект
// (`p.heading?.text` / `p.text?.content`), в отличие от ВСЕХ остальных 10
// секций этой темы (Collections/Gallery/Popular/Puk/MainText/Newsletter/
// CollapsibleSection/MultiRows/MultiColumns/Publications/ImageWithText),
// которые ЕДИНООБРАЗНО принимают И объект, И плоскую строку
// (`typeof p.heading === "string" ? p.heading : p.heading?.text`). Плоская
// строка на Hero молча пропадала — и хуже: `rawHeadingText`/`rawSubtitleText`
// (детектор пустой секции) её тоже не видели, поэтому секция с РЕАЛЬНЫМ
// заголовком мерчанта ошибочно считалась `isEmpty` и рисовала Figma-плейсхолдер
// «Изображение» вместо заданного текста. Пруф: `node render-probe.mjs flux Hero
// '{"id":"Hero-test","heading":"Новый заголовок"}'` до фикса рендерил
// "Изображение" (см. task-4-report.md).
//
// «search bar» из брифа Task 4 Step 1 ("Hero должен сохранять upstream CTA и
// search bar") НЕ проверяется ниже — по факту чтения пин-коммита upstream
// (SOURCE.lock.json `e29b70920ffe4469744386b51b9c8ee0fcf68bd0`,
// src/components/sections/Hero.astro) и живого https://flux.merfy.ru/ (curl,
// 2026-07-27) поиска в Hero НЕТ ни там, ни там — он живёт только в Header.
// Код несёт явный комментарий "Поиск в Hero УБРАН (2026-06-15, баг тестера
// «два поиска на главной»)" — уже решённый баг, добавление search в Hero было
// бы РЕГРЕССИЕЙ этого фикса. Assertion на search bar не добавлен намеренно
// (см. task-4-report.md).

test('Hero (src/components/sections/Hero.astro): heading/text принимают плоскую строку (паритет с сестринскими секциями)', async (t) => {
  const absPath = path.resolve(THEME_ROOT, 'src/components/sections/Hero.astro');
  const content = await readFileOrNull(absPath);
  assert.ok(content !== null, 'ожидался файл Hero.astro');

  await t.test('heading: typeof p.heading === "string" учитывается ДО/наравне с p.heading?.text', () => {
    assert.match(
      content,
      /typeof\s+p\.heading\s*===\s*["']string["']/,
      'ожидалась проверка typeof p.heading === "string" (плоская строка heading не должна ' +
        'молча теряться и не должна ошибочно детектироваться как isEmpty)',
    );
  });

  await t.test('text: typeof p.text === "string" учитывается ДО/наравне с p.text?.content', () => {
    assert.match(
      content,
      /typeof\s+p\.text\s*===\s*["']string["']/,
      'ожидалась проверка typeof p.text === "string" (плоская строка text/subtitle не должна ' +
        'молча теряться и не должна ошибочно детектироваться как isEmpty)',
    );
  });

  await t.test('upstream CTA: primaryButton/cta рендерится реальной ссылкой с href', () => {
    assert.match(
      content,
      /<a\s+href=\{ctaLink\}/,
      'ожидалась ссылка <a href={ctaLink}> — upstream CTA (Figma/reference: кнопка-ссылка, не button без href)',
    );
  });
});

test('Collections (src/components/sections/Collections.astro): upstream card aspect/gap/hover сохранены', async (t) => {
  const absPath = path.resolve(THEME_ROOT, 'src/components/sections/Collections.astro');
  const content = await readFileOrNull(absPath);
  assert.ok(content !== null, 'ожидался файл Collections.astro');

  // Эталон — живой https://flux.merfy.ru/ (curl, 2026-07-27), секция
  // #collections: `<a class="group flex flex-col gap-4 transition-transform
  // duration-300 hover:-translate-y-1" data-nt="flux-category-card">
  // <div class="aspect-square ... rounded-[12px] ...">
  // <img class="... group-hover:scale-[1.03]" ...>`.
  await t.test('card aspect: aspect-square — канон-дефолт (tile) эталона', () => {
    assert.match(content, /aspect-square/, 'ожидался aspect-square (upstream card aspect ratio)');
  });

  await t.test('card gap: gap-4 на карточке (flex flex-col gap-4)', () => {
    assert.match(
      content,
      /flex\s+flex-col\s+gap-4/,
      'ожидался gap-4 между медиа и подписью карточки (upstream Collections.astro)',
    );
  });

  await t.test('card hover: hover:-translate-y-1 на ссылке карточки', () => {
    assert.match(
      content,
      /hover:-translate-y-1/,
      'ожидался hover:-translate-y-1 на карточке (upstream hover lift)',
    );
  });

  await t.test('card hover: group-hover:scale-[1.03] на изображении', () => {
    assert.match(
      content,
      /group-hover:scale-\[1\.03\]/,
      'ожидался group-hover:scale-[1.03] на медиа карточки (upstream hover zoom)',
    );
  });

  await t.test('rounded-[12px] — upstream радиус плитки', () => {
    assert.match(content, /rounded-\[12px\]/, 'ожидался rounded-[12px] (upstream card radius)');
  });
});

// ───────── Task 6 (Step 1): точечные assertions PopularProducts ─────────
//
// Матрица BLOCKS выше проверяет только regex-присутствие пропов (`p.collection`
// и т.п. где-то в файле) — этого недостаточно для брифа Task 6, который явно
// требует проверить (1) subsection-маркеры heading/viewAll, (2) что реальные
// (merchant) и demo-товары рендерятся ОДНИМ card-рендерером (Step 2 — не
// инлайн-дублем разметки), и (3) что настройка "Быстрое добавление"
// (quickAddText) реально доезжает и до SSR-ветки (FluxProductCard), и до
// клиентской гидрации (storefront-hydrate.ts renderCardHtml/cardButtonHtml) —
// это ФАКТИЧЕСКИ то, что видит покупатель на опубликованном сайте (hydratePopular
// перезаписывает grid.innerHTML на каждый page-load поверх SSR-вывода). До
// фикса storefront-hydrate.ts (см. task-6-report.md) cardButtonHtml/
// renderCardHtml хардкодили литерал "В корзину" — эта проверка красная без него.
test('PopularProducts (src/components/sections/Popular.astro): subsection markers + единый card renderer + ctaLabel', async (t) => {
  const absPath = path.resolve(THEME_ROOT, 'src/components/sections/Popular.astro');
  const content = await readFileOrNull(absPath);
  assert.ok(content !== null, 'ожидался файл Popular.astro');

  await t.test('subsection marker: heading (direct-edit на канвасе конструктора)', () => {
    assert.ok(
      content.includes('data-puck-subsection-field="heading"'),
      'ожидался маркер data-puck-subsection-field="heading"',
    );
  });

  await t.test('subsection marker: viewAll (direct-edit на канвасе конструктора)', () => {
    assert.ok(
      content.includes('data-puck-subsection-field="viewAll"'),
      'ожидался маркер data-puck-subsection-field="viewAll"',
    );
  });

  await t.test('единый card renderer: SSR-ветка реальных товаров использует <FluxProductCard>, не инлайн-дубль разметки', () => {
    assert.match(
      content,
      /import\s+FluxProductCard\s+from\s+["']\.\.\/products\/FluxProductCard\.astro["']/,
      'ожидался импорт FluxProductCard — общий рендерер карточки (Task 6, Step 2), ' +
        'вместо дублирования article/data-nt="flux-product-card" разметки инлайн в Popular.astro',
    );
    assert.match(
      content,
      /realProducts\.map\([\s\S]{0,1200}?<FluxProductCard\b/,
      'ожидалось, что realProducts.map(...) (реальные товары выбранной коллекции) ' +
        'рендерит <FluxProductCard ...> — та же карточка, что catalog.astro/wishlist.astro',
    );
  });

  await t.test('quick add: ctaLabel SSR-карточки прокинут из quickAddText (не хардкод "В корзину")', () => {
    assert.match(
      content,
      /<FluxProductCard[\s\S]{0,200}?ctaLabel=\{quickAddText\}/,
      'ожидалось ctaLabel={quickAddText} на <FluxProductCard ...> — настройка ' +
        '"Быстрое добавление" (Figma 314-34614) должна управлять подписью CTA рич-карточки',
    );
  });

  await t.test('quick add: клиентская гидрация прокидывает ctaLabel в renderCardHtml (паритет с SSR)', () => {
    assert.match(
      content,
      /renderCardHtml\(p,\s*ctaLabel\)/,
      'ожидался renderCardHtml(p, ctaLabel) в hydratePopular — иначе на опубликованном ' +
        'сайте (где hydratePopular перезаписывает grid.innerHTML на каждый page-load) ' +
        'настройка "Быстрое добавление" молча теряется, несмотря на то, что SSR-превью её показывает',
    );
  });
});

test('storefront-hydrate.ts (themes/flux/src/lib/storefront-hydrate.ts): renderCardHtml/cardButtonHtml принимают ctaLabel', async (t) => {
  const absPath = path.resolve(THEME_ROOT, 'src/lib/storefront-hydrate.ts');
  const content = await readFileOrNull(absPath);
  assert.ok(content !== null, 'ожидался файл storefront-hydrate.ts');

  await t.test('renderCardHtml(p, ctaLabel?) — экспортируемая сигнатура несёт необязательный ctaLabel', () => {
    assert.match(
      content,
      /export\s+function\s+renderCardHtml\(p:\s*RealProduct,\s*ctaLabel\?:\s*string\)/,
      'ожидалась сигнатура renderCardHtml(p: RealProduct, ctaLabel?: string) — паритет ' +
        'с FluxProductCard.astro ctaLabel prop (Task 6, Step 2/3)',
    );
  });

  await t.test('cardButtonHtml(p, ctaLabel?) — приватный хелпер прокидывает ctaLabel в разметку кнопки', () => {
    assert.match(
      content,
      /function\s+cardButtonHtml\(p:\s*RealProduct,\s*ctaLabel\?:\s*string\)/,
      'ожидалась сигнатура cardButtonHtml(p: RealProduct, ctaLabel?: string)',
    );
  });

  await t.test('cardButtonHtml НЕ хардкодит литерал "В корзину" в разметке кнопки (использует ctaLabel/label)', () => {
    // Внутри cardButtonHtml допустим только fallback-литерал в выражении
    // `ctaLabel || "В корзину"` (дефолт при отсутствии настройки) — не как
    // текст самой кнопки/ссылки (`>В корзину<`).
    assert.doesNotMatch(
      content,
      />В корзину</,
      'кнопка/ссылка карточки не должна содержать хардкод-текст "В корзину" — ' +
        'подпись обязана идти через ctaLabel (fallback внутри cardButtonHtml допустим)',
    );
  });
});

// ───────── Task 8 (Step 1): точечные assertions Gallery ─────────
//
// Матрица BLOCKS выше уже проверяет generic-присутствие heading/items/
// imagePosition + маркер data-puck-subsection-field="items" (Gallery была
// оживлена ДО этой задачи — Task 2 investigation подтвердила проходящий
// контракт). Ниже — точечные проверки из брифа Task 8 Step 1, которых
// generic-матрица не покрывает: text (отдельно от heading), ограничение
// items тремя элементами, product/collection refs (не просто "проп
// упомянут", а что productId/collectionId реально резолвятся в
// data-gallery-product/-collection атрибуты плитки), imagePosition
// реально зеркалит grid/order (не просто читается), padding управляет
// inline-стилем, и что subsection-маркеры покрывают И heading (клик по
// шапке секции), И КАЖДУЮ из 3 позиций items (клик по конкретной плитке —
// per-item index, не один общий маркер на всё items[]).
//
// "schemes" (colorScheme) из брифа Step 1 НЕ проверяется как проп-точка
// внутри Gallery.astro — по факту чтения GallerySchema (packages/theme-base/
// blocks/Gallery/Gallery.puckConfig.ts) colorScheme ЕСТЬ в канон-схеме, но
// применяется НЕ самим блоком, а внешней обёрткой composeV2Page/
// resolveBlockScheme (src/themes/v2-page-composer.ts schemeIdFromProp →
// `<div class="color-scheme-N">`) — единый механизм для ВСЕХ V2-блоков
// (Collections.astro/Popular.astro тоже не читают colorScheme внутри себя,
// тот же паттерн). Тест ниже проверяет негативно: Gallery.astro НЕ должен
// заводить свой параллельный локальный обработчик colorScheme (это была бы
// РЕГРЕССИЯ/дублирование механизма, не требование канона).
test('Gallery (src/components/sections/Gallery.astro): heading/text, 3 items, product/collection refs, imagePosition, padding, subsection markers', async (t) => {
  const absPath = path.resolve(THEME_ROOT, 'src/components/sections/Gallery.astro');
  const content = await readFileOrNull(absPath);
  assert.ok(content !== null, 'ожидался файл Gallery.astro');

  await t.test('heading: принимает и канон-объект (p.heading?.text), и плоскую строку (typeof p.heading === "string")', () => {
    assert.match(
      content,
      /typeof\s+p\.heading\s*===\s*["']string["']/,
      'ожидалась проверка typeof p.heading === "string" (паритет с Hero/Collections/Popular — плоская строка heading не теряется молча)',
    );
  });

  await t.test('text: принимает и канон-объект (p.text?.content), и плоскую строку (typeof p.text === "string")', () => {
    assert.match(
      content,
      /typeof\s+p\.text\s*===\s*["']string["']/,
      'ожидалась проверка typeof p.text === "string" — text ("Текст"/aiText поле GallerySchema) не покрыт generic BLOCKS-матрицей отдельно от heading',
    );
  });

  await t.test('items: ограничены максимум 3 плитками (.slice(0, 3) — паритет с GallerySchema items.max(3))', () => {
    assert.match(
      content,
      /\.slice\(0,\s*3\)/,
      'ожидался .slice(0, 3) на items[] — GallerySchema.items = z.array(...).min(1).max(3), рендер не должен принимать больше 3 плиток',
    );
  });

  await t.test('items: product-ref (item.productId) резолвится в data-gallery-product атрибут плитки (не просто читается)', () => {
    assert.match(content, /it\.productId\b/, 'ожидалось чтение it.productId при type==="product"');
    assert.match(
      content,
      /data-gallery-product=\{[\s\S]{0,80}?\?\s*\(heroTile\.ref[\s\S]{0,10}?undefined\)\s*:\s*undefined\}/,
      'ожидался data-gallery-product={...ref...} на hero-плитке — цель клиентской гидрации (resolveProduct→имя/цена/картинка)',
    );
  });

  await t.test('items: collection-ref (item.collectionId) резолвится в data-gallery-collection атрибут плитки (не просто читается)', () => {
    assert.match(content, /it\.collectionId\b/, 'ожидалось чтение it.collectionId при type==="collection"');
    assert.match(
      content,
      /data-gallery-collection=/,
      'ожидался data-gallery-collection={...} на плитке — цель клиентской гидрации (resolveCollection→имя/картинка/href)',
    );
  });

  await t.test('imagePosition: "right" реально зеркалит grid-cols И order плиток (не просто читается регэкспом где-то в файле)', () => {
    assert.match(content, /p\.imagePosition\s*===\s*["']right["']/, 'ожидалось сравнение p.imagePosition === "right"');
    assert.match(content, /lg:order-2/, 'ожидался lg:order-2 на hero-плитке при mirror');
    assert.match(content, /lg:order-1/, 'ожидался lg:order-1 на боковой колонке при mirror');
  });

  await t.test('padding: заданный проп управляет inline padding-top/bottom (паттерн rose/Popular/Footer — без двойного отступа)', () => {
    assert.match(
      content,
      /p\.padding\s*\?\s*`padding-top:\$\{p\.padding\.top\}px;padding-bottom:\$\{p\.padding\.bottom\}px;`/,
      'ожидался inline paddingStyle из p.padding.top/bottom',
    );
  });

  await t.test('colorScheme: НЕ дублируется локальным обработчиком в Gallery.astro (единый механизм composeV2Page/resolveBlockScheme для всех V2-блоков, паритет с Collections/Popular)', () => {
    assert.doesNotMatch(
      content,
      /p\.colorScheme\b/,
      'Gallery.astro не должен читать p.colorScheme напрямую — GallerySchema.colorScheme применяется внешней обёрткой composeV2Page ' +
        '(src/themes/v2-page-composer.ts schemeIdFromProp → <div class="color-scheme-N">), как и у Collections.astro/Popular.astro',
    );
  });

  await t.test('subsection marker: heading (direct-edit шапки секции на канвасе конструктора)', () => {
    assert.ok(
      content.includes('data-puck-subsection-field="heading"'),
      'ожидался маркер data-puck-subsection-field="heading" на обёртке шапки',
    );
  });

  await t.test('subsection marker: items несут per-item index (0 — hero, i+1 — боковые) для клика по КОНКРЕТНОЙ из 3 плиток, не один общий маркер на весь массив', () => {
    assert.match(
      content,
      /data-puck-subsection-index=\{0\}[\s\S]{0,40}data-puck-subsection-field="items"/,
      'ожидался data-puck-subsection-index={0} + data-puck-subsection-field="items" на hero-плитке',
    );
    assert.match(
      content,
      /data-puck-subsection-index=\{i \+ 1\}[\s\S]{0,40}data-puck-subsection-field="items"/,
      'ожидался data-puck-subsection-index={i + 1} + data-puck-subsection-field="items" на боковых плитках (i=0,1 → индексы 1,2)',
    );
  });
});

// ───────── Task 8 (Step 2): upstream tile geometry (aspect/order/gaps/radii/hover) ─────────
//
// Инвестигация Task 8: коммит 01f80631 (позднее скопирован checkpoint'ом
// b3bfdbfe) заявил в комментарии "литерал верстальщика" для grid-cols
// (`1fr_429px`) и аспекта карточки коллекции (`429/314`), но НЕ сверил это с
// реальным источником. Реальный литерал (сверено ДВАЖДЫ: `gh api
// repos/Merfy-Dropshipping-Platform/flux-theme/contents/
// src/components/sections/Gallery.astro?ref=e29b70920ffe4469744386b51b9c8ee0fcf68bd0`
// — SOURCE.lock.json pinned commit; и `curl https://flux.merfy.ru/`, живая
// верстальщицкая демо-витрина, 2026-07-28 — оба источника идентичны):
//   - grid-cols = `lg:grid-cols-[875fr_429fr]` (fr-пропорция 875:429, НЕ
//     `1fr_429px` — с фиксированным 429px боковая колонка на узких desktop-
//     ширинах, ~1024-1150px, становится ШИРЕ геройской, инверсия иерархии);
//   - аспект карточки коллекции = `aspect-[429/269]` (НЕ 429/314 — эта цифра
//     не встречается ни в pinned upstream, ни на живой витрине, ни в более
//     старом MANNER.md §2, который цитирует ЕЩЁ ДРУГИЕ, тоже устаревшие
//     429-309/429-444);
//   - геройское изображение обрезается `object-center` (НЕ `object-left` —
//     тоже введено тем же коммитом 01f80631, тоже не сверено).
// Слот "карточка товара" (боковая плитка 1) в upstream — ЦЕЛЫЙ компонент
// <FluxProductCard> (бейдж/цена/кнопка «В корзину»), а НЕ голая
// aspect-ratio-плитка. Gallery.astro сознательно НЕ портирует этот компонент
// сюда: канон Gallery.puckConfig допускает ЛЮБОЙ item.type (image/product/
// collection) на ЛЮБОЙ из 3 позиций, поэтому все 3 позиции используют ОДИН
// универсальный шаблон плитки (aspect+img+label/price) — если бы позиция 1
// рендерила <FluxProductCard> ТОЛЬКО при type==="product", смена типа этой
// же позиции на "image"/"collection" дала бы "чужеродную карточку"
// (несовместимая структура между типами одной позиции) — именно это брифом
// Task 8 Step 2 запрещено ("не создаёт визуально чужую карточку"). Из
// upstream-геометрии product-слота унаследован ТОЛЬКО аспект медиа
// (aspect-square, тот же что и FluxProductCard.astro:52) и hover
// (scale-105 duration-300, тот же что FluxProductCard.astro:63) — не весь
// компонент целиком.
test('Gallery (src/components/sections/Gallery.astro): upstream tile geometry (aspect/order/gaps/radii/hover) сохранена', async (t) => {
  const absPath = path.resolve(THEME_ROOT, 'src/components/sections/Gallery.astro');
  const content = await readFileOrNull(absPath);
  assert.ok(content !== null, 'ожидался файл Gallery.astro');

  await t.test('grid: lg:grid-cols-[875fr_429fr] — пропорциональные fr-треки (upstream 875:429), НЕ фиксированный 429px', () => {
    assert.match(content, /lg:grid-cols-\[875fr_429fr\]/, 'ожидался lg:grid-cols-[875fr_429fr]');
    assert.match(content, /lg:grid-cols-\[429fr_875fr\]/, 'ожидалось зеркало lg:grid-cols-[429fr_875fr] при imagePosition="right"');
    assert.doesNotMatch(content, /429px/, 'НЕ ожидался фиксированный 429px трек (upstream литерал — fr-пропорция)');
  });

  await t.test('grid/side gap: gap-4 (16px) — upstream литерал на всех уровнях сетки', () => {
    assert.match(content, /flex flex-col gap-4 lg:grid \$\{gridColsCls\} lg:gap-4/, 'ожидался gap-4/lg:gap-4 на корневой сетке');
    assert.match(
      content,
      /grid min-w-0 grid-cols-2 gap-4 lg:flex lg:flex-col lg:gap-4/,
      'ожидался gap-4/lg:gap-4 на боковой колонке (мобайл grid-cols-2 / десктоп flex-col)',
    );
  });

  await t.test('hero tile: aspect-square (мобайл) / lg:aspect-auto lg:h-full (десктоп) + rounded radius-media + object-center + hover scale-[1.02] duration-500 ease-out', () => {
    assert.match(
      content,
      /aspect-square w-full min-w-0 overflow-hidden rounded-\[var\(--radius-media,8px\)\][\s\S]{0,80}?lg:aspect-auto lg:h-full/,
      'ожидалась геометрия hero-плитки (aspect-square/lg:h-full/radius-media)',
    );
    assert.match(
      content,
      /object-cover object-center transition-transform duration-500 ease-out group-hover:scale-\[1\.02\]/,
      'ожидался object-center + hover scale-[1.02] duration-500 ease-out на hero-изображении (upstream FluxPicture класс)',
    );
    assert.doesNotMatch(content, /object-left/, 'НЕ ожидался object-left — upstream литерал object-center (регрессия 01f80631)');
  });

  await t.test('side tile 0 (позиция "товар"): aspect-square + hover scale-105 duration-300 (паритет FluxProductCard media)', () => {
    assert.match(
      content,
      /const SIDE_ASPECTS = \["aspect-square", "aspect-\[429\/269\]"\];/,
      'ожидался SIDE_ASPECTS = ["aspect-square", "aspect-[429/269]"]',
    );
    assert.match(
      content,
      /"transition-transform duration-300 group-hover:scale-105",/,
      'ожидался hover scale-105 duration-300 (SIDE_HOVERS[0], паритет FluxProductCard.astro:63)',
    );
  });

  await t.test('side tile 1 (позиция "коллекция"): aspect-[429/269] + hover scale-[1.03] duration-500 ease-out (НЕ 429/314)', () => {
    assert.doesNotMatch(content, /429\/314/, 'НЕ ожидался устаревший аспект 429/314 (регрессия 01f80631, не совпадает ни с одним источником)');
    assert.match(
      content,
      /"transition-transform duration-500 ease-out group-hover:scale-\[1\.03\]",/,
      'ожидался hover scale-[1.03] duration-500 ease-out (SIDE_HOVERS[1], upstream литерал Gallery.astro коллекции)',
    );
  });

  await t.test('радиусы плиток: rounded-[var(--radius-media,8px)] (hero) / rounded-[12px] (боковые) — upstream литералы 8px/12px, токенизировано без смены пикселя по умолчанию', () => {
    assert.match(content, /rounded-\[var\(--radius-media,8px\)\]/, 'ожидался rounded radius-media (fallback 8px) на hero-плитке');
    assert.match(content, /rounded-\[12px\]/, 'ожидался rounded-[12px] на боковых плитках');
  });

  await t.test('порядок плиток: hero (index 0) первая, боковые (product-позиция, затем collection-позиция) — без mirror совпадает с DOM-порядком, при mirror — только CSS order, не DOM', () => {
    assert.match(
      content,
      /heroTile \? \(/,
      'ожидался heroTile первым в DOM (up-front условный рендер до боковой колонки)',
    );
    assert.match(content, /const heroOrderCls = mirror \? " lg:order-2" : "";/, 'ожидался CSS order (не DOM reorder) для зеркалирования');
    assert.match(content, /const sideOrderCls = mirror \? " lg:order-1" : "";/, 'ожидался CSS order (не DOM reorder) для боковой колонки');
  });
});
