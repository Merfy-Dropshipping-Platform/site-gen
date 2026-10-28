// Проверки вёрстки на отрисованной странице (28.10). Это не модуль: файл читает `look-layout.ts` и отдаёт Chromium
// строкой через `page.evaluate(source, { device })`. Поэтому в нём одна функция-выражение, ни импортов, ни типов; в
// линтер пакета он не входит (eslint.config.mjs, ignores), а за поведение отвечают тесты в настоящем Chromium
// (`__tests__/look-layout.test.ts`).
//
// Порог и правило каждой проверки — только в таблице RULES ниже и в комментарии над функцией проверки. Тексты находок
// («что не так · как починить классами Tailwind») тоже здесь: по ним ИИ правит секцию.
//
// Ничего на странице не меняется: все проверки читают геометрию и стили. Возвращается список находок (до
// MAX_PER_CODE на код, не больше одной на секцию, пока есть другие секции) вместе с вырезкой — прямоугольником места
// в пикселях страницы — и номером метки: элементы находки лежат в `window.__lookMarks[номер]`, `window.__lookMark(номер)`
// обводит их на время снимка вырезки, `window.__lookUnmark()` убирает обводку. `options.device` — устройство,
// `options.section` (необязательно) — id экземпляра секции: тогда в итог идут только её находки.
async (options) => {
  'use strict';

  const RULES = {
    // row-unequal. Ряд — дети одного родителя, у которых верх на одной линии (±topTolerance px) и ширина похожа
    // (±widthTolerance от медианной), от 2 штук; ребёнок — не меньше minItem на minItem, не inline, не absolute/fixed.
    // Находка: высоты карточек различаются больше heightDiff px (только если у всех карточек есть видимая рамка:
    // фон, граница или тень — иначе разницы высоты глазом не видно; аккордеоны не считаются) ИЛИ первые картинки
    // карточек (шире minImageWidth) различаются по высоте больше imageHeightDiff px.
    rowUnequal: {
      topTolerance: 2,
      widthTolerance: 0.1,
      heightDiff: 8,
      imageHeightDiff: 8,
      minItem: 48,
      minImageWidth: 60,
    },
    // row-not-filling. От minItems одинаковых соседей (тег и классы) на одной линии, «полосок»: высота ≤ maxThickness px
    // и ширина не меньше minAspect высот (точки-индикаторы 8×8 не полоски), либо role="tab" высотой ≤ maxTabThickness
    // с той же шириной. Находка: вместе (от левого края первой до правого края последней) занимают меньше minFill
    // ширины содержимого родителя.
    rowNotFilling: { minItems: 3, maxThickness: 12, maxTabThickness: 24, minAspect: 2, minFill: 0.9, topTolerance: 2 },
    // overflow-x. Только телефон и только когда страница действительно прокручивается вбок. Виновник — элемент,
    // правый край которого дальше ширины экрана на tolerance px, если его не обрезает и не прокручивает предок,
    // умещающийся в экран (карусели, overflow-hidden). Самый широкий — первым.
    overflowX: { tolerance: 1 },
    // text-clipped. Текст виден частично, а контейнер с overflow hidden/clip обрезает его больше чем на overflowX px по
    // ширине или overflowY px по высоте. Не считаются: многоточие (text-overflow: ellipsis), line-clamp, анимация (бегущая
    // строка), контейнеры меньше minBox px, а также карусели: когда за край выходит и промежуточный предок текста.
    textClipped: { overflowX: 2, overflowY: 3, minBox: 8 },
    // overlap. Кнопки, ссылки с текстом или значком и поля ввода перекрывают друг друга, либо перекрывают строки
    // заголовка h1–h6, на минимум minArea px²; для пары кнопок ещё и не меньше minShare площади меньшей из них. Не
    // считаются: вложенные друг в друга, fixed (плавающие кнопки), pointer-events: none, aria-hidden, ссылки только с
    // картинкой и пустые растянутые ссылки. Текст поверх фото сюда не попадает: картинки и обычный текст не проверяются.
    overlap: { minShare: 0.25, minArea: 24 },
    // image-distorted. У картинки object-fit: fill, а пропорции области на странице отличаются от натуральных больше
    // чем на tolerance; картинки меньше minSize px и SVG не считаются.
    imageDistorted: { tolerance: 0.03, minSize: 40 },
    // tap-small (телефон). Кнопка (button, role=button, input submit/button) или отдельная ссылка ниже minHeight px.
    // Отдельная — без текста вплотную рядом в том же абзаце. Элементы меньше minVisible px (скрытые для глаз) не считаются.
    tapSmall: { minHeight: 44, minVisible: 8 },
    // text-small (телефон). Видимый текст (от minChars знаков) с кеглем меньше minFontPx px; sub/sup и svg не считаются.
    textSmall: { minFontPx: 12, minChars: 3 },
    // columns-many (телефон). Ряд из minColumns и больше карточек (картинка и текст внутри), которые целиком в экране.
    columnsMany: { minColumns: 3 },
  };

  const MAX_PER_CODE = 6;
  const MAX_ELEMENTS = 6000;
  const SETTLE_MS = 800;
  const MOBILE = options.device === 'mobile';

  // Координаты ниже — от верха страницы, поэтому прокрутка в начало без плавности. Шапка с «прячется при прокрутке» после
  // этого ещё возвращается на место переходом: ждём конца конечных анимаций (не дольше SETTLE_MS), иначе размеры
  // снимаются на полпути.
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const finite = document
    .getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
  await Promise.race([
    Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, SETTLE_MS)),
  ]);
  const viewportWidth = document.documentElement.clientWidth;
  const root = document.documentElement;
  const all = [...document.body.querySelectorAll('*')].slice(0, MAX_ELEMENTS);

  // ---- общие помощники ----------------------------------------------------------------------------------------

  const rectCache = new Map();
  const rectOf = (el) => {
    let rect = rectCache.get(el);
    if (rect === undefined) {
      rect = el.getBoundingClientRect();
      rectCache.set(el, rect);
    }
    return rect;
  };
  const styleCache = new Map();
  const styleOf = (el) => {
    let style = styleCache.get(el);
    if (style === undefined) {
      style = getComputedStyle(el);
      styleCache.set(el, style);
    }
    return style;
  };
  const isVisible = (el) => {
    const rect = rectOf(el);
    if (rect.width <= 0 || rect.height <= 0) return false;
    return el.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
      opacityProperty: true,
      visibilityProperty: true,
    });
  };
  const isClip = (value) => value === 'hidden' || value === 'clip';
  const intersection = (a, b) => {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return width > 0 && height > 0 ? width * height : 0;
  };
  // Срезан предком с overflow hidden/clip: элемент целиком вне его рамки (свёрнутое меню, слайд вне окна карусели).
  const clipMemo = new Map();
  const clippedAway = (el) => {
    if (el === document.body || el === root || el.parentElement === null) return false;
    let away = clipMemo.get(el);
    if (away === undefined) {
      const parent = el.parentElement;
      const style = styleOf(parent);
      const boxed = style.display !== 'inline' && style.display !== 'contents';
      const clips = boxed && (isClip(style.overflowX) || isClip(style.overflowY));
      away = clippedAway(parent) || (clips && intersection(rectOf(el), rectOf(parent)) === 0);
      clipMemo.set(el, away);
    }
    return away;
  };
  const inScroller = (el) => {
    for (let node = el.parentElement; node !== null; node = node.parentElement) {
      if (['auto', 'scroll'].includes(styleOf(node).overflowX)) return true;
    }
    return false;
  };
  // Виден глазу: не скрыт стилями, лежит в документе (не над верхним и не за левым краем, не за правым без прокрутки) и
  // не срезан предком. Так отсекаются закрытые меню и шторки за краем экрана.
  const isShown = (el) => {
    if (!isVisible(el)) return false;
    const rect = rectOf(el);
    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.left >= viewportWidth && !inScroller(el)) return false;
    return !clippedAway(el);
  };
  const hiddenForReaders = (el) => el.closest('[aria-hidden="true"], [inert]') !== null;
  const cut = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);
  const textOf = (el, limit) => cut((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(), limit);
  const nameOf = (el) => {
    const classes = [...el.classList].slice(0, 3).join('.');
    return cut(el.tagName.toLowerCase() + (classes ? `.${classes}` : ''), 60);
  };
  const sectionOf = (el) => {
    const section = el.closest('[data-section]');
    if (section !== null) return section.getAttribute('data-section-id') || section.getAttribute('data-section');
    const part = el.closest('header, footer, main > *');
    return part === null ? null : part.tagName.toLowerCase();
  };
  const px = (value) => Math.round(value);

  const alphaOf = (color) => {
    if (color === 'transparent') return 0;
    const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
    if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
    const rgba = /^rgba\(([^)]+)\)$/.exec(color);
    if (rgba) {
      const parts = rgba[1].split(',');
      return parts.length === 4 ? parseFloat(parts[3]) : 1;
    }
    return 1;
  };
  const hasBox = (el) => {
    const style = styleOf(el);
    const border = ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none',
    );
    return (
      alphaOf(style.backgroundColor) > 0.02 || style.backgroundImage !== 'none' || border || style.boxShadow !== 'none'
    );
  };
  const insideFixed = (el) => {
    for (let node = el; node !== null && node !== document.body; node = node.parentElement) {
      if (styleOf(node).position === 'fixed') return true;
    }
    return false;
  };

  const docRect = (rect) => ({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  const unionOf = (rects) => {
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  // Находки: на код — до MAX_PER_CODE, по одной на секцию в первую очередь; важнее — больший `score`.
  const collected = [];
  const report = (code, el, text, rects, elements, score) => {
    // fixed: место прибито к экрану (плавающая кнопка, баннер) — вырезка снимается без прокрутки, в координатах экрана.
    const fixed = elements.some(insideFixed);
    collected.push({ code, section: sectionOf(el), text, clip: unionOf(rects), elements, score, fixed });
  };

  // ---- ряды: общий разбор для row-unequal и columns-many -------------------------------------------------------

  const isCardLike = (el) => {
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'BR', 'NOSCRIPT'].includes(el.tagName)) return false;
    const style = styleOf(el);
    if (['inline', 'contents', 'none'].includes(style.display)) return false;
    if (style.position === 'absolute' || style.position === 'fixed') return false;
    const rect = rectOf(el);
    return rect.width >= RULES.rowUnequal.minItem && rect.height >= RULES.rowUnequal.minItem && isVisible(el);
  };
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const similarWidth = (items) => {
    const middle = median(items.map((item) => rectOf(item).width));
    return items.filter((item) => Math.abs(rectOf(item).width - middle) <= middle * RULES.rowUnequal.widthTolerance);
  };
  const lineGroups = (items, tolerance) => {
    const sorted = [...items].sort((a, b) => rectOf(a).top - rectOf(b).top);
    const groups = [];
    for (const item of sorted) {
      const last = groups[groups.length - 1];
      if (last !== undefined && Math.abs(rectOf(item).top - rectOf(last[0]).top) <= tolerance) last.push(item);
      else groups.push([item]);
    }
    return groups;
  };
  const rowsOf = (parent) => {
    const kids = [...parent.children].filter(isCardLike);
    if (kids.length < 2) return [];
    return lineGroups(kids, RULES.rowUnequal.topTolerance)
      .map(similarWidth)
      .filter((row) => row.length >= 2);
  };
  const rows = [];
  for (const parent of all) {
    if (parent.children.length < 2 || !isVisible(parent)) continue;
    for (const members of rowsOf(parent)) rows.push({ parent, members });
  }

  // ---- row-unequal --------------------------------------------------------------------------------------------

  const firstImage = (card) => {
    const images = card.tagName === 'IMG' ? [card] : [...card.querySelectorAll('img')];
    return images.find((image) => rectOf(image).width >= RULES.rowUnequal.minImageWidth && isVisible(image)) || null;
  };
  const isAccordion = (card) => card.tagName === 'DETAILS' || card.querySelector('summary, [aria-expanded]') !== null;
  const spread = (values) => Math.max(...values) - Math.min(...values);

  const checkRowUnequal = ({ members }) => {
    const rects = members.map(rectOf);
    const heights = rects.map((rect) => rect.height);
    const images = members.map(firstImage).filter((image) => image !== null);
    const imageHeights = images.map((image) => rectOf(image).height);
    const boxed = members.every(hasBox) && !members.some(isAccordion);
    const imagesBad = images.length >= 2 && spread(imageHeights) > RULES.rowUnequal.imageHeightDiff;
    const heightBad = boxed && spread(heights) > RULES.rowUnequal.heightDiff;
    if (!imagesBad && !heightBad) return;
    const text = imagesBad
      ? `Фото в карточках одного ряда разной высоты: от ${px(Math.min(...imageHeights))} до ${px(Math.max(...imageHeights))} px (${members.length} шт.) · ` +
        'задайте всем фото одинаковые пропорции: aspect-[4/5] w-full object-cover (или aspect-square), без фиксированной высоты и h-auto'
      : `Карточки в одном ряду разной высоты: от ${px(Math.min(...heights))} до ${px(Math.max(...heights))} px (${members.length} шт.), низ не выровнен · ` +
        'карточке — flex flex-col h-full, фото — aspect-[4/5] w-full object-cover, нижний блок (цена, кнопка) — mt-auto; у ряда не items-start';
    const score = imagesBad ? spread(imageHeights) : spread(heights);
    report('row-unequal', members[0], text, rects, imagesBad ? images : members, score);
  };
  for (const row of rows) checkRowUnequal(row);

  // ---- row-not-filling ----------------------------------------------------------------------------------------

  const isStrip = (el) => {
    const rect = rectOf(el);
    const rule = RULES.rowNotFilling;
    const limit = el.getAttribute('role') === 'tab' ? rule.maxTabThickness : rule.maxThickness;
    return rect.height >= 1 && rect.height <= limit && rect.width >= rule.minAspect * rect.height;
  };
  const contentWidth = (el) => {
    const style = styleOf(el);
    return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  };
  const sameKind = (items) => {
    const kinds = new Map();
    for (const item of items) {
      const key = `${item.tagName}|${item.className}`;
      kinds.set(key, [...(kinds.get(key) || []), item]);
    }
    return [...kinds.values()];
  };
  const checkStrips = (parent) => {
    const rule = RULES.rowNotFilling;
    const strips = [...parent.children].filter((child) => isVisible(child) && isStrip(child));
    if (strips.length < rule.minItems || contentWidth(parent) <= 0) return;
    for (const kind of sameKind(strips)) {
      for (const line of lineGroups(kind, rule.topTolerance)) {
        if (line.length < rule.minItems) continue;
        const rects = line.map(rectOf);
        const extent = Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left));
        const share = extent / contentWidth(parent);
        if (share >= rule.minFill) continue;
        report(
          'row-not-filling',
          line[0],
          `${line.length} полосок-индикаторов занимают ${px(share * 100)} % ширины своего ряда · ` +
            'дайте каждой flex-1 (у ряда flex gap-1 w-full) или сделайте ряд grid grid-flow-col auto-cols-fr gap-1',
          rects,
          line,
          1 - share,
        );
      }
    }
  };
  for (const parent of all) {
    if (parent.children.length >= RULES.rowNotFilling.minItems && isVisible(parent)) checkStrips(parent);
  }

  // ---- overflow-x ---------------------------------------------------------------------------------------------

  const clipsX = (value) => ['hidden', 'clip', 'auto', 'scroll'].includes(value);
  const clippedByAncestor = (el, limit) => {
    for (let node = el.parentElement; node !== null && node !== root; node = node.parentElement) {
      if (clipsX(styleOf(node).overflowX) && rectOf(node).right <= limit) return true;
    }
    return false;
  };
  const rightEdge = (el) => {
    const rect = rectOf(el);
    const textOnly = el.children.length === 0 && styleOf(el).overflowX === 'visible';
    return textOnly ? Math.max(rect.right, rect.left + el.scrollWidth) : rect.right;
  };
  const depthOf = (el) => {
    let depth = 0;
    for (let node = el; node !== null; node = node.parentElement) depth += 1;
    return depth;
  };
  const checkOverflowX = () => {
    if (root.scrollWidth <= root.clientWidth) return;
    const limit = viewportWidth + RULES.overflowX.tolerance;
    const culprits = [];
    for (const el of all) {
      if (!isVisible(el) || insideFixed(el)) continue;
      const right = rightEdge(el);
      if (right <= limit || clippedByAncestor(el, limit)) continue;
      culprits.push({ el, right, depth: depthOf(el) });
    }
    culprits.sort((a, b) => b.right - a.right || a.depth - b.depth);
    for (const { el, right } of culprits.slice(0, MAX_PER_CODE)) {
      const rect = rectOf(el);
      report(
        'overflow-x',
        el,
        `Выходит за ширину экрана на ${px(right - viewportWidth)} px (экран ${viewportWidth} px, элемент ${nameOf(el)} шириной ${px(rect.width)} px)` +
          (textOf(el, 30) ? `, внутри «${textOf(el, 30)}»` : '') +
          ' · уберите фиксированную ширину (w-[…px]), поставьте w-full max-w-full, у детей flex — min-w-0, длинным словам — break-words, ряду — flex-wrap',
        [rect],
        [el],
        right,
      );
    }
  };
  if (MOBILE) checkOverflowX();

  // ---- тексты: общий обход для text-clipped и text-small ---------------------------------------------------------

  const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'TEXTAREA', 'SELECT', 'TITLE']);
  const textBlocks = [];
  const collectTexts = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const byParent = new Map();
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || SKIP_TEXT_TAGS.has(parent.tagName) || !/\S/.test(node.textContent)) continue;
      byParent.set(parent, [...(byParent.get(parent) || []), node]);
    }
    for (const [el, nodes] of byParent) {
      if (textBlocks.length >= MAX_ELEMENTS) break;
      const rects = nodes.map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect();
      });
      const real = rects.filter((rect) => rect.width > 0 && rect.height > 0);
      if (real.length === 0 || !isShown(el) || el.closest('svg') !== null) continue;
      const box = unionOf(real);
      const text = nodes
        .map((node) => node.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      textBlocks.push({
        el,
        text,
        rect: {
          left: box.x,
          top: box.y,
          right: box.x + box.width,
          bottom: box.y + box.height,
          width: box.width,
          height: box.height,
        },
      });
    }
  };
  collectTexts();

  // ---- text-clipped -------------------------------------------------------------------------------------------

  const clampsLines = (style) => {
    const clamp = style.webkitLineClamp || style.lineClamp;
    return Boolean(clamp) && clamp !== 'none';
  };
  const ellipsizes = (style) => style.textOverflow === 'ellipsis';
  const peeks = (middle, box, overX, overY) =>
    middle.some((node) => {
      const rect = rectOf(node);
      const x = overX && (rect.right > box.right + 1 || rect.left < box.left - 1);
      const y = overY && (rect.bottom > box.bottom + 1 || rect.top < box.top - 1);
      return x || y;
    });
  const animated = (nodes) => nodes.some((node) => styleOf(node).animationName !== 'none');

  // Первый предок, который режет текст: { box, overX, overY, chain } или null, если текст не режется или режется «по
  // замыслу» (многоточие, line-clamp, анимация, карусель).
  const clipperOf = (block) => {
    const rule = RULES.textClipped;
    const chain = [];
    for (let node = block.el; node !== null && node !== root; node = node.parentElement) {
      const style = styleOf(node);
      const box = rectOf(node);
      const cx = isClip(style.overflowX);
      const cy = isClip(style.overflowY);
      chain.push(node);
      if (!cx && !cy) continue;
      const overX =
        cx && (block.rect.right > box.right + rule.overflowX || block.rect.left < box.left - rule.overflowX);
      const overY =
        cy && (block.rect.bottom > box.bottom + rule.overflowY || block.rect.top < box.top - rule.overflowY);
      if (!overX && !overY) continue;
      const partlyShown =
        block.rect.right > box.left &&
        block.rect.left < box.right &&
        block.rect.bottom > box.top &&
        block.rect.top < box.bottom;
      if (!partlyShown || box.width < rule.minBox || box.height < rule.minBox) return null;
      if (peeks(chain.slice(1, -1), box, overX, overY) || animated(chain)) return null;
      if (chain.some((item) => clampsLines(styleOf(item)) || ellipsizes(styleOf(item)))) return null;
      return { box, overX, overY, node };
    }
    return null;
  };
  const checkTextClipped = () => {
    for (const block of textBlocks) {
      const clipper = clipperOf(block);
      if (clipper === null) continue;
      const lost = clipper.overX
        ? Math.max(block.rect.right - clipper.box.right, clipper.box.left - block.rect.left)
        : Math.max(block.rect.bottom - clipper.box.bottom, clipper.box.top - block.rect.top);
      report(
        'text-clipped',
        block.el,
        `Текст «${cut(block.text, 40)}» обрезан контейнером ${nameOf(clipper.node)} на ${px(lost)} px, многоточия нет · ` +
          'уберите фиксированную высоту и overflow-hidden (h-auto, min-h-*), а если обрезка нужна — для строки truncate, для абзаца line-clamp-2',
        [block.rect, clipper.box],
        [block.el, clipper.node],
        lost,
      );
    }
  };
  checkTextClipped();

  // ---- text-small ---------------------------------------------------------------------------------------------

  const checkTextSmall = () => {
    const rule = RULES.textSmall;
    for (const block of textBlocks) {
      const size = parseFloat(styleOf(block.el).fontSize);
      const letters = block.text.replace(/[^\p{L}\p{N}]/gu, '').length;
      if (!(size > 0) || size >= rule.minFontPx || letters < rule.minChars) continue;
      if (block.el.closest('sub, sup') !== null || hiddenForReaders(block.el)) continue;
      report(
        'text-small',
        block.el,
        `Текст «${cut(block.text, 40)}» мельче ${rule.minFontPx} px: ${Math.round(size * 10) / 10} px · ` +
          'на телефоне минимум text-xs (12 px), основной текст — text-sm или text-base',
        [block.rect],
        [block.el],
        rule.minFontPx - size,
      );
    }
  };
  if (MOBILE) checkTextSmall();

  // ---- overlap ------------------------------------------------------------------------------------------------

  const CONTROLS = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]';
  const hasLabelOrIcon = (el) =>
    (el.innerText || '').trim() !== '' || el.querySelector('svg') !== null || el.getAttribute('aria-label') !== null;
  const imageOnly = (el) =>
    el.querySelector('img, picture, video') !== null &&
    (el.innerText || '').trim() === '' &&
    el.querySelector('svg') === null;
  const isControl = (el) => {
    if (!isShown(el) || hiddenForReaders(el) || insideFixed(el) || styleOf(el).pointerEvents === 'none') return false;
    const rect = rectOf(el);
    if (rect.width < 8 || rect.height < 8) return false;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) return !imageOnly(el);
    return hasLabelOrIcon(el) && !imageOnly(el);
  };
  const labelOf = (el) => `«${cut(textOf(el, 30) || el.getAttribute('aria-label') || nameOf(el), 30)}»`;

  const checkControlPairs = (controls) => {
    const sorted = [...controls].sort((a, b) => rectOf(a).left - rectOf(b).left);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        const ra = rectOf(a);
        const rb = rectOf(b);
        if (rb.left >= ra.right) break;
        if (a.contains(b) || b.contains(a)) continue;
        const area = intersection(ra, rb);
        const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
        if (area < RULES.overlap.minArea || area / smaller < RULES.overlap.minShare) continue;
        report(
          'overlap',
          a,
          `${labelOf(a)} и ${labelOf(b)} перекрывают друг друга (${px(area)} px²) · ` +
            'уберите absolute у одного из них или положите оба в flex gap-2 (flex-wrap на телефоне), не давайте им одно место',
          [ra, rb],
          [a, b],
          area,
        );
      }
    }
  };
  const lineRects = (heading) => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  };
  const checkControlsOnHeadings = (controls) => {
    const headings = [...document.body.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
      (el) => isShown(el) && !hiddenForReaders(el),
    );
    for (const heading of headings) {
      const lines = lineRects(heading);
      for (const control of controls) {
        if (control.contains(heading) || heading.contains(control)) continue;
        const rect = rectOf(control);
        const area = Math.max(0, ...lines.map((line) => intersection(line, rect)));
        if (area < RULES.overlap.minArea) continue;
        report(
          'overlap',
          control,
          `${labelOf(control)} лежит на заголовке «${cut(textOf(heading, 40), 40)}» (${px(area)} px²) · ` +
            'уберите absolute у кнопки или добавьте заголовку отступ (pr-12) и поставьте кнопку в угол, где нет текста',
          [rect, ...lines],
          [control, heading],
          area * 2,
        );
      }
    }
  };
  const checkOverlap = () => {
    const controls = [...document.body.querySelectorAll(CONTROLS)].slice(0, 600).filter(isControl);
    checkControlPairs(controls);
    checkControlsOnHeadings(controls);
  };
  checkOverlap();

  // ---- image-distorted ----------------------------------------------------------------------------------------

  const checkImages = () => {
    const rule = RULES.imageDistorted;
    for (const image of document.images) {
      if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0 || !isShown(image)) continue;
      if (/\.svg(\?|#|$)/i.test(image.currentSrc) || image.currentSrc.startsWith('data:image/svg')) continue;
      const style = styleOf(image);
      if (style.objectFit !== 'fill') continue;
      const width = image.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = image.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (width < rule.minSize || height < rule.minSize) continue;
      const shown = width / height;
      const natural = image.naturalWidth / image.naturalHeight;
      const drift = Math.abs(shown / natural - 1);
      if (drift <= rule.tolerance) continue;
      report(
        'image-distorted',
        image,
        `Картинка растянута: на странице ${px(width)}×${px(height)} px, а у файла пропорции ${image.naturalWidth}×${image.naturalHeight} (отличие ${px(drift * 100)} %) · ` +
          'добавьте object-cover (обрезать по рамке) или object-contain (вписать целиком) и пропорции рамке: aspect-[4/5] w-full',
        [rectOf(image)],
        [image],
        drift,
      );
    }
  };
  checkImages();

  // ---- tap-small ----------------------------------------------------------------------------------------------

  const hasTextBeside = (node) => {
    const near = [node.previousSibling, node.nextSibling];
    return near.some(
      (sibling) => sibling !== null && sibling.nodeType === Node.TEXT_NODE && /\S/.test(sibling.textContent),
    );
  };
  // Ссылка внутри абзаца: рядом с ней (или с её inline-обёрткой) в том же родителе есть текст.
  const insideParagraph = (link) => {
    let node = link;
    for (let level = 0; level < 3 && node !== null; level += 1) {
      if (hasTextBeside(node)) return true;
      const parent = node.parentElement;
      if (parent === null || styleOf(parent).display !== 'inline') return false;
      node = parent;
    }
    return false;
  };
  const TAP_TARGETS = 'button, [role="button"], input[type="submit"], input[type="button"], a[href]';
  const isTapTarget = (el) => {
    if (!isShown(el) || hiddenForReaders(el)) return false;
    const rect = rectOf(el);
    if (rect.height < RULES.tapSmall.minVisible || rect.width < RULES.tapSmall.minVisible) return false;
    return el.tagName !== 'A' || !insideParagraph(el);
  };
  const checkTapSmall = () => {
    for (const el of [...document.body.querySelectorAll(TAP_TARGETS)].slice(0, 800)) {
      const rect = rectOf(el);
      if (rect.height >= RULES.tapSmall.minHeight || !isTapTarget(el)) continue;
      const what = el.tagName === 'A' ? 'Ссылка' : 'Кнопка';
      report(
        'tap-small',
        el,
        `${what} ${labelOf(el)} высотой ${px(rect.height)} px, на телефоне нужно не меньше ${RULES.tapSmall.minHeight} px · ` +
          'min-h-11 (44 px) и px-4, у иконки — size-11 или p-3; в списке ссылок — py-3',
        [rect],
        [el],
        RULES.tapSmall.minHeight - rect.height,
      );
    }
  };
  if (MOBILE) checkTapSmall();

  // ---- columns-many -------------------------------------------------------------------------------------------

  const isProductCard = (card) => firstImage(card) !== null && (card.innerText || '').replace(/\s/g, '').length >= 3;
  const checkColumns = () => {
    for (const { members } of rows) {
      const inside = members.filter((card) => rectOf(card).left >= -1 && rectOf(card).right <= viewportWidth + 1);
      if (inside.length < RULES.columnsMany.minColumns || !inside.every(isProductCard)) continue;
      const rects = inside.map(rectOf);
      report(
        'columns-many',
        inside[0],
        `${inside.length} колонки карточек с фото в ряд на экране ${viewportWidth} px, каждая шириной около ${px(median(rects.map((rect) => rect.width)))} px · ` +
          'на телефоне grid-cols-2 (или grid-cols-1), три и больше — с md: (grid grid-cols-2 gap-3 md:grid-cols-3)',
        rects,
        inside,
        inside.length,
      );
    }
  };
  if (MOBILE) checkColumns();

  // ---- итог ---------------------------------------------------------------------------------------------------

  // Снимок одной секции (`options.section` — её data-section-id): берём только находки внутри неё, до отбора «до
  // MAX_PER_CODE на код» — иначе находки других секций вытеснили бы её собственные.
  const scoped = options.section ? collected.filter((item) => item.section === options.section) : collected;
  const pick = (code) => {
    const found = scoped.filter((item) => item.code === code).sort((a, b) => b.score - a.score);
    const seen = new Set();
    const first = found.filter((item) => !seen.has(item.section) && seen.add(item.section));
    return [...first, ...found.filter((item) => !first.includes(item))].slice(0, MAX_PER_CODE);
  };
  const codes = [...new Set(scoped.map((item) => item.code))];
  const chosen = codes.flatMap(pick);

  window.__lookMarks = chosen.map((item) => item.elements);
  window.__lookMark = (index) => {
    window.__lookUnmark();
    const style = document.createElement('style');
    style.id = '__look-mark-style';
    style.textContent = '[data-look-mark]{outline:3px solid #e11d48 !important;outline-offset:2px !important}';
    document.head.append(style);
    for (const el of window.__lookMarks[index] || []) el.setAttribute('data-look-mark', '');
  };
  window.__lookUnmark = () => {
    document.getElementById('__look-mark-style')?.remove();
    for (const el of document.querySelectorAll('[data-look-mark]')) el.removeAttribute('data-look-mark');
  };

  return chosen.map((item, index) => ({
    code: item.code,
    section: item.section,
    text: item.text,
    clip: item.clip,
    mark: index,
    fixed: item.fixed,
  }));
};
