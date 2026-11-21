// Свой снимок стиля без Node (переходник `own`): вычисленные стили видимых элементов, веса по площади и роли — как в
// рецепте Cloudflare. Тело функции; перед ним подставляется blocks.js (`design-capture.ts`). Цвета — как их отдаёт
// браузер (`rgb(...)`), в наш формат их переводит `tools/own.ts`. Перенесено из прототипа Визи `vizi/design/js/own.js`.
const LIMIT = 1500; // элементов одного вида на страницу: дальше вес уже не меняется
const TEXT_TAGS = 'p, li, span, a, td, label, div';
const BUTTONS = 'button, a, input[type="submit"], input[type="button"], [role="button"]';
const INPUTS =
  'input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input:not([type]), textarea';
const MOTION = "[data-aos], [data-sal], [data-scroll], [data-animate], .wow, .reveal, .t-animate, [class*='animate__']";

const num = (v) => parseFloat(v) || 0;
const area = (el) => rectOf(el).width * rectOf(el).height;
// Прозрачен только цвет с нулевой альфой: `rgb(255, 85, 0)` — оранжевый, а не прозрачный.
const transparent = (c) => !c || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);

function bgOf(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (!transparent(c)) return c;
  }
  return 'rgb(255, 255, 255)';
}

// Ключ с наибольшим суммарным весом: [[ключ, вес], ...] -> ключ.
function heaviest(pairs) {
  const sums = new Map();
  for (const [key, w] of pairs) if (key != null) sums.set(key, (sums.get(key) || 0) + w);
  return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

function ownText(el) {
  return [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.trim())
    .join(' ');
}

function texts(root) {
  return [...root.querySelectorAll(TEXT_TAGS)].slice(0, LIMIT).filter((el) => ownText(el).length > 1 && visible(el));
}

function buttonsIn(root) {
  return [...root.querySelectorAll(BUTTONS)].slice(0, LIMIT).filter((el) => {
    const r = rectOf(el);
    return r.height >= 24 && r.height <= 90 && r.width >= 40 && r.width <= 520 && visible(el);
  });
}

function buttonLook(el) {
  const st = getComputedStyle(el);
  const filled = !transparent(st.backgroundColor) && st.backgroundColor !== bgOf(el.parentElement);
  const outlined = num(st.borderTopWidth) >= 1 && !transparent(st.borderTopColor);
  return filled ? 'fill' : outlined ? 'outline' : 'text';
}

function buttonRadius(el) {
  const r = num(getComputedStyle(el).borderTopLeftRadius);
  return r >= rectOf(el).height / 2 ? 9999 : r;
}

function buttonsOf(root) {
  const found = buttonsIn(root).map((el) => ({ el, look: buttonLook(el), w: area(el) }));
  const filled = found.filter((b) => b.look === 'fill');
  const colors = heaviest(filled.map((b) => [getComputedStyle(b.el).backgroundColor, b.w]));
  const sample = (bg) => filled.find((b) => getComputedStyle(b.el).backgroundColor === bg);
  const pair = (bg) => (bg ? { bg, text: getComputedStyle(sample(bg).el).color } : null);
  // Вид главной кнопки: залитая есть — заливка, иначе контур, иначе текст. По площади не взвешиваем:
  // текстовых ссылок на странице всегда больше, чем кнопок.
  const look = ['fill', 'outline', 'text'].find((l) => found.some((b) => b.look === l)) || null;
  return { found, filled, first: pair(colors[0]), second: pair(colors[1]), look };
}

function bandOf(el) {
  const h1 = el.querySelector('h1, h2, h3');
  const text = heaviest(texts(el).map((t) => [getComputedStyle(t).color, ownText(t).length]))[0] || null;
  const btn = buttonsOf(el);
  return {
    background: bgOf(el),
    text,
    heading: h1 && visible(h1) ? getComputedStyle(h1).color : null,
    button_bg: btn.first && btn.first.bg,
    button_text: btn.first && btn.first.text,
    button2_bg: btn.second && btn.second.bg,
    button2_text: btn.second && btn.second.text,
    h: rectOf(el).height,
    top: boxOf(el).y,
  };
}

// Соседние блоки одного фона — одна полоса; доля — от высоты всех блоков, верх — у первого блока полосы.
function bands(blocks) {
  const merged = [];
  for (const band of blocks.map(bandOf)) {
    const last = merged[merged.length - 1];
    if (last && last.background === band.background) {
      last.h += band.h;
      for (const k of Object.keys(band)) if (last[k] == null) last[k] = band[k];
    } else merged.push({ ...band });
  }
  const total = merged.reduce((s, b) => s + b.h, 0) || 1;
  return merged.map(({ h, ...b }) => ({ ...b, share: Math.round((h / total) * 1000) / 1000 }));
}

// Есть ли у шрифта кириллица: ширина строки шрифтом против запасного семейства.
function cyrillic(family) {
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = 'ЖЩЮЯжщюяБДФ';
  const width = (font) => {
    ctx.font = font;
    return ctx.measureText(sample).width;
  };
  return ['monospace', 'serif'].some((base) => width(`32px "${family}", ${base}`) !== width(`32px ${base}`));
}

function fontOf(elements, weightOf) {
  const stacks = heaviest(elements.map((el) => [getComputedStyle(el).fontFamily, weightOf(el)]));
  if (!stacks.length) return null;
  const stack = stacks[0];
  const same = elements.filter((el) => getComputedStyle(el).fontFamily === stack);
  const weights = heaviest(same.map((el) => [getComputedStyle(el).fontWeight, weightOf(el)]));
  const family = stack
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
  return { family, stack, weight: weights[0] || null, cyrillic: cyrillic(family) };
}

function fonts() {
  const heads = [...document.querySelectorAll('h1, h2, h3')].slice(0, LIMIT).filter(visible);
  const body = texts(document.body).filter((el) => !el.closest('h1, h2, h3, button, nav'));
  const size = (el) => num(getComputedStyle(el).fontSize);
  return {
    heading: fontOf(heads, (el) => size(el) * textOf(el, 200).length),
    body: fontOf(body, (el) => ownText(el).length),
  };
}

function firstSize(selector) {
  const el = [...document.querySelectorAll(selector)].find(visible);
  return el ? num(getComputedStyle(el).fontSize) : null;
}

function typeScale(bodyEls) {
  const sizes = heaviest(bodyEls.map((el) => [num(getComputedStyle(el).fontSize), ownText(el).length]));
  const text = sizes[0] || null;
  const small = sizes.filter((s) => text && s < text)[0] || null;
  const rows = [
    ['h1', firstSize('h1')],
    ['h2', firstSize('h2')],
    ['h3', firstSize('h3')],
    ['text', text],
    ['small', small],
  ];
  return rows.filter(([, px]) => px).map(([role, px]) => ({ role, px }));
}

function cards(blocks) {
  const group = blocks.map(cardGroup).sort((a, b) => b.length - a.length)[0] || [];
  if (!group.length) return { count: 0 };
  const first = group[0];
  const st = getComputedStyle(first);
  const sectionBg = bgOf(first.parentElement);
  const panel =
    (!transparent(st.backgroundColor) && st.backgroundColor !== sectionBg) ||
    (st.boxShadow && st.boxShadow !== 'none') ||
    num(st.borderTopWidth) >= 1;
  const img = first.querySelector('img');
  const gaps = group
    .slice(1)
    .map((el, i) => rectOf(el).left - rectOf(group[i]).right)
    .filter((g) => g >= 0);
  const aligns = heaviest(texts(first).map((t) => [getComputedStyle(t).textAlign, ownText(t).length]));
  return {
    count: group.length,
    radius: num(st.borderTopLeftRadius) || (img ? num(getComputedStyle(img).borderTopLeftRadius) : 0),
    border: num(st.borderTopWidth),
    look: panel ? 'panel' : 'flat',
    align: { start: 'left', end: 'right', left: 'left', right: 'right', center: 'center' }[aligns[0]] || null,
    gap: median(gaps),
    shadow: !!st.boxShadow && st.boxShadow !== 'none',
  };
}

function media() {
  const big = [...document.querySelectorAll('img')].slice(0, LIMIT).filter((i) => rectOf(i).width >= 200 && visible(i));
  return { count: big.length, radius: median(big.map((i) => num(getComputedStyle(i).borderTopLeftRadius))) };
}

function inputs() {
  const found = [...document.querySelectorAll(INPUTS)].slice(0, LIMIT).filter(visible);
  return { count: found.length, radius: median(found.map((i) => num(getComputedStyle(i).borderTopLeftRadius))) };
}

// Отступ секции: от верха блока до первого текста или картинки внутри.
function sectionGap(blocks) {
  const inner = (el) => {
    const top = rectOf(el).top;
    const firsts = [...el.querySelectorAll('h1, h2, h3, p, img')].slice(0, 50).filter(visible);
    return firsts.length ? Math.min(...firsts.map((f) => rectOf(f).top - top)) : null;
  };
  return median(
    blocks
      .filter((b) => rectOf(b).height > 200)
      .map(inner)
      .filter((v) => v !== null && v >= 0),
  );
}

function pageWidth() {
  const centred = [...document.querySelectorAll('body *')].slice(0, 4000).filter((el) => {
    const r = rectOf(el);
    return r.width >= 600 && r.width < VW - 20 && Math.abs(r.left - (VW - r.right)) <= 4 && r.height > 100;
  });
  return heaviest(centred.map((el) => [Math.round(rectOf(el).width / 10) * 10, rectOf(el).height]))[0] || null;
}

function motion() {
  const animated = [...document.querySelectorAll('body *')]
    .slice(0, 2000)
    .some((el) => getComputedStyle(el).animationName !== 'none');
  return animated || !!document.querySelector(MOTION);
}

// Полосы и отступы — по блокам потока: всплывающее окно и липкая шапка поверх страницы не полоса.
const blocks = topBlocks().filter((el) => !fixedEl(el));
const btn = buttonsOf(document.body);
const card = cards(blocks);
const pic = media();
const field = inputs();
const bodyEls = texts(document.body).filter((el) => !el.closest('h1, h2, h3, button, nav'));
return {
  bands: bands(blocks),
  fonts: fonts(),
  type_scale: typeScale(bodyEls),
  radius: {
    button: median(btn.filled.map((b) => buttonRadius(b.el))),
    card: card.count ? card.radius : null,
    input: field.radius,
    media: pic.radius,
  },
  border: { card: card.count ? card.border : null },
  button: { look: btn.look },
  card: { look: card.count ? card.look : null, align: card.align || null },
  spacing: { section_gap: sectionGap(blocks), card: card.gap },
  shadows: card.shadow || btn.filled.some((b) => getComputedStyle(b.el).boxShadow !== 'none'),
  width_page: pageWidth(),
  motion: motion(),
  counts: {
    blocks: blocks.length,
    buttons: btn.filled.length,
    cards: card.count,
    inputs: field.count,
    media: pic.count,
  },
};
