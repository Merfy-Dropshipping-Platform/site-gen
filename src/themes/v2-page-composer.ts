import { rewriteRootUrlsToPrefix } from '../generator/theme-build.service';
import { injectTokensCssIntoHtml } from './tokens-inject';

/** Блоки, которые на странице стоят ДО <main> (шапка). */
const HEADER_TYPES = new Set(['PromoBanner', 'Header']);
/** Блоки, которые стоят ПОСЛЕ </main> (подвал). */
const FOOTER_TYPES = new Set(['Footer']);

export interface ComposeV2PageInput {
  /** Пред-собранная страница темы (preview- или live-вариант) — источник head/скриптов. */
  shellHtml: string;
  /** Container-HTML блоков в порядке страницы (как в Puck JSON). */
  blocksHtml: string[];
  /** Типы тех же блоков (параллельный массив). */
  blockTypes: string[];
  /** Параллельный массив схем блоков ('scheme-2' | '2' | null). Обёртка
   * .color-scheme-N — её агент превью уже умеет hot-обновлять (097). */
  blockSchemes?: Array<string | null>;
  /** '/__theme/<тема>' для превью; null для live (корневые URL). */
  assetPrefix: string | null;
  /** Заменить <title> шелла (например именем страницы). */
  titleOverride?: string;
  /** Готовый CSS настроек темы — вставляется <style id="__merfy_tokens_css">
   * перед </head>. Источник: buildTokensCss(themeSettings, themeId). */
  tokensCss?: string;
}

/** 'scheme-2' | 2 → '2'; пусто → null. Единая нормализация для превью и live. */
export function schemeIdFromProp(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'string' && raw.length > 0) return raw.replace(/^scheme-/, '');
  return null;
}

/**
 * «Пересадка тела в шелл»: заменяет в собранной странице темы диапазон
 * [первый элемент после <body…>; последний </footer>] на отрендеренные блоки
 * (шапка → <main>тело</main> → подвал), сохраняя head и хвост body
 * (cart-drawer, <script>-бандлы Layout) дословно. Возвращает null, если
 * структура шелла не распознана — зовущий обязан сфоллбечить на блоб-путь.
 */
export function composeV2Page(input: ComposeV2PageInput): string | null {
  const { shellHtml, blockTypes, assetPrefix, titleOverride } = input;

  const bodyOpen = shellHtml.match(/<body[^>]*>/i);
  if (!bodyOpen || bodyOpen.index === undefined) return null;
  const bodyStart = bodyOpen.index + bodyOpen[0].length;
  const footerClose = shellHtml.lastIndexOf('</footer>');
  if (footerClose < bodyStart) return null;
  const replaceEnd = footerClose + '</footer>'.length;

  const rawBlocksHtml = assetPrefix
    ? input.blocksHtml.map((h) => rewriteRootUrlsToPrefix(h, assetPrefix))
    : input.blocksHtml;

  const schemes = input.blockSchemes ?? [];
  const blocksHtml = rawBlocksHtml.map((h, i) => {
    const s = schemeIdFromProp(schemes[i] ?? null);
    // Header sticky: display:contents — обёртка схемы без бокса, чтобы inner
    // sticky-див хедера крепился к <body>, а не к короткому родителю.
    const style = blockTypes[i] === 'Header' ? ` style="display:contents"` : '';
    return s ? `<div class="color-scheme-${s}"${style} data-block-scheme="${s}">${h}</div>` : h;
  });

  const headerParts: string[] = [];
  const mainParts: string[] = [];
  const footerParts: string[] = [];
  blockTypes.forEach((type, i) => {
    if (HEADER_TYPES.has(type)) headerParts.push(blocksHtml[i]);
    else if (FOOTER_TYPES.has(type)) footerParts.push(blocksHtml[i]);
    else mainParts.push(blocksHtml[i]);
  });

  const newBody = `${headerParts.join('\n')}<main>${mainParts.join('\n')}</main>${footerParts.join('\n')}`;
  let html =
    shellHtml.slice(0, bodyStart) + newBody + shellHtml.slice(replaceEnd);

  if (titleOverride) {
    html = html.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escapeHtml(titleOverride)}</title>`,
    );
  }

  if (input.tokensCss) {
    html = injectTokensCssIntoHtml(html, input.tokensCss);
  }

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
