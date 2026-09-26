/**
 * «Следующее фото» на телефоне: свайп по фото карточки листает фото.
 *
 * Тестировщик: «следующее фото при наведении на телефоне — при тапе, зажатии
 * фотки товара или скролле не переключается». Наведения на телефоне нет, а
 * листание было только от мыши: mousemove/mouseover в «Группе товаров» и в
 * «Коллекции товаров» всех тем. Решение владельца: свайп, как на Авито и WB —
 * провёл пальцем по фото влево или вправо, фото сменилось. Тап по-прежнему
 * открывает товар, прокрутка страницы вверх-вниз не мешает.
 *
 * Какие фото листать, карточка говорит сама — атрибутами, которые кладёт
 * включённая настройка:
 *   • «Группа товаров»: img[data-img-primary] + data-img-2…N — все фото (bloom,
 *     vanilla, «как на Авито») или data-img-secondary — первое и второе (rose,
 *     satin, flux);
 *   • «Коллекция товаров»: ячейка li[data-image-2] сетки с data-next-photo —
 *     первое и второе.
 * Настройка выключена — атрибутов нет, и свайп ничего не делает. Поэтому
 * привязка одна на документ, в рантайме страницы каждой темы: она переживает
 * перерисовку секций в конструкторе и не зависит от того, в какой момент
 * включили настройку.
 *
 * Сторож: src/themes/__tests__/card-photo-swipe.spec.ts.
 */

/** Короче — это тап или дрожание пальца, а не свайп. */
export const SWIPE_MIN_PX = 30;
/** Во сколько раз горизонтальный сдвиг должен превышать вертикальный. */
export const SWIPE_RATIO = 1.5;
/** Сколько после свайпа гасить клик по карточке, чтобы он не открыл товар. */
const CLICK_GUARD_MS = 400;

/** Шаг по фото: влево — следующее (+1), вправо — предыдущее (−1), иначе 0. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
	if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return 0;
	return dx < 0 ? 1 : -1;
}

/** Номер фото после шага — без перескока через край, как на Авито. */
export function stepIndex(current: number, step: number, count: number): number {
	return Math.max(0, Math.min(count - 1, current + step));
}

type CardKind = {
	selector: string;
	photos: (el: HTMLElement) => string[];
	shown: (el: HTMLElement) => string | null;
	show: (el: HTMLElement, photos: string[], index: number) => void;
};

const present = (src: string | null | undefined): src is string => !!src;

const catalogPhotos = (img: HTMLElement): string[] => {
	const list = [img.getAttribute("data-img-primary")];
	for (let n = 2; img.hasAttribute(`data-img-${n}`); n++) list.push(img.getAttribute(`data-img-${n}`));
	if (list.length === 1) list.push(img.getAttribute("data-img-secondary"));
	return list.filter(present);
};

const popularPhotos = (li: HTMLElement): string[] => {
	const img = li.querySelector("img");
	return [img?.getAttribute("data-image-1") || img?.getAttribute("src"), li.getAttribute("data-image-2")].filter(
		present,
	);
};

/**
 * Та же подмена, что у наведения «Коллекции товаров» (NEXT_PHOTO_JS в
 * Popular.astro тем): оригинал запоминается в data-image-1 / data-srcset-1 и
 * возвращается на первом фото — с ним совпадает и уход мыши.
 */
const showPopular = (li: HTMLElement, photos: string[], index: number): void => {
	for (const img of Array.from(li.querySelectorAll("img"))) {
		if (!img.getAttribute("data-image-1")) img.setAttribute("data-image-1", img.getAttribute("src") || "");
		img.setAttribute("src", index === 0 ? img.getAttribute("data-image-1") || photos[0] : photos[index]);
	}
	for (const source of Array.from(li.querySelectorAll("source"))) {
		if (!source.getAttribute("data-srcset-1")) source.setAttribute("data-srcset-1", source.getAttribute("srcset") || "");
		source.setAttribute("srcset", index === 0 ? source.getAttribute("data-srcset-1") || photos[0] : photos[index]);
	}
};

const CARDS: CardKind[] = [
	{
		selector: "img[data-img-primary]",
		photos: catalogPhotos,
		shown: (img) => img.getAttribute("src"),
		show: (img, photos, index) => img.setAttribute("src", photos[index]),
	},
	{
		selector: '[data-nt="popular-grid"][data-next-photo] li[data-image-2]',
		photos: popularPhotos,
		shown: (li) => li.querySelector("img")?.getAttribute("src") ?? null,
		show: showPopular,
	},
];

const cardAt = (target: EventTarget | null) => {
	if (!(target instanceof Element)) return null;
	for (const kind of CARDS) {
		const el = target.closest<HTMLElement>(kind.selector);
		if (el) return { el, kind };
	}
	return null;
};

type SwipeStart = { el: HTMLElement; kind: CardKind; photos: string[]; x: number; y: number };
type ClickGuard = { el: HTMLElement; until: number };

/** Привязать свайп фото ко всем карточкам страницы (один раз на страницу). */
export function initCardPhotoSwipe(): void {
	if (typeof window === "undefined") return;
	const flags = window as unknown as { __merfyCardPhotoSwipe?: boolean };
	if (flags.__merfyCardPhotoSwipe) return;
	flags.__merfyCardPhotoSwipe = true;

	let start: SwipeStart | null = null;
	let guard: ClickGuard | null = null;
	// Остальные фото грузим с первого касания, чтобы листание не ждало сеть.
	const preloaded = new WeakSet<Element>();

	document.addEventListener(
		"touchstart",
		(event) => {
			const card = event.touches.length === 1 ? cardAt(event.target) : null;
			const photos = card ? card.kind.photos(card.el) : [];
			start = card && photos.length > 1 ? { ...card, photos, x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
			if (!start || preloaded.has(start.el)) return;
			preloaded.add(start.el);
			for (const src of photos.slice(1)) new Image().src = src;
		},
		{ passive: true },
	);

	document.addEventListener(
		"touchend",
		(event) => {
			const s = start;
			start = null;
			const touch = event.changedTouches[0];
			if (!s || !touch) return;
			const step = swipeStep(touch.clientX - s.x, touch.clientY - s.y);
			if (!step) return;
			const current = Math.max(0, s.photos.indexOf(s.kind.shown(s.el) ?? ""));
			s.kind.show(s.el, s.photos, stepIndex(current, step, s.photos.length));
			guard = { el: s.el, until: Date.now() + CLICK_GUARD_MS };
		},
		{ passive: true },
	);

	document.addEventListener(
		"touchcancel",
		() => {
			start = null;
		},
		{ passive: true },
	);

	// Свайп не открывает товар: браузер может прислать клик следом за касанием.
	document.addEventListener(
		"click",
		(event) => {
			const g = guard;
			guard = null;
			const target = event.target;
			if (!g || Date.now() > g.until || !(target instanceof Node)) return;
			if (!g.el.contains(target) && !target.contains(g.el)) return;
			event.preventDefault();
			event.stopPropagation();
		},
		true,
	);
}
