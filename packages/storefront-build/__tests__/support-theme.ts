import { parseTheme } from '@merfy/tokens';
import novaThemeJson from '../../theme-nova/theme.json';
import type { ShopPageHead } from '../src/locals';
import type { RenderPage } from '../src/page';

// Токены темы nova — из theme.json её пакета (блок 1), как их возьмёт сборка магазина.
export const novaTokens = parseTheme(novaThemeJson.tokens);

// Тег для соцсетей (блок 9): пустое значение — тега нет, как у nova.
const ogTag = (property: string, content: string): string =>
  content === '' ? '' : `<meta property="${property}" content="${content}">`;

const socialTags = ({ title, description, canonical, social }: ShopPageHead): string =>
  [
    ogTag('og:type', social.type),
    ogTag('og:title', title),
    ogTag('og:description', description),
    ogTag('og:url', canonical),
    ogTag('og:site_name', social.siteName),
    ogTag('og:locale', social.locale),
    ogTag('og:image', social.image),
    `<meta name="twitter:card" content="${social.card}">`,
  ].join('');

// Подставной рисовальщик: печатает данные страницы так же, как ShopHead и главная темы nova, только без Astro.
export const fakeRender: RenderPage = (path, locals) => {
  const { head } = locals;
  const meta = `<meta name="description" content="${head.description}"><link rel="canonical" href="${head.canonical}">`;
  const tokens = `<style id="merfy-tokens">${head.tokensCss}</style>`;
  const headHtml = `${head.configHtml}<title>${head.title}</title>${meta}${socialTags(head)}${tokens}${head.codeHtml}`;
  const body = `<h1>${locals.shop.name}</h1>${locals.sections.join('')}<p>© ${locals.year} ${locals.shop.name}</p>`;
  return Promise.resolve(
    `<html lang="${head.lang}"><head>${headHtml}</head><body data-path="${path}">${body}</body></html>`,
  );
};
