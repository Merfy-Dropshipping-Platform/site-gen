import { StorefrontBuildError } from './errors';

// Договор рисовальщика (design.md блока 4, SEO): всё индексируемое пишет сборка в HTML, а не браузер, и в первых 2 МБ
// страницы — дальше Google не читает. Правила — таблицей; не выполнено правило — страница не выкладывается.
// Правила проверяют только то, что пишет платформа. Заполненное мерчантом попадает в страницу, незаполненное сборку не
// валит (владелец 08.10: «SEO-описание пользователь может не заполнить, но при этом сайт должен работать»): язык —
// постоянный, заголовок — SEO-заголовок мерчанта, иначе имя магазина или его адрес, канонический адрес — адрес
// магазина (свой домен или поддомен платформы, всегда https). Описания и ключевых слов может не быть вовсе — тогда
// тема не рисует тег, как Dawn у Shopify (`{% if page_description %}`).

interface SeoRule {
  text: string;
  holds: (html: string) => boolean;
}

export const SEO_LIMIT_BYTES = 2 * 1024 * 1024;

const HAS_TEXT = /\scontent="[^"]*\S[^"]*"/;

// Тег поля, которое мерчант может не заполнить: тега нет — не ошибка, тег без текста — ошибка темы.
function filledWhenPresent(name: string): (html: string) => boolean {
  const tags = new RegExp(`<meta name="${name}"([^>]*)>`, 'g');
  return (html) => [...html.matchAll(tags)].every(([, attributes]) => HAS_TEXT.test(attributes));
}

const SEO_RULES: readonly SeoRule[] = [
  { text: 'нет языка у <html>', holds: (html) => /<html[^>]*\slang="[^"]+"/.test(html) },
  { text: 'нет заголовка <title>', holds: (html) => /<title>[^<]+<\/title>/.test(html) },
  {
    text: 'тег <meta name="description"> без текста: нет описания — не рисуй тег',
    holds: filledWhenPresent('description'),
  },
  {
    text: 'тег <meta name="keywords"> без текста: нет ключевых слов — не рисуй тег',
    holds: filledWhenPresent('keywords'),
  },
  { text: 'нет канонического адреса https://', holds: (html) => /<link rel="canonical" href="https:\/\//.test(html) },
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
