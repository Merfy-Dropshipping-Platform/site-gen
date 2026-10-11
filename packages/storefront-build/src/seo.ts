import { StorefrontBuildError } from './errors';

// Договор рисовальщика (design.md блока 4, SEO): всё индексируемое пишет сборка в HTML, а не браузер, и в первых 2 МБ
// страницы — дальше Google не читает. Правила — таблицей; не выполнено правило — страница не выкладывается.
// Правила проверяют только то, что пишет платформа. Заполненное мерчантом попадает в страницу, незаполненное сборку не
// валит (владелец 08.10: «SEO-описание пользователь может не заполнить, но при этом сайт должен работать»): язык —
// постоянный, заголовок — SEO-заголовок мерчанта, иначе имя магазина или его адрес, канонический адрес — адрес
// магазина (свой домен или поддомен платформы, всегда https). Описания и ключевых слов может не быть вовсе — тогда
// тема не рисует тег, как Dawn у Shopify (`{% if page_description %}`).
// Теги для соцсетей (блок 9) — по тем же правилам: заголовок, тип, адрес, имя магазина, язык и карточка есть всегда,
// по одному тегу; описания и картинки может не быть — тогда нет и тега.

interface SeoRule {
  text: string;
  holds: (html: string) => boolean;
}

export const SEO_LIMIT_BYTES = 2 * 1024 * 1024;

const CONTENT = /\scontent="([^"]*)"/;
const TEXT = /\S/;
const HTTPS = /^https:\/\/\S+$/;
const OG_LOCALE = /^[a-z]{2}_[A-Z]{2}$/;
const TWITTER_CARD = /^(?:summary|summary_large_image)$/;

// Содержимое тегов <meta> по ключу: у тегов og: ключ в property, у остальных — в name. Тега нет — пустой список; у
// тега нет content="…" — undefined.
function metaContents(html: string, key: string): (string | undefined)[] {
  const attribute = key.startsWith('og:') ? 'property' : 'name';
  const tags = new RegExp(`<meta ${attribute}="${key}"([^>]*)>`, 'g');
  return [...html.matchAll(tags)].map(([, attributes]) => CONTENT.exec(attributes)?.[1]);
}

const matches = (value: RegExp) => (content: string | undefined) => content !== undefined && value.test(content);

// Тег поля, которое мерчант может не заполнить: тега нет — не ошибка, тег без значения — ошибка темы.
const whenPresent =
  (key: string, value: RegExp = TEXT) =>
  (html: string): boolean =>
    metaContents(html, key).every(matches(value));

// Тег, который у страницы есть всегда: ровно один, и значение подходит.
function single(key: string, value: RegExp): (html: string) => boolean {
  return (html) => {
    const contents = metaContents(html, key);
    return contents.length === 1 && matches(value)(contents[0]);
  };
}

const SEO_RULES: readonly SeoRule[] = [
  { text: 'нет языка у <html>', holds: (html) => /<html[^>]*\slang="[^"]+"/.test(html) },
  { text: 'нет заголовка <title>', holds: (html) => /<title>[^<]+<\/title>/.test(html) },
  {
    text: 'тег <meta name="description"> без текста: нет описания — не рисуй тег',
    holds: whenPresent('description'),
  },
  {
    text: 'тег <meta name="keywords"> без текста: нет ключевых слов — не рисуй тег',
    holds: whenPresent('keywords'),
  },
  { text: 'нет канонического адреса https://', holds: (html) => /<link rel="canonical" href="https:\/\//.test(html) },
  { text: 'нужен один тег og:title с текстом', holds: single('og:title', TEXT) },
  { text: 'тег og:description без текста: нет описания — не рисуй тег', holds: whenPresent('og:description') },
  { text: 'нужен один тег og:type с текстом', holds: single('og:type', TEXT) },
  { text: 'нужен один тег og:url с адресом https://', holds: single('og:url', HTTPS) },
  { text: 'нужен один тег og:site_name с текстом', holds: single('og:site_name', TEXT) },
  { text: 'нужен один тег og:locale вида ru_RU', holds: single('og:locale', OG_LOCALE) },
  {
    text: 'тег og:image без адреса https://: нет картинки — не рисуй тег',
    holds: whenPresent('og:image', HTTPS),
  },
  {
    text: 'нужен один тег twitter:card: summary или summary_large_image',
    holds: single('twitter:card', TWITTER_CARD),
  },
  {
    text: 'страница больше 2 МБ: поисковик прочтёт только начало',
    holds: (html) => Buffer.byteLength(html) <= SEO_LIMIT_BYTES,
  },
];

export const seoProblems = (html: string): string[] =>
  SEO_RULES.filter((rule) => !rule.holds(html)).map((rule) => rule.text);

export function checkSeo(path: string, html: string): void {
  const problems = seoProblems(html);
  if (problems.length === 0) return;
  throw new StorefrontBuildError('seo-contract', problems.join('; '), { path });
}
