/**
 * Выбор комбинации вариантов «по умолчанию» — чистая функция без зависимостей.
 *
 * Живёт отдельно от `nt-cart.ts` намеренно: её зовёт и клиент (корзина,
 * поиск, быстрое добавление), и СЕРВЕРНЫЙ фронтматтер блока «Товар».
 * Плоская сборка превью (`scripts/compile-astro-blocks.mjs`) кладёт рантайм
 * как `runtime__<имя>.mjs` и НЕ переписывает его собственные относительные
 * импорты. `nt-cart.ts` тянет `./cart-added-modal` — импорт его из блока
 * ронял рендер превью страницы товара. Здесь импортов нет, поэтому модуль
 * грузится одинаково в превью, в сборке витрины и в браузере.
 */

/** Комбинация вариантов товара — минимум, нужный для выбора по умолчанию. */
export interface NtVariantCombinationLike {
	options?: Record<string, string> | null;
	available?: boolean;
}

/** Группа вариантов в ПОРЯДКЕ ПОКАЗА (как видит покупатель). */
export interface NtVariantGroupLike {
	name?: string;
	options?: Array<{ value?: string } | string> | null;
	values?: Array<{ value?: string } | string> | null;
}

/**
 * Комбинация, которую кладёт «быстрое добавление» с карточки.
 *
 * ЖАЛОБА ТЕСТЕРА 22.09 (пункт 27): «Из трёх оттенков кнопка „В корзину“ на
 * карточке кладёт Cold Brew, выбора не предлагает. Ожидаемо: взять первый».
 *
 * ЗАМЕР НА ЖИВОЙ ВИТРИНЕ. Порядок ПОКАЗА товара «Бесшовный топ»:
 * Размер — XXS, XS, S; Цвет — Performance Pink, Cherry Purple, Haze Pink.
 * А `variantCombinations[0]` = `{Цвет: Haze Pink, Размер: XS}` — ПОСЛЕДНИЙ
 * цвет и средний размер. Прежний выбор («первая доступная комбинация») брал
 * именно её: покупатель видит один оттенок, в корзину падает другой.
 *
 * Правило: берём комбинацию, у которой КАЖДАЯ опция равна ПЕРВОМУ значению
 * своей группы в порядке показа. Нет такой (или групп нет) — прежний путь:
 * первая доступная, затем просто первая. То есть поведение меняется ровно
 * там, где порядки расходились.
 */
export function pickDefaultCombination<T extends NtVariantCombinationLike>(
	combinations: T[] | null | undefined,
	groups?: NtVariantGroupLike[] | null,
): T | null {
	const list = Array.isArray(combinations) ? combinations.filter(Boolean) : [];
	if (list.length === 0) return null;

	const первыеЗначения = new Map<string, string>();
	for (const g of Array.isArray(groups) ? groups : []) {
		const имя = typeof g?.name === "string" ? g.name.trim() : "";
		const значения = (g?.options ?? g?.values ?? []) as Array<{ value?: string } | string>;
		const первое = значения
			.map((o) => (typeof o === "string" ? o : o?.value))
			.find((v): v is string => typeof v === "string" && v.trim() !== "");
		if (имя && первое) первыеЗначения.set(имя, первое.trim());
	}

	if (первыеЗначения.size > 0) {
		const подходит = (c: T): boolean => {
			const opts = (c.options ?? {}) as Record<string, string>;
			for (const [имя, значение] of первыеЗначения) {
				if ((opts[имя] ?? "").trim() !== значение) return false;
			}
			return true;
		};
		const доступная = list.find((c) => подходит(c) && c.available !== false);
		if (доступная) return доступная;
		const любая = list.find(подходит);
		if (любая) return любая;
	}

	return list.find((c) => c.available !== false) ?? list[0] ?? null;
}
