import { StorefrontBuildError } from './errors';

// Договор рисовальщика (design.md блока 4, SEO): всё индексируемое пишет сборка в HTML, а не браузер, и в первых 2 МБ
// страницы — дальше Google не читает. Правила — таблицей; не выполнено правило — страница не выкладывается.

interface SeoRule {
  text: string;
  holds: (html: string) => boolean;
}

export const SEO_LIMIT_BYTES = 2 * 1024 * 1024;

const SEO_RULES: readonly SeoRule[] = [
  { text: 'нет языка у <html>', holds: (html) => /<html[^>]*\slang="[^"]+"/.test(html) },
  { text: 'нет заголовка <title>', holds: (html) => /<title>[^<]+<\/title>/.test(html) },
  { text: 'нет описания <meta name="description">', holds: (html) => /<meta name="description" content="/.test(html) },
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
