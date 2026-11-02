import type { PageContent } from './sections-render';

// Порядок загрузки картинок страницы (замер PageSpeed 02.11.2026: витрина мерчанта качала разом восемь исходных фото
// на 3,2 МБ — картинки скрытого меню шапки и окна поиска наравне с главной, LCP на мобильном 19 с). Секции пишут
// мерчант и агент, поэтому порядок ставит сборка, а не автор секции:
// - главная картинка — первая <img> в <main> вне <template>: loading="eager" и fetchpriority="high", браузер берёт её
//   раньше остальных;
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

interface ImgTag {
  start: number;
  end: number;
  // Где вставлять новые атрибуты: перед «>» или «/>».
  insertAt: number;
  attributes: ImgAttribute[];
  inTemplate: boolean;
}

const RAW_TEXT = ['script', 'style', 'textarea', 'title'] as const;
const SPACE = /\s/;
const NAME_END = /[\s=>/]/;

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

// Тег <img> с позиции «<»: атрибуты и место вставки новых.
function imgTagAt(html: string, start: number, inTemplate: boolean): ImgTag {
  const attributes: ImgAttribute[] = [];
  let at = start + '<img'.length;
  for (let attribute = attributeAt(html, at); attribute !== null; attribute = attributeAt(html, at)) {
    if (attribute.name !== '') attributes.push(attribute);
    at = attribute.end;
  }
  // Вставка — сразу после последнего атрибута: перед «>» или «/>», пробелы автора остаются после новых атрибутов.
  const close = html.indexOf('>', at);
  return { start, end: close === -1 ? html.length : close + 1, insertAt: at, attributes, inTemplate };
}

// Конец комментария или содержимого тега с сырым текстом (без учёта регистра); не нашли — конец строки.
function skipTo(html: string, marker: string, from: number): number {
  const pattern = new RegExp(marker.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'), 'gi');
  pattern.lastIndex = from;
  const found = pattern.exec(html);
  return found === null ? html.length : found.index + marker.length;
}

// Что стоит на позиции «<»: картинка, пропуск (комментарий, сырой текст) или шаблон.
function stepAt(html: string, at: number, depth: number): { next: number; depth: number; img?: ImgTag } {
  if (html.startsWith('<!--', at)) return { next: skipTo(html, '-->', at + 4), depth };
  const closing = html[at + 1] === '/';
  const name = tagNameAt(html, at + (closing ? 2 : 1));
  if (name === 'template') return { next: at + 1, depth: Math.max(0, depth + (closing ? -1 : 1)) };
  if (closing) return { next: at + 1, depth };
  if (RAW_TEXT.some((raw) => raw === name)) return { next: skipTo(html, `</${name}`, at + name.length + 1), depth };
  if (name !== 'img') return { next: at + 1, depth };
  const img = imgTagAt(html, at, depth > 0);
  return { next: img.end, depth, img };
}

// Все теги <img> разметки по порядку.
export function imgTags(html: string): ImgTag[] {
  const tags: ImgTag[] = [];
  let depth = 0;
  for (let at = html.indexOf('<'); at !== -1; ) {
    const step = stepAt(html, at, depth);
    depth = step.depth;
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

// Номер главной картинки в разметке секции: первая <img> вне <template>; нет — -1.
const mainImgIndex = (html: string): number => imgTags(html).findIndex((tag) => !tag.inTemplate);

// src главной картинки секции; нет атрибута — пустая строка.
function mainSrc(html: string): string {
  const tag = imgTags(html).find((candidate) => !candidate.inTemplate);
  return tag?.attributes.find((attribute) => attribute.name === 'src')?.value.trim() ?? '';
}

// Секции <main> с главной картинкой в первой секции, где она есть, и её src.
function mainSections(sections: readonly string[]): { sections: string[]; mainImage?: string } {
  const first = sections.findIndex((html) => mainImgIndex(html) !== -1);
  const rewritten = sections.map((html, index) => withImgLoading(html, index === first ? mainImgIndex(html) : -1));
  const src = first === -1 ? '' : mainSrc(sections[first] ?? '');
  return src === '' ? { sections: rewritten } : { sections: rewritten, mainImage: src };
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
