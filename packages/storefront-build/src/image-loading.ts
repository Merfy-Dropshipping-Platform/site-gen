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
// loading и fetchpriority решает только платформа: в той витрине автор сам поставил loading="eager" восемнадцати
// скрытым картинкам. Свои значения автора снимаются, проверка кода секции предупреждает о них (problem-info.ts,
// img-loading). Разбор — по тегам, без DOM: в <script>, <style>, <textarea>, <title> и комментариях <img> не ищется.

interface ImgAttribute {
  name: string;
  value: string;
  // Начало атрибута с пробелом перед ним и конец — чтобы вырезать его целиком.
  start: number;
  end: number;
}

// Разобранный открывающий тег.
interface TagParse {
  end: number;
  // Где вставлять новые атрибуты: перед «>» или «/>».
  insertAt: number;
  attributes: ImgAttribute[];
  selfClosing: boolean;
}

interface ImgTag extends TagParse {
  start: number;
  inTemplate: boolean;
  // Скрыта сама или внутри скрытого предка.
  hidden: boolean;
}

// Открытый элемент разметки: нужен, чтобы знать, что <img> лежит в шаблоне или под скрытым предком.
interface OpenElement {
  name: string;
  hidden: boolean;
}

type OpenElements = readonly OpenElement[];

const RAW_TEXT = ['script', 'style', 'textarea', 'title'] as const;
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const SPACE = /\s/;
const NAME_END = /[\s=>/]/;
const INLINE_HIDDEN = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i;

const valueOf = (attributes: readonly ImgAttribute[], name: string): string =>
  attributes.find((attribute) => attribute.name === name)?.value.trim() ?? '';
const hasAttribute = (attributes: readonly ImgAttribute[], name: string): boolean =>
  attributes.some((attribute) => attribute.name === name);

// Признаки скрытости элемента, которые сборка видит надёжно: по имени и атрибутам. Классы (hidden, md:hidden) и
// таблицы стилей сюда не входят — их условие знает только браузер.
const HIDING_RULES: readonly ((name: string, attributes: readonly ImgAttribute[]) => boolean)[] = [
  (_name, attributes) => hasAttribute(attributes, 'hidden'),
  (_name, attributes) => INLINE_HIDDEN.test(valueOf(attributes, 'style')),
  (name) => name === 'noscript',
  (name, attributes) => name === 'dialog' && !hasAttribute(attributes, 'open'),
];

const isHiddenElement = (name: string, attributes: readonly ImgAttribute[]): boolean =>
  HIDING_RULES.some((rule) => rule(name, attributes));

const isSpace = (char: string | undefined): boolean => char !== undefined && SPACE.test(char);

// Имя тега с позиции после «<» или «</» в нижнем регистре.
function tagNameAt(html: string, from: number): string {
  let end = from;
  while (end < html.length && /[a-zA-Z0-9-]/.test(html.charAt(end))) end += 1;
  return html.slice(from, end).toLowerCase();
}

// Значение атрибута с позиции после «=»: в кавычках или до пробела и «>». Возврат — значение и позиция после него.
function valueAt(html: string, from: number): { value: string; end: number } {
  let start = from;
  while (isSpace(html[start])) start += 1;
  const quote = html.charAt(start);
  if (quote === '"' || quote === "'") {
    const close = html.indexOf(quote, start + 1);
    const end = close === -1 ? html.length : close + 1;
    return { value: html.slice(start + 1, end - 1), end };
  }
  let end = start;
  while (end < html.length && !isSpace(html[end]) && html[end] !== '>') end += 1;
  return { value: html.slice(start, end), end };
}

// Один атрибут с позиции from (там пробел или начало имени). null — дошли до конца тега.
function attributeAt(html: string, from: number): ImgAttribute | null {
  let start = from;
  while (isSpace(html[start])) start += 1;
  if (start >= html.length || html[start] === '>' || html.startsWith('/>', start)) return null;
  let end = start;
  while (end < html.length && !NAME_END.test(html.charAt(end))) end += 1;
  // Одинокий «/» внутри тега — не атрибут: шаг дальше.
  if (end === start) return { name: '', value: '', start: from, end: start + 1 };
  const name = html.slice(start, end).toLowerCase();
  let next = end;
  while (isSpace(html[next])) next += 1;
  if (html[next] !== '=') return { name, value: '', start: from, end };
  const parsed = valueAt(html, next + 1);
  return { name, value: parsed.value, start: from, end: parsed.end };
}

// Открывающий тег с позиции «<»: атрибуты и место вставки новых.
function tagAt(html: string, start: number, name: string): TagParse {
  const attributes: ImgAttribute[] = [];
  let at = start + 1 + name.length;
  for (let attribute = attributeAt(html, at); attribute !== null; attribute = attributeAt(html, at)) {
    if (attribute.name !== '') attributes.push(attribute);
    at = attribute.end;
  }
  // Вставка — сразу после последнего атрибута: перед «>» или «/>», пробелы автора остаются после новых атрибутов.
  const close = html.indexOf('>', at);
  const end = close === -1 ? html.length : close + 1;
  return { end, insertAt: at, attributes, selfClosing: html.slice(at, end).includes('/') };
}

// Конец комментария или содержимого тега с сырым текстом (без учёта регистра); не нашли — конец строки.
function skipTo(html: string, marker: string, from: number): number {
  const pattern = new RegExp(marker.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'), 'gi');
  pattern.lastIndex = from;
  const found = pattern.exec(html);
  return found === null ? html.length : found.index + marker.length;
}

// Закрывающий тег снимает элемент и всё, что открыто внутри него; без пары — игнорируется.
function closeElement(open: OpenElements, name: string): OpenElements {
  const index = open.map((element) => element.name).lastIndexOf(name);
  return index === -1 ? open : open.slice(0, index);
}

// Открытые элементы после открывающего тега: пустые элементы и самозакрытые стек не меняют.
function openElement(open: OpenElements, name: string, tag: TagParse): OpenElements {
  if (VOID_ELEMENTS.has(name) || tag.selfClosing) return open;
  return [...open, { name, hidden: isHiddenElement(name, tag.attributes) }];
}

function imgTagOf(start: number, tag: TagParse, open: OpenElements): ImgTag {
  const own = isHiddenElement('img', tag.attributes);
  return {
    ...tag,
    start,
    inTemplate: open.some((element) => element.name === 'template'),
    hidden: own || open.some((element) => element.hidden),
  };
}

interface Step {
  next: number;
  open: OpenElements;
  img?: ImgTag;
}

// Что стоит на позиции «<»: картинка, пропуск (комментарий, сырой текст) или другой тег — он меняет открытые элементы.
function stepAt(html: string, at: number, open: OpenElements): Step {
  if (html.startsWith('<!--', at)) return { next: skipTo(html, '-->', at + 4), open };
  const closing = html[at + 1] === '/';
  const name = tagNameAt(html, at + (closing ? 2 : 1));
  if (name === '') return { next: at + 1, open };
  if (closing) return { next: at + 1, open: closeElement(open, name) };
  if (RAW_TEXT.some((raw) => raw === name)) return { next: skipTo(html, `</${name}`, at + name.length + 1), open };
  const tag = tagAt(html, at, name);
  const step = { next: tag.end, open: openElement(open, name, tag) };
  return name === 'img' ? { ...step, img: imgTagOf(at, tag, open) } : step;
}

// Все теги <img> разметки по порядку.
export function imgTags(html: string): ImgTag[] {
  const tags: ImgTag[] = [];
  let open: OpenElements = [];
  for (let at = html.indexOf('<'); at !== -1; ) {
    const step = stepAt(html, at, open);
    open = step.open;
    if (step.img !== undefined) tags.push(step.img);
    at = html.indexOf('<', step.next);
  }
  return tags;
}

// Атрибуты, которые ставит платформа: свои значения автора у них снимаются.
const PLATFORM_ATTRIBUTES: readonly string[] = ['loading', 'fetchpriority'];

// Новый вид тега: свои loading и fetchpriority автора снимаются; главной — eager и high, остальным — lazy.
// decoding="async" — всем без своего decoding.
function rewriteImg(html: string, tag: ImgTag, main: boolean): string {
  const dropped = tag.attributes.filter((attribute) => PLATFORM_ATTRIBUTES.includes(attribute.name));
  let head = '';
  let at = tag.start;
  for (const attribute of dropped) {
    head += html.slice(at, attribute.start);
    at = attribute.end;
  }
  head += html.slice(at, tag.insertAt);
  const decoding = tag.attributes.some((attribute) => attribute.name === 'decoding') ? '' : ' decoding="async"';
  const loading = main ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"';
  return `${head}${loading}${decoding}${html.slice(tag.insertAt, tag.end)}`;
}

// Разметка с атрибутами загрузки у каждой <img>; mainIndex — номер главной картинки среди тегов этой разметки
// (-1 — её здесь нет).
export function withImgLoading(html: string, mainIndex = -1): string {
  const tags = imgTags(html);
  if (tags.length === 0) return html;
  let out = '';
  let at = 0;
  for (const [index, tag] of tags.entries()) {
    out += html.slice(at, tag.start) + rewriteImg(html, tag, index === mainIndex);
    at = tag.end;
  }
  return out + html.slice(at);
}

// Годится в главные: вне <template>, видима и с адресом — src или srcset.
const isMainCandidate = (tag: ImgTag): boolean =>
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
function preloadLink(tag: ImgTag): string {
  const hasSet = valueOf(tag.attributes, 'srcset') !== '';
  const attributes = PRELOAD_FROM_IMG.filter(([link]) => hasSet || link !== 'imagesizes')
    .map(([link, img]) => ({ link, value: valueOf(tag.attributes, img) }))
    .filter(({ value }) => value !== '')
    .map(({ link, value }) => ` ${link}="${quoted(value)}"`);
  return `<link rel="preload" as="image"${attributes.join('')} fetchpriority="high">`;
}

type MainImageFields = Pick<PageContent, 'mainImage' | 'mainImageLink'>;

// Поля главной картинки страницы: src — для preconnect (нет src — только srcset — поля нет), ссылка предзагрузки.
function mainImageFields(tag: ImgTag | undefined): MainImageFields {
  if (tag === undefined) return {};
  const src = valueOf(tag.attributes, 'src');
  return { ...(src === '' ? {} : { mainImage: src }), mainImageLink: preloadLink(tag) };
}

// Секции <main> с главной картинкой в первой секции, где она есть, и поля главной картинки страницы.
function mainSections(sections: readonly string[]): { sections: string[] } & MainImageFields {
  const first = sections.findIndex((html) => mainImgIndex(html) !== -1);
  const rewritten = sections.map((html, index) => withImgLoading(html, index === first ? mainImgIndex(html) : -1));
  const main = first === -1 ? undefined : imgTags(sections[first] ?? '').find(isMainCandidate);
  return { sections: rewritten, ...mainImageFields(main) };
}

// Разметка страницы с порядком загрузки картинок: шапка, подвал и окна — только ленивые, главная — в <main>.
export function withImageLoading(content: PageContent): PageContent {
  const lazy = (list: readonly string[] | undefined): string[] | undefined => list?.map((html) => withImgLoading(html));
  return {
    ...content,
    ...mainSections(content.sections),
    ...(content.header === undefined ? {} : { header: lazy(content.header) }),
    ...(content.footer === undefined ? {} : { footer: lazy(content.footer) }),
    ...(content.overlay === undefined ? {} : { overlay: lazy(content.overlay) }),
  };
}
