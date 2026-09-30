/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Снятие цветовой схемы сида корзины и варианта счётчика, где тема задаёт своё.
 */

import type { Block, PageData } from './types';

/**
 * Корзина: снять схему платформенного сида там, где тема задаёт свою.
 *
 * `migrateCartPage` сеет блоки корзины с жёстким `colorScheme: 'scheme-2'` —
 * у rose/flux/satin это светлое полотно, а у bloom scheme-2 РОЗОВАЯ: страница
 * корзины заливалась акцентом целиком. Схема корзины принадлежит теме, поэтому
 * для тем, где она задана в `theme.json → blockDefaults`, значение сида снимаем
 * — рендер возьмёт дефолт темы (`resolveBlockScheme`). Снимается ТОЛЬКО точное
 * 'scheme-2' (значение сида); осознанный выбор мерчанта не трогаем.
 *
 * Список тем расширяется по мере того, как тема назначает Cart-блокам свои
 * `blockDefaults` — без них снятие вернуло бы корзину к базовой схеме темы
 * (у flux это чёрная scheme-1), то есть сломало бы вид.
 */
const CART_SEED_SCHEME = 'scheme-2';
const CART_THEME_SCHEME_THEMES = new Set(['bloom']);
const CART_BLOCK_TYPES = new Set([
  'CartBody',
  'CartSummary',
  'CartTotals',
  'CartCheckoutButton',
]);

export function dropSeededCartScheme(
  pagesData: Record<string, unknown>,
  themeId?: string | null,
): Record<string, unknown> {
  const bare = (themeId ?? '').split('-')[0];
  if (!CART_THEME_SCHEME_THEMES.has(bare)) return pagesData;
  const page = pagesData['page-cart'] as PageData | undefined;
  if (!page || !Array.isArray(page.content)) return pagesData;
  let changed = false;
  const content = page.content.map((block) => {
    const b = block as { type?: string; props?: Record<string, unknown> };
    if (!b?.type || !CART_BLOCK_TYPES.has(b.type) || !b.props) return block;
    if (b.props.colorScheme !== CART_SEED_SCHEME) return block;
    const props = { ...b.props };
    delete props.colorScheme;
    changed = true;
    return { ...b, props };
  });
  if (!changed) return pagesData;
  return { ...pagesData, 'page-cart': { ...(page as object), content } };
}

/**
 * «Товар»: снять силуэт счётчика, вшитый сидом в данные мерчанта.
 *
 * `visualConfig` — LAYOUT-переключатель ТЕМЫ: в `Product.puckConfig` для него
 * нет ни одного поля, мерчант его не видит и выбрать не может. Источник —
 * `theme.json blockDefaults.Product.visualConfig`. Но сиды страницы товара
 * rose и flux клали его ВНУТРЬ пропов блока, а рендер мерджит
 * `deepMergeBlockProps(blockDefaults, props)` — пропы ревизии сильнее темы.
 * Итог: тема меняет силуэт счётчика, а витрина показывает слепок, сделанный в
 * момент создания сайта.
 *
 * Поймано 14.09: правка «счётчик берёт оформление своей темы» доехала до
 * bloom, satin и vanilla (у них `visualConfig` в сиде нет) и не доехала до
 * rose. Раньше это было незаметно, потому что сид rose повторял
 * `DEFAULT_VISUAL_CONFIG` слово в слово — «сид победил» и «тема применилась»
 * давали одинаковый HTML во всех ключах, кроме `counter`.
 *
 * Снимается ТОЛЬКО `counter`. Соседние `gallery`/`variantsType`/
 * `showDescription` читает ещё и собственный порт flux
 * (`FeaturedProduct.astro` берёт `visualConfig.showDescription`), и у flux сид
 * (`true`) расходится с манифестом (`false`) — снятие спрятало бы описание
 * товара, о чём никто не просил. Это тот же класс дефекта и он остаётся
 * открытым осознанно.
 */
/**
 * Ключи `visualConfig`, которые сид страницы темы не имеет права замораживать
 * в данных магазина: ими управляет `theme.json`, а не мерчант. `showDescription`
 * СЮДА НЕ ВХОДИТ — у flux сид (`true`) расходится с манифестом (`false`), и
 * снятие спрятало бы описание товара; это решение за владельцем.
 */
const SEED_FROZEN_VISUAL_KEYS = ['counter', 'gallery', 'variantsType'] as const;

export function dropSeededCounterVariant(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    if (!page || !Array.isArray(page.content)) continue;
    let pageChanged = false;
    const content = page.content.map((block) => {
      const b = block as { type?: string; props?: Record<string, unknown> };
      if (b?.type !== 'Product' || !b.props) return block;
      const visual = b.props.visualConfig;
      if (!visual || typeof visual !== 'object' || Array.isArray(visual)) {
        return block;
      }
      const visualRec = visual as Record<string, unknown>;
      const present = SEED_FROZEN_VISUAL_KEYS.filter((k) => k in visualRec);
      if (present.length === 0) return block;
      const nextVisual = { ...visualRec };
      for (const k of present) delete nextVisual[k];
      pageChanged = true;
      return { ...b, props: { ...b.props, visualConfig: nextVisual } };
    });
    if (!pageChanged) continue;
    out[pageId] = { ...(page as object), content };
    changed = true;
  }
  return changed ? out : pagesData;
}
