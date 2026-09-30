/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Нормализация подвала: имя темы → имя магазина, контакты.
 */

import type { Block, PageData } from "./types";

/**
 * Apply all server-side migrations to a revision data object. Mutates a
 * shallow copy — input is not modified.
 *
 * `themeId` опционален — используется шагами, которые решают своё поведение
 * по МАНИФЕСТУ темы (`getThemeManifest(themeId)`, напр. знает ли тема
 * страницу `/checkout-result`), а не литералом имени темы. Без themeId такие
 * шаги пропускаются (back-compat для legacy callers).
 */
/** Плейсхолдер-телефон верстальщиков (засевался во все темы). */
const FOOTER_PLACEHOLDER_PHONE = "+7 (000) 000-00-00";
/**
 * Плейсхолдер-почты сидов/тем. Покрывает: `example@…` (example@bloom.ru,
 * example@vanila.merfy), `…@example.…` (rose@example.ru, info@example.ru) и
 * RFC-зарезервированный TLD `.example` (hello@satin.example). Реальные адреса
 * под эти шаблоны не попадают (`.example` не регистрируется, `example@` — явный
 * пример). */
const FOOTER_PLACEHOLDER_EMAIL = /(?:^example@|@example\.|\.example$)/i;

/**
 * Нормализация контактных данных футера (idempotent). Чистит демо-плейсхолдеры,
 * чтобы конструктор и превью показывали футер как «не настроено» — зеркалит live,
 * где build авторитетно подставляет данные из «Политика и контакты» / Theme
 * Settings / подключённой кассы:
 *  • телефон-плейсхолдер «+7 (000) 000-00-00» → удалить;
 *  • placeholder-email (rose@example.ru / example@vanila.merfy и т.п.) → удалить;
 *  • соцсети с пустым href или «#» → выкинуть;
 *  • правовые ссылки с href «#» или «/legal/…» (ведут в никуда) → выкинуть.
 * Реальные данные (введённые мерчантом) под паттерны не попадают и не трогаются.
 */
/**
 * Вычищает из подвала имя ТЕМЫ, оставшееся от сида.
 *
 * Владелец 18.09: «в подвал должна идти лого из настроек темы, если загружена,
 * или, если нет, то как в шапке браться с админки, а не отображаться название
 * темы». Сиды bloom/flux/satin клали блоку Footer
 * `copyright.companyName` = «Bloom» / «Flux» / «Satin», и это значение первое в
 * цепочке бренда — подвал писал имя темы при магазине «МОЙ САЙТ».
 *
 * Сиды уже почищены, но у сайтов, созданных раньше, значение лежит В РЕВИЗИИ, и
 * чистка сидов им не помогает: замер живых витрин 19.09 — satin печатает
 * «SATIN», bloom «Bloom», хотя сборка свежая. Поэтому вычищаем при чтении
 * ревизии: сравниваем с именем активной темы и, если совпало, убираем — дальше
 * бренд берётся из названия магазина, как и просил владелец.
 *
 * Своё название мерчанта не трогаем: оно совпасть с именем темы может только
 * буквально, а такой магазин всё равно получит название из админки — то же
 * самое слово.
 */
export function stripThemeNameFromFooter(
  pagesData: Record<string, unknown>,
  themeId: string | null | undefined,
  siteName?: string | null,
): Record<string, unknown> {
  const theme = (themeId ?? "").trim().toLowerCase();
  if (!theme) return pagesData;
  const shopName = (siteName ?? "").trim();
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    const content = page?.content;
    if (!Array.isArray(content)) continue;
    const nextContent = content.map((block) => {
      const b = block as
        | { type?: string; props?: Record<string, unknown> }
        | undefined;
      if (b?.type !== "Footer" || !b.props) return block;
      const copyright = b.props.copyright as
        | Record<string, unknown>
        | undefined;
      const company =
        typeof copyright?.companyName === "string"
          ? copyright.companyName.trim()
          : "";
      const title =
        typeof b.props.siteTitle === "string" ? b.props.siteTitle.trim() : "";
      const companyIsTheme = !!company && company.toLowerCase() === theme;
      // Пустой siteTitle — тоже повод подставить название магазина: у bloom в
      // ревизии поля не было вовсе, имя темы приходило из порта, и после его
      // починки подвал стал печатать запасное «Мой магазин» вместо «Bloom
      // Pilot». Владелец просил именно название из админки.
      const titleIsEmpty = !title;
      // Имя темы приезжает в подвал ДВУМЯ путями: `copyright.companyName` (сиды
      // bloom/flux/satin) и `siteTitle` (замер стенда satin 19.09: там лежало
      // «SATIN» при магазине «Satin Demo»). Чистим оба — иначе вычистишь одно
      // поле, а подвал продолжит печатать имя темы из второго.
      const titleIsTheme = !!title && title.toLowerCase() === theme;
      const needsShopName = titleIsEmpty && !!shopName;
      if (!companyIsTheme && !titleIsTheme && !needsShopName) return block;
      changed = true;
      const nextProps: Record<string, unknown> = { ...b.props };
      if (companyIsTheme) {
        const nextCopyright = { ...copyright };
        delete nextCopyright.companyName;
        nextProps.copyright = nextCopyright;
      }
      if (titleIsTheme) {
        // Название магазина из админки — ровно то, что просил владелец. Без
        // него просто убираем имя темы, дальше сработает запасное «Мой магазин».
        if (shopName) nextProps.siteTitle = shopName;
        else delete nextProps.siteTitle;
      } else if (needsShopName) {
        nextProps.siteTitle = shopName;
      }
      return { ...b, props: nextProps };
    });
    if (nextContent.some((b, i) => b !== content[i])) {
      out[pageId] = { ...(page as object), content: nextContent };
    }
  }
  return changed ? out : pagesData;
}

export function normalizeFooterContacts(
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
      if (!b || b.type !== "Footer" || !b.props) return block;
      const props = { ...b.props } as Record<string, any>;
      let blockChanged = false;

      if (
        typeof props.phone === "string" &&
        props.phone.trim() === FOOTER_PLACEHOLDER_PHONE
      ) {
        delete props.phone;
        blockChanged = true;
      }

      if (props.socialColumn && typeof props.socialColumn === "object") {
        const social = { ...(props.socialColumn as Record<string, any>) };
        let socialChanged = false;
        if (
          typeof social.email === "string" &&
          FOOTER_PLACEHOLDER_EMAIL.test(social.email.trim())
        ) {
          delete social.email;
          socialChanged = true;
        }
        if (Array.isArray(social.socialLinks)) {
          const filtered = social.socialLinks.filter(
            (s: any) =>
              s &&
              typeof s.href === "string" &&
              s.href.trim() !== "" &&
              s.href.trim() !== "#",
          );
          if (filtered.length !== social.socialLinks.length) {
            social.socialLinks = filtered;
            socialChanged = true;
          }
        }
        if (socialChanged) {
          props.socialColumn = social;
          blockChanged = true;
        }
      }

      if (
        props.informationColumn &&
        typeof props.informationColumn === "object"
      ) {
        const info = { ...(props.informationColumn as Record<string, any>) };
        if (Array.isArray(info.links)) {
          const filtered = info.links.filter(
            (l: any) =>
              l &&
              typeof l.href === "string" &&
              l.href.trim() !== "#" &&
              !l.href.trim().startsWith("/legal/"),
          );
          if (filtered.length !== info.links.length) {
            info.links = filtered;
            props.informationColumn = info;
            blockChanged = true;
          }
        }
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
