// Семантика страницы по готовому HTML, без браузера (место `html`). Готовый инструмент — html-validate (MIT): заголовки,
// пустые заголовки, role вместо тега, кнопки и ссылки без текста, картинки без alt. Плюс своё правило «фото товара без
// alt»: пустой alt для html-validate законен (картинка для красоты), а для поиска по картинкам фото товара без описания
// не найдётся. HTML — тот, что уходит поисковику: исходник страницы, а не DOM после скриптов, поэтому видны и заголовки
// в закрытых окнах, которые axe в браузере пропускает (прогон 16.11 на главной nova).
import { HtmlValidate, Parser, StaticConfigLoader, type HtmlElement, type Message } from 'html-validate';
import { grouped, type CheckFinding, type FindingDraft } from '../finding';

// Правила html-validate. Важность в конфиге — только чтобы правило работало; свою ставит `LEVEL`.
const RULES = {
  'heading-level': 'error',
  'empty-heading': 'error',
  'prefer-native-element': 'error',
  'text-content': 'error',
  'unique-landmark': 'error',
  'wcag/h37': 'error',
  'wcag/h30': 'error',
} as const;

// Семантика публикацию не блокирует (решение владельца 16.11): всё — предупреждения, агент чинит сам.
const LEVEL = 'warning' as const;

const validator = new HtmlValidate(new StaticConfigLoader({ rules: RULES }));

const tagOf = (element: HtmlElement | null): string => element?.tagName ?? 'элемент';

// Порядок заголовков: уровни html-validate пишет в тексте сообщения.
function headingLevelText(message: string): string {
  const initial = /Initial heading level must be <h(\d)> but got <h(\d)>/.exec(message);
  if (initial) return `Первый заголовок страницы — h${initial[2]} · главный заголовок страницы делай h1`;
  const jump = /expected <h(\d)> but got <h(\d)>/.exec(message);
  if (jump)
    return `Уровень заголовка скачет: ждали h${jump[1]}, стоит h${jump[2]} · уровни идут по порядку, без пропусков`;
  if (/Multiple <h1>/.test(message)) return 'Второй h1 на странице · h1 один на страницу, остальные — h2';
  return `Порядок заголовков: ${message}`;
}

// Пустой заголовок. `data-ref` — текст ставит скрипт секции в браузере: в HTML, который читает поисковик, он пустой.
function emptyHeadingText(element: HtmlElement | null): string {
  const tag = tagOf(element);
  return element?.hasAttribute('data-ref')
    ? `Пустой ${tag} в HTML — текст ставит скрипт секции · поисковик видит пустой заголовок: выведи текст в шаблоне`
    : `Пустой ${tag} · заполни текст или убери заголовок`;
}

// «что не так · как починить» по сообщению правила.
function textOf(message: Message, element: HtmlElement | null): string {
  const tag = tagOf(element);
  switch (message.ruleId) {
    case 'heading-level':
      return headingLevelText(message.message);
    case 'empty-heading':
      return emptyHeadingText(element);
    case 'prefer-native-element': {
      const native = /native <(\w+)>/.exec(message.message)?.[1];
      return native ? `role вместо тега · используй <${native}>` : `role вместо тега · ${message.message}`;
    }
    case 'text-content':
      return `${tag} без текста · добавь текст или aria-label`;
    case 'unique-landmark':
      return `Несколько ${tag} без своих имён · дай каждому aria-label`;
    case 'wcag/h37':
      return 'Картинка без alt · добавь alt (пустой alt="" — если картинка только для красоты)';
    case 'wcag/h30':
      return 'Ссылка без текста · добавь текст или aria-label';
    default:
      return message.message;
  }
}

// Где на странице, словами: тег и начало текста, у картинки — имя файла.
function whereOf(element: HtmlElement | null): string {
  if (element === null) return 'страница';
  if (element.tagName === 'img') {
    const src = element.getAttributeValue('src') ?? '';
    const file = src.split(/[?#]/)[0]?.split('/').pop() ?? '';
    return file ? `img ${file}` : 'img';
  }
  const text = element.textContent.replace(/\s+/g, ' ').trim();
  return text ? `${element.tagName} «${text.length > 40 ? `${text.slice(0, 40)}…` : text}»` : element.tagName;
}

function sectionOf(element: HtmlElement | null): string | null {
  for (let at = element; at !== null; at = at.parent) {
    const id = at.getAttributeValue('data-section-id');
    if (id) return id;
  }
  return null;
}

// Фото товара: картинка внутри ссылки на товар или внутри карточки с `data-product-id`.
function isProductPhoto(image: HtmlElement): boolean {
  for (let at = image.parent; at !== null; at = at.parent) {
    if (at.hasAttribute('data-product-id')) return true;
    if (at.tagName === 'a' && /(^|\/)product\//.test(at.getAttributeValue('href') ?? '')) return true;
  }
  return false;
}

// Внутри скрытого (`hidden` у элемента или предка): другой вид той же страницы — хаб кабинета, детали заказа. Его
// заголовок не рисуется и в дереве доступности его нет, поэтому порядок заголовков считается без него (18.11); пустые
// заголовки и тексты ссылок в скрытом по-прежнему находятся — вид покажут.
function insideHidden(element: HtmlElement | null): boolean {
  for (let at = element; at !== null; at = at.parent) if (at.hasAttribute('hidden')) return true;
  return false;
}

// Своё правило: у фото товара alt стоит, но пустой (без alt вовсе — уже `wcag/h37`).
function productPhotosWithoutAlt(root: HtmlElement): FindingDraft[] {
  return root
    .querySelectorAll('img')
    .filter((image) => image.hasAttribute('alt') && (image.getAttributeValue('alt') ?? '').trim() === '')
    .filter(isProductPhoto)
    .map((image) => ({
      place: 'html',
      check: 'semantic',
      rule: 'product-photo-alt',
      level: LEVEL,
      section: sectionOf(image),
      where: whereOf(image),
      text: 'Фото товара без alt · alt — название товара: так фото найдут в поиске по картинкам',
    }));
}

// Содержимое <template> браузер не рисует, поисковик не читает: это заготовки строк, которые скрипт секции клонирует
// (способы доставки, пункты выдачи). В проверку идёт пустой шаблон верхнего уровня; вложенные уходят вместе с ним.
const TEMPLATE_TAG = /<(\/?)template\b[^>]*>/gi;

export function withoutTemplates(html: string): string {
  let out = '';
  let depth = 0;
  let last = 0;
  for (const match of html.matchAll(TEMPLATE_TAG)) {
    if (depth === 0) out += html.slice(last, match.index);
    const closing = match[1] === '/';
    if (!closing && depth++ === 0) out += match[0];
    if (closing && depth > 0 && --depth === 0) out += match[0];
    last = match.index + match[0].length;
  }
  return depth === 0 ? out + html.slice(last) : out;
}

// Находки семантики по HTML страницы целиком; какие секции показывать — решает вызывающий (`inSections`).
export async function semanticHtml(source: string): Promise<CheckFinding[]> {
  const html = withoutTemplates(source);
  const report = await validator.validateString(html, 'page.html');
  // То же дерево, что у правил: селектор сообщения находит в нём элемент, от него — обёртка секции.
  const root = new Parser(await validator.getConfigFor('page.html')).parseHtml(html);
  const fromRules = report.results
    .flatMap((result) => result.messages)
    .flatMap((message) => {
      const element = message.selector ? root.querySelector(message.selector) : null;
      if (message.ruleId === 'heading-level' && insideHidden(element)) return [];
      return {
        place: 'html' as const,
        check: 'semantic',
        rule: message.ruleId,
        level: LEVEL,
        section: sectionOf(element),
        where: whereOf(element),
        text: textOf(message, element),
      };
    });
  return grouped([...fromRules, ...productPhotosWithoutAlt(root)]);
}
