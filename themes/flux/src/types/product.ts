export interface Product {
	name: string;
	price: string;
	oldPrice?: string;
	image: string;
	id?: string;
	discount?: boolean;
	/**
	 * Rich-card поля (эталон верстальщиков FluxProductCard, Figma 1:26389). Все
	 * опциональны — demo/skeleton-товары их не несут, реальные товары наполняет
	 * гидрация из вариаций магазина (renderCardHtml / Popular SSR). Карточка
	 * рендерит каждый блок УСЛОВНО, поэтому отсутствие поля = блок не показан.
	 */
	/** Бейдж «Новинка». */
	isNew?: boolean;
	/** Бейдж скидки, напр. «-20%». */
	salePercent?: string;
	/** Hex-цвета свотчей вариаций (`#RRGGBB`), напр. ["#000000", "#FFFFFF"]. */
	swatches?: string[];
	/** Показать перечёркнутый серый свотч (у части цветов нет в наличии). */
	swatchDisabled?: boolean;
	/** Чипы памяти/объёма из второй группы вариаций, напр. ["128 ГБ", "256 ГБ"]. */
	memory?: string[];
	/** Индекс недоступного memory-чипа (приглушается). */
	memoryDisabledIndex?: number;
}
