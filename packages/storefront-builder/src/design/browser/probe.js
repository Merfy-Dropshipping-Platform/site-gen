// Признаки страницы до снятия стиля: заголовок, сколько видимого текста, какую долю окна занимает холст (сайт на
// Canvas/WebGL), есть ли признаки защиты от ботов и какие шрифты пришли с Google Fonts. Тело функции, отдельно от
// blocks.js. Решения по признакам — таблицы `design-capture.ts`.
const VW = window.innerWidth;
const VH = window.innerHeight;

function canvasShare() {
  const area = [...document.querySelectorAll('canvas')]
    .map((c) => c.getBoundingClientRect())
    .map(
      (r) =>
        Math.max(0, Math.min(r.right, VW) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, VH) - Math.max(r.top, 0)),
    )
    .reduce((s, a) => s + a, 0);
  return Math.min(1, area / (VW * VH));
}

function googleFamilies() {
  const hrefs = [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].map((l) => l.href);
  const fromCss = [...document.styleSheets].map((s) => s.href || '').filter((h) => h.includes('fonts.googleapis.com'));
  return [...new Set([...hrefs, ...fromCss])]
    .flatMap((h) => new URL(h).searchParams.getAll('family'))
    .map((f) => f.split(':')[0].replace(/\+/g, ' ').trim())
    .filter(Boolean);
}

const text = (document.body && document.body.innerText) || '';
return {
  title: (document.title || '').trim().slice(0, 200),
  textLength: text.replace(/\s+/g, ' ').trim().length,
  canvas: canvasShare(),
  html: (document.documentElement.outerHTML || '').slice(0, 20000),
  google: googleFamilies(),
};
