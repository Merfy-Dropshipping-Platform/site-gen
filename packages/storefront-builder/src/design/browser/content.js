// Содержимое своего сайта мерчанта (только при `owned: true`, «Да, сайт мой»): логотип, меню и по каждому блоку контура
// заголовок, текст, кнопки, карточки и крупные фото. Тело функции; перед ним подставляется blocks.js — блоки те же и в
// том же порядке, что у контура (`contour.js`), поэтому номер блока совпадает. Адреса — абсолютные, у картинок — самый
// крупный вариант из srcset. Чистит и режет по длине `design-content.ts`.
const MAX_IMAGES = 12;
const MAX_ITEMS = 12;

function abs(url) {
  try {
    return new URL(url, location.href).href;
  } catch {
    return null;
  }
}

// Самый крупный вариант картинки: по ширине из srcset, иначе currentSrc/src.
function largest(img) {
  const set = (img.getAttribute('srcset') || img.getAttribute('data-srcset') || '')
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .filter((part) => part[0])
    .map(([src, size]) => ({ src, w: parseFloat(size) || 0 }))
    .sort((a, b) => b.w - a.w);
  const src = (set[0] && set[0].src) || img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src');
  return src ? abs(src) : null;
}

function bgImage(el) {
  const m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(el).backgroundImage || '');
  return m ? abs(m[1]) : null;
}

function picturesIn(el) {
  const imgs = [...el.querySelectorAll('img')].filter((i) => rectOf(i).width >= 120 && visible(i)).map(largest);
  return [bgImage(el), ...imgs].filter(Boolean);
}

function paragraphs(el) {
  return [...el.querySelectorAll('p')]
    .filter(visible)
    .map((p) => textOf(p, 1000))
    .filter((t) => t.length > 1)
    .join('\n')
    .slice(0, 2000);
}

function buttons(el) {
  return [...el.querySelectorAll('button, a[class*="btn" i], a[class*="button" i], [role="button"]')]
    .filter(visible)
    .map((b) => textOf(b, 60))
    .filter(Boolean)
    .slice(0, 6);
}

function item(card) {
  const h = card.querySelector('h1, h2, h3, h4, h5, [class*="title" i], [class*="name" i]');
  const img = card.querySelector('img');
  return {
    heading: h ? textOf(h, 200) || null : null,
    text: paragraphs(card) || null,
    image: img ? largest(img) : bgImage(card),
  };
}

function blockContent(el, index) {
  const h = el.querySelector('h1, h2, h3, [role="heading"]');
  return {
    index,
    heading: h ? textOf(h, 300) || null : null,
    text: paragraphs(el) || null,
    buttons: buttons(el),
    items: cardGroup(el).slice(0, MAX_ITEMS).map(item),
    images: picturesIn(el).slice(0, MAX_IMAGES),
  };
}

function logo() {
  const candidates = [
    ...document.querySelectorAll('header img, [class*="logo" i] img, img[class*="logo" i], img[alt*="logo" i]'),
  ];
  const img = candidates.find(visible);
  return img ? largest(img) : null;
}

function menu() {
  const nav = document.querySelector('header nav, nav, header');
  if (!nav) return [];
  return [...nav.querySelectorAll('a[href]')]
    .filter(visible)
    .map((a) => ({ label: textOf(a, 60), href: abs(a.getAttribute('href') || '') }))
    .filter((m) => m.label && m.href)
    .slice(0, 20);
}

return { logo: logo(), menu: menu(), blocks: topBlocks().map(blockContent) };
