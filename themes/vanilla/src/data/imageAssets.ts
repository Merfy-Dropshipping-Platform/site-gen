/**
 * Пути к растрам в `public/images/`. Имена на латинице — стабильные URL на любом хостинге.
 *
 * Hero: положить PNG в `public/images/` с именами `vanilla-hero-slide-{1,2,3}.png`
 * (только фон, без текста/кнопок — overlay в Hero.astro). Затем `pnpm images:optimize`
 * или `pnpm build` — PNG конвертируется в `.webp`, исходник удаляется; VanillaPicture отдаёт WebP.
 */
export const V_IMG = {
	/** Только фон: без текста/кнопок в PNG — overlay в Hero.astro. */
	hero: (n: 1 | 2 | 3) => `/images/vanilla-hero-slide-${n}.png`,
	/** Главная: карточки «Текстиль…» и «Декор…», галерея, about и т.д. */
	collectionTextile: "/images/vanilla-collection-textile.png",
	collectionDecor: "/images/vanilla-collection-decor.png",
	/** Галерея: блок «Ваш дом — наша забота». */
	galleryCare: "/images/vanilla-chair.png",
	/** Популярные товары на главной (1–6). */
	popularProduct: (n: 1 | 2 | 3 | 4 | 5 | 6) => `/images/vanilla-product-${n}.png`,
	/** Каталог «Текстиль»: первые 4 товара (1–4). */
	catalogTextile: (n: 1 | 2 | 3 | 4) => `/images/vanilla-textile-${n}.png`,
	/** Каталог «Декор»: 2 товара (1–2). */
	catalogDecor: (n: 1 | 2) => `/images/vanilla-decor-${n}.png`,
	/** Галерея: декоративное видео (poster — Video.webp). */
	galleryVideo: "/images/Video.mp4",
	galleryVideoPoster: "/images/Video.webp",
	/** Страница «История»: иллюстрация справа от текста (429×440). */
	history: "/images/history.png",
} as const;

const DEMO_ROTATION = [
	V_IMG.hero(1),
	V_IMG.hero(2),
	V_IMG.hero(3),
	V_IMG.collectionTextile,
	V_IMG.collectionDecor,
] as const;

export function vanillaDemoImage(productIndexZeroBased: number): string {
	return DEMO_ROTATION[productIndexZeroBased % DEMO_ROTATION.length]!;
}

export function vanillaDemoGallery(productIndexZeroBased: number): string[] {
	return [vanillaDemoImage(productIndexZeroBased), vanillaDemoImage(productIndexZeroBased + 1)];
}

/** Количество миниатюр в PDP-галерее — для вертикального скролла (как в Figma). */
export const PDP_GALLERY_MIN_SLOTS = 6;

/** Три кадра для hover-карусели карточки: [лево, центр/главный, право]. */
export function getProductCardCarouselImages(
	image: string,
	gallery: string[] = [],
): [string, string, string] {
	const main = image;
	const source = [...new Set([main, ...gallery.filter(Boolean)])];

	if (source.length === 1) {
		return [main, main, main];
	}

	const mainIdx = source.indexOf(main);
	const left = source[(mainIdx - 1 + source.length) % source.length]!;
	const right = source[(mainIdx + 1) % source.length]!;

	return [left, main, right];
}

/** Главный кадр, повторённый minSlots раз — одинаковые фото для демо-скролла миниатюр. */
export function ensureProductGallery(images: string[], minSlots = PDP_GALLERY_MIN_SLOTS): string[] {
	const source = images.filter(Boolean);
	if (source.length === 0) return [];

	const primary = source[0]!;
	return Array.from({ length: minSlots }, () => primary);
}
