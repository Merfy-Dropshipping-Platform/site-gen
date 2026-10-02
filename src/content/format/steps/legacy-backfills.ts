/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Бэкфиллы легаси-форм пропов (варианты товара, Hero, MainText, Video).
 */

import type { Block, PageData } from "./types";

/**
 * Figma 1:21431 — подсекция «Варианты» секции Product разделена на 2 свитчера:
 * displayStyle (Стиль: button/list) + shape (Вариации: circle/square/none). Старые
 * ревизии держат merged `style` (button/circle/square/list) без displayStyle →
 * конструктор-свитчеры показали бы пустую выборку. Read-time backfill displayStyle+
 * shape из legacy style/shape, сохраняя итоговый mode (та же деривация что в
 * Product.astro). Идемпотентно: если displayStyle уже задан — блок не трогаем.
 */
export function backfillProductVariants(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const [pageId, page] of Object.entries(pagesData)) {
    const pd = page as PageData | undefined;
    const content = Array.isArray(pd?.content)
      ? (pd!.content as Block[])
      : null;
    if (!content) continue;
    let pageChanged = false;
    const newContent = content.map((block) => {
      if (block?.type !== "Product") return block;
      const props = (block.props ?? {}) as Record<string, unknown>;
      const variants = (props.variants ?? {}) as Record<string, unknown>;
      if (typeof variants.displayStyle === "string") return block; // уже новая модель
      const style = typeof variants.style === "string" ? variants.style : "";
      const shape = typeof variants.shape === "string" ? variants.shape : "";
      // Legacy-деривация итогового mode (зеркало Product.astro).
      const mode =
        style === "circle" || style === "square"
          ? style
          : style === "list"
            ? "list"
            : shape === "circle" || shape === "square"
              ? shape
              : "button";
      const displayStyle = mode === "list" ? "list" : "button";
      const newShape = mode === "circle" || mode === "square" ? mode : "none";
      pageChanged = true;
      return {
        ...block,
        props: {
          ...props,
          variants: { ...variants, displayStyle, shape: newShape },
        },
      };
    });
    if (pageChanged) {
      out[pageId] = { ...(pd as object), content: newContent };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

/**
 * Hero legacy→nested бэкфилл. Баг: в панели «Изображение» (Hero) инпуты
 * «Заголовок» / «Текст» / «Текст» основной кнопки ПУСТЫЕ, хотя на витрине
 * заголовок/кнопка отображаются. Причина: старые ревизии хранят Hero в ПЛОСКОЙ
 * форме (`title` / `subtitle` / `cta`), а поля конструктора привязаны к
 * ВЛОЖЕННЫМ пропам (`heading.text` / `text.content` / `primaryButton.text`).
 * Hero.astro читает обе формы с фолбэком `new ?? legacy` → на витрине всё видно,
 * но поля панели (bind только к nested) пустые = десинк.
 *
 * Бэкфилл КОПИРУЕТ непустые legacy-значения в nested-пропы. Legacy сохраняем
 * 1-в-1 (backward-compat при rollback кода — puckConfig держит их hidden).
 * Рендер-нейтрально: new === legacy → resolved-строка та же (кнопка/заголовок
 * не меняются). Пустое состояние Hero (Figma-плейсхолдер) не затрагивается —
 * оно считается из тех же raw legacy/nested пропов. Идемпотентно: блок с уже
 * заданным nested-пропом пропускается.
 */
export function backfillHeroLegacyProps(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  const isBlank = (v: unknown): boolean => v == null || v === "";
  for (const [pageId, page] of Object.entries(pagesData)) {
    const pd = page as PageData | undefined;
    const content = Array.isArray(pd?.content)
      ? (pd!.content as Block[])
      : null;
    if (!content) continue;
    let pageChanged = false;
    const newContent = content.map((block) => {
      if (block?.type !== "Hero") return block;
      const props = (block.props ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      // «Заголовок»: heading.text ← legacy title.
      const heading = props.heading as Record<string, unknown> | undefined;
      if (
        isBlank(heading?.text) &&
        typeof props.title === "string" &&
        props.title !== ""
      ) {
        patch.heading = { ...(heading ?? {}), text: props.title };
      }

      // «Текст»: text.content ← legacy subtitle.
      const text = props.text as Record<string, unknown> | undefined;
      if (
        isBlank(text?.content) &&
        typeof props.subtitle === "string" &&
        props.subtitle !== ""
      ) {
        patch.text = { ...(text ?? {}), content: props.subtitle };
      }

      // «Кнопка основная»: primaryButton.{text,link} ← legacy cta.{text,href}.
      const primaryButton = props.primaryButton as
        | Record<string, unknown>
        | undefined;
      const cta = props.cta as { text?: unknown; href?: unknown } | undefined;
      if (
        isBlank(primaryButton?.text) &&
        cta &&
        typeof cta.text === "string" &&
        cta.text !== ""
      ) {
        patch.primaryButton = {
          text: cta.text,
          link: { href: typeof cta.href === "string" ? cta.href : "" },
        };
      }

      if (Object.keys(patch).length === 0) return block;
      pageChanged = true;
      return { ...block, props: { ...props, ...patch } };
    });
    if (pageChanged) {
      out[pageId] = { ...(pd as object), content: newContent };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

/**
 * «Основной текст»: кнопка из старого скрытого `cta` → в поле панели «Кнопка».
 *
 * Баг тестировщика: «при пустом инпуте в кнопке он отображает кнопку». Стартовое
 * наполнение тем клало кнопку в скрытое `cta` («К покупкам» → /catalog у vanilla,
 * «СМОТРЕТЬ КАТАЛОГ» у satin и др.), а поле панели привязано к `button.{text,link}`.
 * Витрина кнопку показывала, инпут был пуст, и убрать кнопку мерчант не мог.
 *
 * Бэкфилл КОПИРУЕТ `cta.{text, href|link}` в `button.{text, link:{href}}`, только
 * когда поля «Кнопка» в секции нет вовсе (`button` отсутствует или null). Если
 * мерчант уже трогал поле — даже очистил его — решает его значение: очищенный
 * инпут сильнее старого `cta` (runtime/main-text-button.ts). Legacy `cta`
 * сохраняем 1-в-1, как у Hero. Рендер-нейтрально: порт берёт `cta`, пока поля
 * нет, и тот же текст после переноса. Идемпотентно.
 */
export function backfillMainTextLegacyButton(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  const filled = (v: unknown): v is string =>
    typeof v === "string" && v.trim() !== "";
  for (const [pageId, page] of Object.entries(pagesData)) {
    const pd = page as PageData | undefined;
    const content = Array.isArray(pd?.content)
      ? (pd!.content as Block[])
      : null;
    if (!content) continue;
    let pageChanged = false;
    const newContent = content.map((block) => {
      if (block?.type !== "MainText") return block;
      const props = (block.props ?? {}) as Record<string, unknown>;
      const cta = props.cta as
        | { text?: unknown; href?: unknown; link?: unknown }
        | null
        | undefined;
      const text = cta?.text;
      if (props.button != null || !filled(text)) return block;
      const href =
        [cta?.href, cta?.link].find(
          (v): v is string => typeof v === "string",
        ) ?? "";
      pageChanged = true;
      return {
        ...block,
        props: { ...props, button: { text, link: { href } } },
      };
    });
    if (pageChanged) {
      out[pageId] = { ...(pd as object), content: newContent };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

/**
 * Video «Размер» split (rose/flux/vanilla/bloom/satin parity): исторически у
 * блока Video было единственное top-level поле `size`, ошибочно подписанное
 * «Размер заголовка» и управлявшее КЕГЛЕМ <h2>. Канон (как у Hero) — два
 * независимых регулятора: `size` = ВЫСОТА медиа-блока, `headingSize` = кегль
 * заголовка. Этот backfill сохраняет уже выбранный мерчантом кегль, перенося
 * legacy top-level `size` в `headingSize`, и очищает `size`, чтобы высота
 * видео осталась дефолтной (medium/16:9) — иначе старая ревизия с «Большим
 * заголовком» молча получила бы более высокое видео.
 * Идемпотентно: срабатывает только когда `size` — строка И `headingSize` пуст.
 */
export function backfillVideoSizeSplit(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const [pageId, page] of Object.entries(pagesData)) {
    const pd = page as PageData | undefined;
    const content = Array.isArray(pd?.content)
      ? (pd!.content as Block[])
      : null;
    if (!content) continue;
    let pageChanged = false;
    const newContent = content.map((block) => {
      if (block?.type !== "Video") return block;
      const props = (block.props ?? {}) as Record<string, unknown>;
      const hasHeadingSize =
        typeof props.headingSize === "string" && props.headingSize !== "";
      const legacySize = props.size;
      if (
        hasHeadingSize ||
        typeof legacySize !== "string" ||
        legacySize === ""
      ) {
        return block;
      }
      pageChanged = true;
      const nextProps: Record<string, unknown> = {
        ...props,
        headingSize: legacySize,
      };
      delete nextProps.size;
      return { ...block, props: nextProps };
    });
    if (pageChanged) {
      out[pageId] = { ...(pd as object), content: newContent };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}
