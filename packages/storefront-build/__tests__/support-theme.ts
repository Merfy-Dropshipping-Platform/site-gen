import { parseTheme } from '@merfy/tokens';
import novaThemeJson from '../../theme-nova/theme.json';
import type { RenderPage } from '../src/page';

// Токены темы nova — из theme.json её пакета (блок 1), как их возьмёт сборка магазина.
export const novaTokens = parseTheme(novaThemeJson.tokens);

// Подставной рисовальщик: печатает данные страницы так же, как ShopHead и главная темы nova, только без Astro.
export const fakeRender: RenderPage = (path, locals) => {
  const { head } = locals;
  const meta = `<meta name="description" content="${head.description}"><link rel="canonical" href="${head.canonical}">`;
  const headHtml = `${head.configHtml}<title>${head.title}</title>${meta}<style id="merfy-tokens">${head.tokensCss}</style>`;
  const body = `<h1>${locals.shop.name}</h1><p>© ${locals.year} ${locals.shop.name}</p>`;
  return Promise.resolve(
    `<html lang="${head.lang}"><head>${headHtml}</head><body data-path="${path}">${body}</body></html>`,
  );
};
