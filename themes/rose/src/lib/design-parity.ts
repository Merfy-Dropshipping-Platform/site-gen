/**
 * PARITY_DESIGN — размеры вёрстки верстальщиков (Rose-theme @b719c193) ДАННЫМИ.
 *
 * Владелец 24.09: «как у верстальщиков, но не ломать структуру секций, их
 * настроек, цветовых схем». Здесь только кегли, зазоры и пропорции — ни одного
 * цвета. Классы подключаются ТОЛЬКО под признаком (`p.__designParity === true`)
 * и ТОЛЬКО в ветке «по умолчанию» соответствующей настройки: выставленное
 * мерчантом значение работает как прежде.
 *
 * Почему классы, а не правка `<style>` секций. У верстальщиков телефонные и
 * планшетные кегли заголовков лежат в `@layer utilities` — иначе они
 * проигрывают `!text-[20px]` дизайн-системы (для `!important` слоёное правило
 * бьёт неслоёное). У нас те же правила в `<style>` БЕЗ слоя и молча не
 * действуют: на телефоне заголовок 20px вместо 14px. Правка `<style>` поменяла
 * бы разметку и без признака, поэтому — утилиты на обёртке под признаком.
 *
 * ВАЖНО: строки — ЛИТЕРАЛЫ. Tailwind сканирует исходники статически
 * (`@source "../lib/**"` в global.css).
 */

/** Заголовок и подзаголовок секции (NtSectionHeading): телефон 14/12, планшет 16/14. */
export const ROSE_SECTION_HEADING_DESIGNERS = {
  heading: "max-sm:[&_h2]:!text-[14px] max-sm:[&_h2]:!leading-none md:max-lg:[&_h2]:!text-[16px]",
  /** «Галерея» на телефоне тянет кегль от ширины: clamp(14px, 3.8vw, 20px). */
  galleryHeading:
    "max-sm:[&_h2]:!text-[length:clamp(14px,3.8vw,20px)] max-sm:[&_h2]:!leading-none md:max-lg:[&_h2]:!text-[16px]",
  text: "max-sm:[&_p]:!text-[12px] max-sm:[&_p]:!leading-[1.4] md:max-lg:[&_p]:!text-[14px]",
} as const;

/**
 * Карточки «Популярных» при несданном «Виде изображения»: портретные фото
 * 168/220 → 203/250 → 318/444; под признаком всегда — зазор фото–подпись
 * 12 → 20, цена 12/14/16 по ширинам. Пропорцию карточка берёт из переменной
 * `--rose-card-ar` (инлайн `aspect-ratio:var(--rose-card-ar)`), поэтому она
 * переживает и гидрацию, которая перерисовывает карточки.
 */
export const ROSE_POPULAR_DESIGNERS = {
  aspectVar: "[--rose-card-ar:168/220] md:[--rose-card-ar:203/250] lg:[--rose-card-ar:318/444]",
  aspectRatio: "var(--rose-card-ar)",
  card:
    "[&_[data-nt=rose-product-card]]:gap-3 lg:[&_[data-nt=rose-product-card]]:gap-5 max-sm:[&_.rose-product-price]:!text-[12px] max-sm:[&_.rose-product-oldprice]:!text-[10px] md:max-lg:[&_.rose-product-price]:!text-[14px] md:max-lg:[&_.rose-product-oldprice]:!text-[12px]",
} as const;

/** Карточка «Коллекций» на планшете: зазор фото–подпись 12, подпись 14. */
export const ROSE_COLLECTIONS_CARD_DESIGNERS =
  "md:max-lg:[&_[data-nt=rose-collection-card]]:gap-3 md:max-lg:[&_.rose-collection-name]:!text-[14px]";

/**
 * Первый экран в ветке «Размер по умолчанию»: на планшете заголовок 24,
 * текст 16 (оба полужирные, как у верстальщиков), кнопка 40px/14; на
 * десктопе — прежние 40/20 и 52px/16.
 */
export const ROSE_HERO_DESIGNERS = {
  heading:
    "hero-animate-1 !text-[20px] !font-normal !leading-none tracking-normal text-[rgb(var(--color-heading,255_255_255))] sm:!text-[28px] md:!text-[24px] md:!font-medium lg:!text-[length:var(--size-hero-heading,40px)] lg:!font-normal",
  text: "hero-animate-2 max-w-xl px-1 font-manrope text-[14px] font-normal leading-none text-[rgb(var(--color-text,255_255_255))] sm:text-[16px] md:text-[16px] md:font-medium lg:text-[20px] lg:font-normal",
  cta: "h-10 min-h-10 min-w-[120px] px-3 py-2.5 text-[14px] sm:h-[52px] sm:min-h-[52px] sm:min-w-[160px] sm:px-6 sm:py-[10px] sm:text-[15px] md:h-10 md:min-h-10 md:min-w-[120px] md:px-3 md:py-2.5 md:text-[14px] lg:h-[52px] lg:min-h-[52px] lg:min-w-[160px] lg:px-6 lg:py-[10px] lg:text-[16px]",
  /** Отступы контента при несданной «Позиции» (низ по центру): снизу 80 на телефоне. */
  contentPad: "pb-20 pt-28 sm:pb-11 sm:pt-32 md:pb-14 md:pt-36 lg:pb-16 xl:pb-20",
  /** Зазор заголовок–текст: 4 → 12 (sm) → 4 (планшет) → 16 (десктоп). */
  copyGap: "gap-1 sm:gap-3 md:gap-1 lg:gap-4",
} as const;

/** Промо-полоса «Большой» (по умолчанию): кегль плавно от ширины, до 16px. */
export const ROSE_PROMO_TEXT_DESIGNERS = "text-[length:clamp(10px,2vw_+_5px,16px)]";

/** Подвал: заголовок рассылки clamp(14px, 2.2vw, 20px), на телефоне текст 12 и ссылки 14. */
export const ROSE_FOOTER_DESIGNERS = {
  headingStyle: "--size-section-heading:clamp(14px,2.2vw,20px);--size-section-heading-m:14px;",
  text: "!text-[16px] max-sm:!text-[12px]",
  /** Заголовок рассылки на телефоне — обычного начертания (у нас правило без слоя проигрывало `!font-bold`). */
  newsletter: "max-sm:[&_#newsletter-heading]:!font-normal",
  /**
   * Ссылки 14px на телефоне. `[&_li]:text-[16px]` — высота строки пункта:
   * общий global.css темы ставит body 18px до 720px, и пункт списка рос до
   * 28.8px (у верстальщиков 25.6), подвал на телефоне выходил выше на ~22px.
   */
  link: "max-sm:[&_a]:!text-[14px] [&_li]:text-[16px]",
} as const;

/** Мобильная строка шапки на планшете — высота планшетного ряда верстальщиков (56px). */
export const ROSE_HEADER_MOBILE_ROW_DESIGNERS = "md:h-14";

/** Кнопки-иконки десктопной строки шапки — 40px (у верстальщиков `size-10`). */
export const ROSE_HEADER_ACTION_BTN_DESIGNERS = "size-10";

/** Коробка панели поиска шапки: справа 4px до кнопки «Найти» (у верстальщиков `pr-1`). */
export const ROSE_HEADER_SEARCH_BOX_DESIGNERS = "p-2 pr-1";

/**
 * Классы верстальщиков для ветки «по умолчанию» настройки: только под признаком
 * и только когда значение НЕ задано. Заданное мерчантом значение (в том числе
 * совпадающее с каноническим) и рендер без признака получают пустую строку —
 * прежняя разметка байт в байт.
 */
export const designersWhenUnset = (designParity: boolean, value: unknown, designersCls: string): string =>
  designParity && value === undefined ? designersCls : "";

/**
 * Подписи плиток «Галереи» на планшете — 14px (у верстальщиков). Правила
 * `#gallery .gallery-product-title{font-size:16px}` в `<style>` бесслойные,
 * поэтому перебиваются только `!`-утилитой.
 */
export const ROSE_GALLERY_TILES_DESIGNERS =
  "md:max-lg:[&_.gallery-product-title]:!text-[14px] md:max-lg:[&_.gallery-product-price]:!text-[14px] md:max-lg:[&_.gallery-collection-title]:!text-[14px]";
