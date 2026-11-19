// Разбор открывающих тегов готовой разметки секций — по тегам, без DOM. Общий для порядка загрузки картинок
// (image-loading.ts) и единственного h1 страницы (page-h1.ts): в <script>, <style>, <textarea>, <title> и комментариях
// теги не ищутся; про каждый тег известно, лежит ли он в <template> и скрыт ли он сам или предок.

export interface TagAttribute {
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
  attributes: TagAttribute[];
  selfClosing: boolean;
}

export interface HtmlTag extends TagParse {
  // Имя тега в нижнем регистре.
  name: string;
  start: number;
  inTemplate: boolean;
  // Скрыт сам или внутри скрытого предка.
  hidden: boolean;
}

// Открытый элемент разметки: нужен, чтобы знать, что тег лежит в шаблоне или под скрытым предком.
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

export const valueOf = (attributes: readonly TagAttribute[], name: string): string =>
  attributes.find((attribute) => attribute.name === name)?.value.trim() ?? '';
const hasAttribute = (attributes: readonly TagAttribute[], name: string): boolean =>
  attributes.some((attribute) => attribute.name === name);

// Признаки скрытости элемента, которые сборка видит надёжно: по имени и атрибутам. Классы (hidden, md:hidden) и
// таблицы стилей сюда не входят — их условие знает только браузер.
const HIDING_RULES: readonly ((name: string, attributes: readonly TagAttribute[]) => boolean)[] = [
  (_name, attributes) => hasAttribute(attributes, 'hidden'),
  (_name, attributes) => INLINE_HIDDEN.test(valueOf(attributes, 'style')),
  (name) => name === 'noscript',
  (name, attributes) => name === 'dialog' && !hasAttribute(attributes, 'open'),
];

const isHiddenElement = (name: string, attributes: readonly TagAttribute[]): boolean =>
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
function attributeAt(html: string, from: number): TagAttribute | null {
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
  const attributes: TagAttribute[] = [];
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

function htmlTagOf(start: number, name: string, tag: TagParse, open: OpenElements): HtmlTag {
  const own = isHiddenElement(name, tag.attributes);
  return {
    ...tag,
    name,
    start,
    inTemplate: open.some((element) => element.name === 'template'),
    hidden: own || open.some((element) => element.hidden),
  };
}

interface Step {
  next: number;
  open: OpenElements;
  found?: HtmlTag;
}

// Что стоит на позиции «<»: нужный тег, пропуск (комментарий, сырой текст) или другой тег — он меняет открытые элементы.
function stepAt(html: string, at: number, open: OpenElements, names: readonly string[]): Step {
  if (html.startsWith('<!--', at)) return { next: skipTo(html, '-->', at + 4), open };
  const closing = html[at + 1] === '/';
  const name = tagNameAt(html, at + (closing ? 2 : 1));
  if (name === '') return { next: at + 1, open };
  if (closing) return { next: at + 1, open: closeElement(open, name) };
  if (RAW_TEXT.some((raw) => raw === name)) return { next: skipTo(html, `</${name}`, at + name.length + 1), open };
  const tag = tagAt(html, at, name);
  const step = { next: tag.end, open: openElement(open, name, tag) };
  return names.includes(name) ? { ...step, found: htmlTagOf(at, name, tag, open) } : step;
}

// Все открывающие теги с данными именами (в нижнем регистре) по порядку.
export function tagsNamed(html: string, names: readonly string[]): HtmlTag[] {
  const tags: HtmlTag[] = [];
  let open: OpenElements = [];
  for (let at = html.indexOf('<'); at !== -1; ) {
    const step = stepAt(html, at, open, names);
    open = step.open;
    if (step.found !== undefined) tags.push(step.found);
    at = html.indexOf('<', step.next);
  }
  return tags;
}
