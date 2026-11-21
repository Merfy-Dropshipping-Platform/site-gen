// Контур DOM (переходник `dom` и опора для `designlang`): блоки верхнего уровня с рамкой, тегом, заголовком, карточками,
// картинками, формой, видео, слайдами, раскладкой и колонками. Тело функции; перед ним подставляется blocks.js. Роль
// здесь не решается — её даёт таблица правил `design-outline.ts`. Перенесено из прототипа Визи `vizi/design/js/contour.js`.
const SLIDES =
  '.swiper-slide:not(.swiper-slide-duplicate), .slick-slide:not(.slick-cloned), .t-slds__item,' +
  ' .splide__slide:not(.splide__slide--clone), .flickity-slider > *, .carousel-item, [data-slide], [role="tabpanel"][aria-roledescription="slide"]';
const VIDEO = 'video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="rutube"], iframe[src*="vk.com/video"]';
const FORM = 'form, input:not([type="hidden"]), textarea, select';
const PRICE = /\d[\d\s]*[.,]?\d*\s?(₽|руб|р\.|\$|€|£|USD|RUB)|(\$|€|£)\s?\d/i;

function bigImages(el) {
  return [...el.querySelectorAll('img, picture > source + img, video[poster]')].filter((i) => {
    const r = rectOf(i);
    return r.width >= 40 && r.height >= 40;
  });
}

function images(el) {
  const own = getComputedStyle(el).backgroundImage.includes('url(') ? 1 : 0;
  return own + bigImages(el).length;
}

function heading(el) {
  const h = el.querySelector('h1, h2, h3, [role="heading"]');
  return h ? textOf(h, 120) || null : null;
}

// Колонки — сколько карточек группы стоит в первом ряду (верх в пределах 8 px).
function columns(group) {
  if (!group.length) return 1;
  const top = rectOf(group[0]).top;
  return group.filter((k) => Math.abs(rectOf(k).top - top) <= 8).length;
}

// Сторона самой крупной картинки (от трети ширины блока) относительно текста.
function layout(el, group) {
  if (group.length >= 3) return 'grid';
  const box = rectOf(el);
  const pic = bigImages(el).sort((a, b) => rectOf(b).width * rectOf(b).height - rectOf(a).width * rectOf(a).height)[0];
  const h = el.querySelector('h1, h2, h3, p');
  const centred = h && getComputedStyle(h).textAlign === 'center';
  if (!pic || rectOf(pic).width < box.width / 3 || rectOf(pic).width > box.width * 0.85)
    return centred ? 'centered' : 'unknown';
  const picMid = rectOf(pic).left + rectOf(pic).width / 2;
  return picMid < box.left + box.width / 2 ? 'image-left' : 'image-right';
}

function prices(el) {
  return [...el.querySelectorAll('span, div, p, b, strong')]
    .slice(0, 800)
    .filter((n) => n.children.length === 0 && PRICE.test(n.textContent || '')).length;
}

const page = topBlocks();
return {
  height: document.documentElement.scrollHeight,
  blocks: page.map((el) => {
    const group = cardGroup(el);
    return {
      tag: el.tagName.toLowerCase(),
      hint: [...el.classList].slice(0, 3).join(' ').slice(0, 60),
      id: (el.id || '').slice(0, 40),
      box: boxOf(el),
      heading: heading(el),
      cards: group.length,
      images: images(el),
      form: !!el.querySelector(FORM),
      email: !!el.querySelector('input[type="email"], input[name*="mail" i]'),
      fields: [
        ...el.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
        ),
      ].filter(visible).length,
      textarea: [...el.querySelectorAll('textarea')].some(visible),
      video: !!el.querySelector(VIDEO),
      slides: el.querySelectorAll(SLIDES).length,
      fixed: fixedEl(el),
      prices: prices(el),
      links: el.querySelectorAll('a[href]').length,
      details: el.querySelectorAll('details, [aria-expanded]').length,
      text: textOf(el, 400),
      layout: layout(el, group),
      columns: columns(group),
      iframeMap: !!el.querySelector('iframe[src*="map"], [class*="map" i] canvas, ymaps, [class*="ymaps"]'),
    };
  }),
};
