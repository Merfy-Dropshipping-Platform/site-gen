import { tagsNamed, valueOf, type HtmlTag, type TagAttribute } from './html-tags';
import type { PageContent } from './sections-render';

// Порядок загрузки картинок страницы (замер PageSpeed 02.11.2026: витрина мерчанта качала разом восемь исходных фото
// на 3,2 МБ — картинки скрытого меню шапки и окна поиска наравне с главной, LCP на мобильном 19 с). Секции пишут
// мерчант и агент, поэтому порядок ставит сборка, а не автор секции:
// - главная картинка — первая <img> в <main> вне <template>, у которой есть src или srcset и которая не скрыта (hidden,
//   display:none и visibility:hidden в style у неё или предка, <noscript>, <dialog> без open): loading="eager" и
//   fetchpriority="high", браузер берёт её раньше остальных; подходящей нет — высокого приоритета нет ни у кого (замер
//   на dev 19.11.2026: главной считалась пустая скрытая <img> секции расширения, а видимая ниже становилась lazy).
//   К главной в <head> — <link rel="preload" as="image">;
// - остальные <img> — loading="lazy": картинки меню, поиска и окон не качаются, пока их не покажут;
// - у каждой <img> без своего decoding — decoding="async".
// Шаблон главнее сборки (19.11.2026: LCP каталога — вторая карточка сетки, а она lazy, и автор секции не мог это
// исправить): явный loading="eager" или loading="lazy" у <img> остаётся как есть, сборка ставит loading только там,
// где его нет или значение чужое. fetchpriority — только платформа: «high» у одной главной картинки, свой fetchpriority
// автора снимается, проверка кода секции предупреждает о нём (problem-info.ts, img-loading). Разбор — по тегам,
// без DOM (html-tags.ts).
// Явный eager от автора — только в первом экране (замер 20.11.2026: четыре eager-карточки «Коллекции» под hero качались
// вместе с ним, LCP главной 8,1 с вместо 3,2 с): сохраняется в секциях до конца той, где стоит главная картинка, и в её
// самой. В секциях ниже, в подвале и окнах eager автора становится lazy. Главной нет — правило «шаблон главнее» как было.

// Все теги <img> разметки по порядку.
export const imgTags = (html: string): HtmlTag[] => tagsNamed(html, ['img']);

// Значения loading, которые автор вправе выбрать сам.
const AUTHOR_LOADING: readonly string[] = ['eager', 'lazy'];

// Свой loading автора, который сборка оставляет: eager или lazy; eager ниже первого экрана не остаётся. Нет — ''.
function keptLoading(tag: HtmlTag, belowFirstScreen: boolean): string {
  const value = valueOf(tag.attributes, 'loading').toLowerCase();
  if (!AUTHOR_LOADING.includes(value)) return '';
  return belowFirstScreen && value === 'eager' ? '' : value;
}

// Атрибуты, которые сборка снимает с тега: fetchpriority — всегда, loading — если автор его не оставляет.
const droppedAttributes = (tag: HtmlTag, below: boolean): TagAttribute[] =>
  tag.attributes.filter(
    (attribute) =>
      attribute.name === 'fetchpriority' || (attribute.name === 'loading' && keptLoading(tag, below) === ''),
  );

// loading, который ставит сборка: нет своего у автора — главной eager, остальным lazy.
const platformLoading = (tag: HtmlTag, main: boolean, below: boolean): string => {
  if (keptLoading(tag, below) !== '') return '';
  return main ? ' loading="eager"' : ' loading="lazy"';
};

// Новый вид тега: чужие loading и fetchpriority сняты, главной добавлен fetchpriority="high", decoding="async" —
// всем без своего decoding.
function rewriteImg(html: string, tag: HtmlTag, main: boolean, below: boolean): string {
  let head = '';
  let at = tag.start;
  for (const attribute of droppedAttributes(tag, below)) {
    head += html.slice(at, attribute.start);
    at = attribute.end;
  }
  head += html.slice(at, tag.insertAt);
  const decoding = tag.attributes.some((attribute) => attribute.name === 'decoding') ? '' : ' decoding="async"';
  const priority = main ? ' fetchpriority="high"' : '';
  return `${head}${platformLoading(tag, main, below)}${priority}${decoding}${html.slice(tag.insertAt, tag.end)}`;
}

// Разметка с атрибутами загрузки у каждой <img>; mainIndex — номер главной картинки среди тегов этой разметки
// (-1 — её здесь нет); belowFirstScreen — разметка ниже секции с главной картинкой: eager автора здесь станет lazy.
export function withImgLoading(html: string, mainIndex = -1, belowFirstScreen = false): string {
  const tags = imgTags(html);
  if (tags.length === 0) return html;
  let out = '';
  let at = 0;
  for (const [index, tag] of tags.entries()) {
    out += html.slice(at, tag.start) + rewriteImg(html, tag, index === mainIndex, belowFirstScreen);
    at = tag.end;
  }
  return out + html.slice(at);
}

// Годится в главные: вне <template>, видима и с адресом — src или srcset.
const isMainCandidate = (tag: HtmlTag): boolean =>
  !tag.inTemplate && !tag.hidden && (valueOf(tag.attributes, 'src') !== '' || valueOf(tag.attributes, 'srcset') !== '');

// Номер главной картинки в разметке секции — первая подходящая; нет — -1.
const mainImgIndex = (html: string): number => imgTags(html).findIndex(isMainCandidate);

// Атрибуты <link rel="preload" as="image"> из атрибутов <img>: адрес, набор адресов и размеры. Значения — как в
// разметке автора (уже с экранированием), только кавычка заменяется.
const PRELOAD_FROM_IMG = [
  ['href', 'src'],
  ['imagesrcset', 'srcset'],
  ['imagesizes', 'sizes'],
] as const;

const quoted = (value: string): string => value.replace(/"/g, '&quot;');

// Предзагрузка главной картинки для <head>. sizes без srcset ничего не значит — не переносится.
function preloadLink(tag: HtmlTag): string {
  const hasSet = valueOf(tag.attributes, 'srcset') !== '';
  const attributes = PRELOAD_FROM_IMG.filter(([link]) => hasSet || link !== 'imagesizes')
    .map(([link, img]) => ({ link, value: valueOf(tag.attributes, img) }))
    .filter(({ value }) => value !== '')
    .map(({ link, value }) => ` ${link}="${quoted(value)}"`);
  return `<link rel="preload" as="image"${attributes.join('')} fetchpriority="high">`;
}

type MainImageFields = Pick<PageContent, 'mainImage' | 'mainImageLink'>;

// Поля главной картинки страницы: src — для preconnect (нет src — только srcset — поля нет), ссылка предзагрузки.
function mainImageFields(tag: HtmlTag | undefined): MainImageFields {
  if (tag === undefined) return {};
  const src = valueOf(tag.attributes, 'src');
  return { ...(src === '' ? {} : { mainImage: src }), mainImageLink: preloadLink(tag) };
}

// Секции <main> с главной картинкой в первой секции, где она есть, и поля главной картинки страницы.
function mainSections(sections: readonly string[]): { sections: string[] } & MainImageFields {
  const first = sections.findIndex((html) => mainImgIndex(html) !== -1);
  const rewritten = sections.map((html, index) =>
    withImgLoading(html, index === first ? mainImgIndex(html) : -1, first !== -1 && index > first),
  );
  const main = first === -1 ? undefined : imgTags(sections[first] ?? '').find(isMainCandidate);
  return { sections: rewritten, ...mainImageFields(main) };
}

// Разметка страницы с порядком загрузки картинок: шапка, подвал и окна — только ленивые, главная — в <main>. Шапка
// выше первого экрана — её eager остаётся; подвал и окна ниже — их eager снимается, если главная картинка есть.
export function withImageLoading(content: PageContent): PageContent {
  const main = mainSections(content.sections);
  const hasMain = main.mainImageLink !== undefined;
  const lazy = (list: readonly string[] | undefined, below: boolean): string[] | undefined =>
    list?.map((html) => withImgLoading(html, -1, below));
  return {
    ...content,
    ...main,
    ...(content.header === undefined ? {} : { header: lazy(content.header, false) }),
    ...(content.footer === undefined ? {} : { footer: lazy(content.footer, hasMain) }),
    ...(content.overlay === undefined ? {} : { overlay: lazy(content.overlay, hasMain) }),
  };
}
