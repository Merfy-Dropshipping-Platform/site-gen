/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Нормализация отступов промо-баннера и плейсхолдера формы подписки.
 */

import type { Block, PageData } from "./types";

/**
 * PromoBanner: снять легаси-`padding {12,12}` старого сида.
 *
 * До этой волны «Отступы» промо-баннера не были выведены в панель и НЕ
 * применялись в рендере тем — высоту полосы задавал только «Размер». Сид ставил
 * `padding {top:12,bottom:12}`, который ничего не делал. Теперь «Отступы» —
 * живой контрол панели, поэтому мёртвое легаси-значение нужно снять: иначе у
 * баннеров, которые мерчант никогда не настраивал, полоса внезапно стала бы
 * толще на 24px. Убираем ТОЛЬКО точное {12,12} (значение сида); любое другое
 * значение — осознанная настройка мерчанта и сохраняется как есть.
 */
const PROMO_BANNER_LEGACY_PADDING = { top: 12, bottom: 12 };

export function normalizePromoBannerPadding(
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
      if (!b || b.type !== "PromoBanner" || !b.props) return block;
      const padding = b.props.padding as
        | { top?: unknown; bottom?: unknown }
        | undefined;
      if (
        !padding ||
        typeof padding !== "object" ||
        padding.top !== PROMO_BANNER_LEGACY_PADDING.top ||
        padding.bottom !== PROMO_BANNER_LEGACY_PADDING.bottom
      ) {
        return block;
      }
      const props = { ...b.props };
      delete props.padding;
      pageChanged = true;
      return { ...b, props };
    });
    if (pageChanged) {
      out[pageId] = { ...(page as object), content };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

/**
 * Newsletter: платформенная подсказка «Твой email» → «Email».
 *
 * Пункт 6 пачки тестировщика (13.09): «В секции Подписка на рассылку текст в
 * инпуте изменить на просто "Email"». Дефолт блока уже изменён
 * (theme-base/blocks/Newsletter/Newsletter.puckConfig.ts), но у существующих
 * магазинов строка лежит В РЕВИЗИИ: панель материализует дефолты в props при
 * любой правке соседнего поля, и без переноса владелец увидел бы прежний текст.
 *
 * Переносится ТОЛЬКО точная платформенная строка — свой текст мерчанта
 * («Ваша почта», «E-mail для скидок») не трогаем. Идемпотентна: после переноса
 * значение уже «Email» и повторный прогон — no-op.
 */
const NEWSLETTER_LEGACY_PLACEHOLDER = "Твой email";
const NEWSLETTER_PLACEHOLDER = "Email";

export function renameNewsletterPlaceholder(
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
      if (!b || b.type !== "Newsletter" || !b.props) return block;
      const props = { ...b.props };
      let blockChanged = false;
      if (props.placeholder === NEWSLETTER_LEGACY_PLACEHOLDER) {
        props.placeholder = NEWSLETTER_PLACEHOLDER;
        blockChanged = true;
      }
      // Легаси-форма: те же поля лежали вложенными в props.form
      // (Newsletter.astro принимает обе формы, см. `form?.placeholder`).
      const form = props.form as Record<string, unknown> | undefined;
      if (
        form &&
        typeof form === "object" &&
        form.placeholder === NEWSLETTER_LEGACY_PLACEHOLDER
      ) {
        props.form = { ...form, placeholder: NEWSLETTER_PLACEHOLDER };
        blockChanged = true;
      }
      if (!blockChanged) return block;
      pageChanged = true;
      return { ...b, props };
    });
    if (pageChanged) {
      out[pageId] = { ...(page as object), content };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}
