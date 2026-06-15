/**
 * Общие классы зоны фильтров каталога vanilla — единый источник для сайдбара
 * (side-вид), ряда дропдаунов (top-вид) и клиентской гидрации «Коллекций»
 * (Catalog.astro): радио-кружки, подписи и строки «Стоимости» везде одного
 * вида, без расползания копий по файлам.
 *
 * Цвета — токены цветовых схем конструктора `rgb(var(--color-*))` с фолбэками
 * на родную палитру vanilla (#000000 / #999999 / #444444 / #eeeeee): без схемы
 * вид не меняется ни на пиксель, со схемой фильтры красятся вместе со страницей.
 *
 * Порт из themes/vanilla/src/components/catalog/filter-classes.ts (sibling
 * блока — Catalog.astro и VanillaCatalogFilterSidebar импортят ./filter-classes).
 */

/** Заголовок секции фильтров («Сортировать», «Наличие», «Стоимость», «Коллекции»). */
export const CATALOG_FILTER_TITLE =
	"font-vanilla-arsenal text-base font-normal leading-none text-[rgb(var(--color-text,0_0_0))]";

/** Радио-кружок в манере сайдбара vanilla: приглушённая окружность, точка цвета текста. */
export const CATALOG_RADIO_CIRCLE =
	"relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[rgb(var(--color-muted,153_153_153))] after:pointer-events-none after:absolute after:h-[10px] after:w-[10px] after:rounded-full after:bg-[rgb(var(--color-text,0_0_0))] after:opacity-0 after:content-[''] peer-checked:border-[rgb(var(--color-text,0_0_0))] peer-checked:after:opacity-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[rgb(var(--color-text,0_0_0))]";

/** Подпись радио-опции: приглушённая, выбранная — цветом текста. */
export const CATALOG_RADIO_TEXT =
	"font-vanilla-arsenal text-base font-normal leading-none text-[rgb(var(--color-muted,153_153_153))] peer-checked:text-[rgb(var(--color-text,0_0_0))]";

/** Кнопка-опция дропдауна «Коллекции» (top-вид): приглушённая → активная цветом текста. */
export const CATALOG_OPTION_IDLE =
	"text-[rgb(var(--color-muted,153_153_153))] hover:text-[rgb(var(--color-text,0_0_0))]";
export const CATALOG_OPTION_ACTIVE = "text-[rgb(var(--color-text,0_0_0))]";

/** Блок «Стоимость»: обёртка, строка «от/до» (подпись #444444 → muted) и значение. */
export const CATALOG_PRICE_WRAP =
	"flex w-full flex-col font-vanilla-arsenal text-base font-normal leading-none";
export const CATALOG_PRICE_ROW =
	"flex h-10 w-full items-center justify-between border-b border-[rgb(var(--color-muted,153_153_153))] text-[rgb(var(--color-muted,68_68_68))]";
export const CATALOG_PRICE_VALUE = "flex items-center gap-2 text-[rgb(var(--color-text,0_0_0))]";
