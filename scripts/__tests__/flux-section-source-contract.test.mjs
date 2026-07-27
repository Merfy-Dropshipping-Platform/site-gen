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
    ],
    // PopularProducts.puckConfig не объявляет type:'array' полей (cards/columns —
    // числовые слайдеры, не массив карточек — карточки приходят из фида коллекции).
    subsectionFields: [],
  },
  {
    type: 'ImageWithText',
    file: 'src/components/sections/Puk.astro',
    props: [
      { key: 'image', patterns: [/p\.image\b/] },
      { key: 'heading', patterns: [/p\.heading\b/] },
      { key: 'text', patterns: [/p\.text\b/] },
      { key: 'button', patterns: [/p\.button\b/] },
      { key: 'imagePosition', patterns: [/p\.imagePosition\b/] },
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
