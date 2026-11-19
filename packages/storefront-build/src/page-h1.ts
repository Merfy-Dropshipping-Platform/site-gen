import { tagsNamed, type HtmlTag } from './html-tags';
import type { PageContent } from './sections-render';

// Один h1 на страницу (замер на стенде 19.11.2026: на главной два h1 — название магазина в шапке и заголовок секции
// «Страница»; проверка семантики ждёт один: `Multiple <h1>`). Секции пишут мерчант и агент и не знают, что стоит рядом,
// поэтому уровень заголовка ставит сборка по готовой разметке страницы, а не автор секции:
// - h1 остаётся первый видимый в порядке страницы: шапка, <main>, подвал, окна поверх страницы. Шапка ставит h1 только
//   на главной (название магазина), так что на главной он остаётся первым, а на остальных — h1 секции страницы;
// - каждый следующий видимый h1 становится h2: классы и атрибуты те же, вид не меняется, порядок заголовков не рвётся;
// - h1 в <template> и под скрытым предком не считается и не меняется: это другой вид той же страницы (хаб кабинета,
//   детали заказа), покупатель видит один из них. Разбор — по тегам, без DOM (html-tags.ts).

const LISTS = ['header', 'sections', 'footer', 'overlay'] as const;
const EXTRA_NAME = 'h2';
const NAME_LENGTH = EXTRA_NAME.length;
// Закрывающий тег h1: после имени — пробел или «>», чтобы не задеть <h10>.
const H1_CLOSE = /<\/h1(?=[\s>])/i;

const isVisible = (tag: HtmlTag): boolean => !tag.inTemplate && !tag.hidden;
const visibleH1 = (html: string): HtmlTag[] => tagsNamed(html, ['h1']).filter(isVisible);

// Места имени тега h1 в разметке: в открывающем теге — сразу после «<», в закрывающем — после «</». Закрывающего нет
// (тег без пары) — меняется только открывающий.
function namePlaces(html: string, tag: HtmlTag): number[] {
  const close = html.slice(tag.end).search(H1_CLOSE);
  return close === -1 ? [tag.start + 1] : [tag.start + 1, tag.end + close + 2];
}

// Разметка с h2 вместо h1 в каждом месте; места идут по возрастанию и не пересекаются.
function renamed(html: string, places: readonly number[]): string {
  let out = '';
  let at = 0;
  for (const place of places) {
    out += html.slice(at, place) + EXTRA_NAME;
    at = place + NAME_LENGTH;
  }
  return out + html.slice(at);
}

const demoted = (html: string, tags: readonly HtmlTag[]): string =>
  renamed(
    html,
    tags.flatMap((tag) => namePlaces(html, tag)).sort((left, right) => left - right),
  );

// Проход по разметке страницы в её порядке: помнит, сколько видимых h1 уже было, и оставляет только первый.
function singleH1Pass(): (html: string) => string {
  let seen = 0;
  return (html) => {
    const tags = visibleH1(html);
    const extra = tags.slice(Math.max(0, 1 - seen));
    seen += tags.length;
    return extra.length === 0 ? html : demoted(html, extra);
  };
}

// Разметка страницы, где видимый h1 один — первый; остальные — h2.
export function withSingleH1(content: PageContent): PageContent {
  const pass = singleH1Pass();
  const lists = LISTS.flatMap((name) => {
    const list = content[name];
    return list === undefined ? [] : [[name, list.map((html) => pass(html))] as const];
  });
  return { ...content, ...Object.fromEntries(lists) };
}
