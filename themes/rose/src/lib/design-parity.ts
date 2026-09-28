/**
 * Размеры вёрстки верстальщиков (Rose-theme @b719c193) ДАННЫМИ.
 *
 * Владелец 24.09: «как у верстальщиков, но не ломать структуру секций, их
 * настроек, цветовых схем». Здесь только кегли, зазоры и пропорции — ни одного
 * цвета. Владелец 25.09: у секции одна версия — та, что на проде; прежняя
 * ветка без этих классов удалена вместе с признаком режима.
 *
 * Владелец 25.09: «что в панели — то и на витрине». Числа верстальщиков,
 * привязанные к полю панели, рисует ЗНАЧЕНИЕ ПО УМОЛЧАНИЮ этого поля — и когда
 * оно не задано, и когда выбрано явно, — и только если порядок
 * «Маленький ≤ Средний ≤ Большой» сохраняется на каждой ширине (сторож
 * panel-size-order.spec.ts). Не сохраняется — чисел верстальщиков у поля нет
 * вовсе: иначе панель показывала бы одно, а витрина — другое, и первая же
 * правка секции вписывала бы значение панели. Где панель «не задано» не
 * заполняет, ветка «не задано» (`designersWhenUnset`) остаётся: у Hero размеры
 * заголовка/текста и «Позиция» значения по умолчанию в панели не имеют, а в
 * подвале размер — поле объекта: панель показывает своё значение, только когда
 * объекта нет целиком, и тогда нормализация (coerceFooterProps) сама пишет
 * «Маленький».
 *
 * Почему классы, а не правка `<style>` секций. У верстальщиков телефонные и
 * планшетные кегли заголовков лежат в `@layer utilities` — иначе они
 * проигрывают `!text-[20px]` дизайн-системы (для `!important` слоёное правило
 * бьёт неслоёное). У нас те же правила в `<style>` БЕЗ слоя и молча не
 * действуют: на телефоне заголовок 20px вместо 14px. Поэтому — `!`-утилиты на
 * обёртке секции.
 *
 * ВАЖНО: строки — ЛИТЕРАЛЫ. Tailwind сканирует исходники статически
 * (`@source "../lib/**"` в global.css).
 */

/**
 * Заголовок и подзаголовок секции (NtSectionHeading): телефон 14/12, планшет
 * 16/14. Рисует их вариант «Маленький» — значение панели по умолчанию
 * у «Популярного» (заголовок, текст) и «Списка коллекций» (подзаголовок).
 */
export const ROSE_SECTION_HEADING_DESIGNERS = {
  heading: "max-sm:[&_h2]:!text-[14px] max-sm:[&_h2]:!leading-none md:max-lg:[&_h2]:!text-[16px]",
  text: "max-sm:[&_p]:!text-[12px] max-sm:[&_p]:!leading-[1.4] md:max-lg:[&_p]:!text-[14px]",
} as const;

/**
 * Карточки «Популярных»: зазор фото–подпись 12 → 20, цена
 * 12/14/16 по ширинам. Пропорция фото — только из «Вида изображения»:
 * портрет верстальщиков (168/220 → 203/250 → 318/444) не совпадает ни с одним
 * вариантом панели, поэтому 25.09 снят.
 */
export const ROSE_POPULAR_DESIGNERS = {
  card:
    "[&_[data-nt=rose-product-card]]:gap-3 lg:[&_[data-nt=rose-product-card]]:gap-5 max-sm:[&_.rose-product-price]:!text-[12px] max-sm:[&_.rose-product-oldprice]:!text-[10px] md:max-lg:[&_.rose-product-price]:!text-[14px] md:max-lg:[&_.rose-product-oldprice]:!text-[12px]",
} as const;

/** Карточка «Коллекций» на планшете: зазор фото–подпись 12, подпись 14. */
export const ROSE_COLLECTIONS_CARD_DESIGNERS =
  "md:max-lg:[&_[data-nt=rose-collection-card]]:gap-3 md:max-lg:[&_.rose-collection-name]:!text-[14px]";

/**
 * Первый экран, ветки «не задано» полей без значения по умолчанию в панели:
 * на планшете заголовок 24, текст 16 (оба полужирные, как у верстальщиков);
 * на десктопе — прежние 40/20. Кнопка верстальщиков (планшет 40px/14) снята
 * 25.09: «Размер» по умолчанию «Большой», а она на планшете меньше кнопки
 * «Среднего».
 */
export const ROSE_HERO_DESIGNERS = {
  heading:
    "hero-animate-1 !text-[20px] !font-normal !leading-none tracking-normal text-[rgb(var(--color-heading,255_255_255))] sm:!text-[28px] md:!text-[24px] md:!font-medium lg:!text-[length:var(--size-hero-heading,40px)] lg:!font-normal",
  text: "hero-animate-2 max-w-xl px-1 font-manrope text-[14px] font-normal leading-none text-[rgb(var(--color-text,255_255_255))] sm:text-[16px] md:text-[16px] md:font-medium lg:text-[20px] lg:font-normal",
  /** Отступы контента при несданной «Позиции» (низ по центру): снизу 80 на телефоне. */
  contentPad: "pb-20 pt-28 sm:pb-11 sm:pt-32 md:pb-14 md:pt-36 lg:pb-16 xl:pb-20",
  /** Зазор заголовок–текст: 4 → 12 (sm) → 4 (планшет) → 16 (десктоп). */
  copyGap: "gap-1 sm:gap-3 md:gap-1 lg:gap-4",
} as const;

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
 * Классы верстальщиков для ветки «не задано» поля, у которого в панели НЕТ
 * значения по умолчанию (панель его не вписывает, и «не задано» живёт
 * долго): только когда значение НЕ задано. Заданное мерчантом значение
 * получает пустую строку — дальше рисует его собственный класс. Для поля С
 * значением по умолчанию не годится: панель покажет своё значение, а
 * витрина — вид верстальщиков.
 */
export const designersWhenUnset = (value: unknown, designersCls: string): string =>
  value === undefined ? designersCls : "";

/**
 * Подписи плиток «Галереи» на планшете — 14px (у верстальщиков). Правила
 * `#gallery .gallery-product-title{font-size:16px}` в `<style>` бесслойные,
 * поэтому перебиваются только `!`-утилитой.
 */
export const ROSE_GALLERY_TILES_DESIGNERS =
  "md:max-lg:[&_.gallery-product-title]:!text-[14px] md:max-lg:[&_.gallery-product-price]:!text-[14px] md:max-lg:[&_.gallery-collection-title]:!text-[14px]";
