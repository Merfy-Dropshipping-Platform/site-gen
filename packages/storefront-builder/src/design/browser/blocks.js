// Общее для контура, своего скрипта стиля и содержимого своего сайта: видимые блоки верхнего уровня страницы.
// Подставляется перед телом каждого скрипта (`design-capture.ts`). Перенесено из прототипа Визи `vizi/design/js/blocks.js`.
// Блок — широкий (от половины окна) видимый элемент. Обёртки с одним широким ребёнком
// раскрываются; высокие (больше полутора окон) делятся на детей: так `main` распадается на секции,
// а короткая секция остаётся целой.
const VW = window.innerWidth;
const VH = window.innerHeight;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);
const MAX_DEPTH = 12;
const MIN_BLOCK = 24;

function rectOf(el) {
  return el.getBoundingClientRect();
}

function visible(el) {
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
  const r = rectOf(el);
  return r.width > 0 && r.height > 0;
}

function boxOf(el) {
  const r = rectOf(el);
  return {
    x: Math.round(r.left + window.scrollX),
    y: Math.round(r.top + window.scrollY),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

function wideKids(el) {
  return [...el.children].filter(
    (k) => !SKIP.has(k.tagName) && visible(k) && rectOf(k).width >= VW * 0.5 && rectOf(k).height >= 8,
  );
}

const MIN_SECTION = 120; // px: ниже — строка списка (вопрос FAQ, пункт меню), а не секция

function tall(el) {
  return el === document.body || rectOf(el).height > VH * 1.5;
}

// Делим только на секции: хотя бы половина широких детей — высотой с секцию.
function sections(kids) {
  return kids.filter((k) => rectOf(k).height >= MIN_SECTION).length * 2 >= kids.length;
}

function split(el, depth) {
  const kids = wideKids(el);
  if (depth > MAX_DEPTH || kids.length === 0) return [el];
  if (kids.length === 1) return split(kids[0], depth + 1);
  if (!tall(el) || !sections(kids)) return [el];
  return kids.flatMap((k) => (tall(k) ? split(k, depth + 1) : [k]));
}

function fixedEl(el) {
  return ['fixed', 'sticky'].includes(getComputedStyle(el).position);
}

function topBlocks() {
  return split(document.body, 0)
    .filter((el) => rectOf(el).height >= MIN_BLOCK)
    .sort((a, b) => boxOf(a).y - boxOf(b).y);
}

function textOf(el, limit) {
  return (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

// Карточки: самая большая группа одинаковых соседей (тег + классы) с картинкой или ссылкой внутри.
function cardGroup(el) {
  let best = [];
  const nodes = [el, ...el.querySelectorAll('*')].slice(0, 3000);
  for (const node of nodes) {
    if (node.children.length < 3) continue;
    const groups = new Map();
    for (const k of node.children) {
      if (rectOf(k).width <= 0 || !k.querySelector('img,picture,a')) continue;
      const key = k.tagName + '.' + [...k.classList].sort().slice(0, 3).join('.');
      groups.set(key, [...(groups.get(key) || []), k]);
    }
    for (const group of groups.values()) if (group.length > best.length) best = group;
  }
  return best.length >= 3 ? best : [];
}
