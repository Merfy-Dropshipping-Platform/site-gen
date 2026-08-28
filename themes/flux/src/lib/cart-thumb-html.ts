/**
 * HTML строки корзины Flux — два экспорта под два места отображения:
 *
 *  - {@link cartLineThumbPictureHtml}(url, alt) — ТОЛЬКО превью (WebP + PNG/JPEG
 *    fallback). Используется drawer-корзиной в шапке (cart.ts → theme-base initCartUI).
 *
 *  - {@link cartLinePictureHtml}(line, format) — ПОЛНАЯ строка товара на странице
 *    /cart (секция CartSection): превью 207×207 + бейджи (Новинка/-%) + название +
 *    цена/старая цена + Цвет/Размер + чёрный счётчик +/− + кнопка «удалить».
 *    Пиксель-перфект из вёрстки верстальщиков (flux-theme, Figma 905-18809).
 */
import { withBase } from "./with-base";
import type { CartLine } from "./cart";

/** Превью строки корзины (drawer шапки): WebP + PNG/JPEG fallback с учётом Astro base. */
export function cartLineThumbPictureHtml(imageUrl: string, alt: string): string {
	const safeAlt = alt.replace(/"/g, "&quot;");
	// Товарные картинки MinIO/API — абсолютный URL: отдаём как есть (как карточка).
	// withBase ломал бы абсолютный URL (→ "/https://…" → 404), а .webp-варианта
	// у них нет (→ 404, и <picture> НЕ откатывается на <img>). onerror прячет битый src.
	if (/^(https?:)?\/\//i.test(imageUrl) || imageUrl.startsWith("data:")) {
		return `<img src="${imageUrl}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover" onerror="this.style.visibility='hidden'" />`;
	}
	const pngAbs = withBase(imageUrl);
	const webpAbs = pngAbs.replace(/\.(png|jpe?g)$/i, ".webp");
	const noWebp = webpAbs === pngAbs;
	return `
<picture class="contents">
	${noWebp ? "" : `<source srcset="${webpAbs}" type="image/webp" />`}
	<img src="${pngAbs}" alt="${safeAlt}" decoding="async" width="80" height="80" class="h-full w-full object-cover" />
</picture>`;
}

/** Доп. поля строки, которых нет в базовом NtCartLine, но переживают JSON в localStorage. */
type CartLineExtra = CartLine & {
	isNew?: boolean;
	salePercent?: string;
};

const COLOR_LABELS: Record<string, string> = {
	silver: "Серебро",
	black: "Чёрный",
	white: "Белый",
	blue: "Синий",
	gold: "Золото",
	green: "Зелёный",
	red: "Красный",
	gray: "Серый",
	grey: "Серый",
};

const colorLabel = (color?: string): string => {
	if (!color) return "";
	return COLOR_LABELS[color.toLowerCase()] ?? color;
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

/** Превью 207×207 со скруглением + бейджи поверх (для строки страницы /cart). */
function thumbHtml(line: CartLineExtra): string {
	// Товарные картинки MinIO/API — абсолютный URL: отдаём как есть (без withBase +
	// без .webp-варианта, у API его нет → 404 без отката). Локальные плейсхолдеры —
	// через withBase + WebP-fallback (как карточка/drawer).
	const isAbs = /^(https?:)?\/\//i.test(line.image) || line.image.startsWith("data:");
	const pngAbs = isAbs ? line.image : withBase(line.image);
	const webpAbs = pngAbs.replace(/\.(png|jpe?g)$/i, ".webp");
	const noWebp = isAbs || webpAbs === pngAbs;
	const safeAlt = escapeHtml(line.name);

	const discountPercent =
		line.salePercent ??
		(line.oldPrice && line.oldPrice > line.price
			? `-${Math.round((1 - line.price / line.oldPrice) * 100)}%`
			: "");

	const badges = `
		<div class="absolute left-1 top-1 flex flex-col items-start gap-1">
			${line.isNew ? `<span class="flex items-center justify-center rounded-[2px] bg-[rgb(var(--color-accent,250_81_9))] px-1.5 py-1 font-roboto-flex text-[12px] font-light leading-normal text-white">Новинка</span>` : ""}
			${discountPercent ? `<span class="flex items-center justify-center rounded-[2px] bg-[rgb(var(--color-accent,250_81_9))] px-1.5 py-1 font-roboto-flex text-[12px] font-light leading-normal text-white">${escapeHtml(discountPercent)}</span>` : ""}
		</div>`;

	return `
		<a href="/products/${encodeURIComponent(line.productId)}" class="relative block size-full overflow-hidden rounded-[var(--radius-media,8px)] bg-[#F5F5F5]">
			<picture class="contents">
				${noWebp ? "" : `<source srcset="${webpAbs}" type="image/webp" />`}
				<img src="${pngAbs}" alt="${safeAlt}" decoding="async" width="207" height="207" class="size-full object-cover"${isAbs ? ` onerror="this.style.visibility='hidden'"` : ""} />
			</picture>
			${badges}
		</a>`;
}

/** Счётчик количества — чёрный, rounded-4, как counter_md в Figma. */
function counterHtml(line: CartLineExtra): string {
	return `
		<div class="inline-flex items-center justify-center gap-2 rounded-[4px] bg-black p-2">
			<button type="button" data-page-cart-dec data-id="${line.id}" class="flex size-8 items-center justify-center rounded-[4px] transition-opacity hover:opacity-70" aria-label="Уменьшить количество">
				<img src="${withBase("/icons/minus.svg")}" alt="" aria-hidden="true" width="16" height="16" class="size-4 brightness-0 invert" />
			</button>
			<span class="min-w-[16px] text-center font-roboto-flex text-[20px] font-light leading-normal text-white" data-cart-qty>${line.quantity}</span>
			<button type="button" data-page-cart-inc data-id="${line.id}" class="flex size-8 items-center justify-center rounded-[4px] transition-opacity hover:opacity-70" aria-label="Увеличить количество">
				<img src="${withBase("/icons/plus.svg")}" alt="" aria-hidden="true" width="16" height="16" class="size-4 brightness-0 invert" />
			</button>
		</div>`;
}

/** Полная строка товара корзины (страница /cart). */
export function cartLinePictureHtml(
	line: CartLine,
	format: (value: number) => string,
): string {
	const l = line as CartLineExtra;
	const color = colorLabel(l.variant?.color);
	const size = l.variant?.size ?? "";
	const oldPrice =
		l.oldPrice && l.oldPrice > l.price ? format(l.oldPrice) : "";

	return `
		<li class="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4" data-line-id="${l.id}">
			<div class="relative size-[207px] shrink-0 max-sm:size-[140px]">
				${thumbHtml(l)}
			</div>
			<div class="flex min-w-0 flex-1 items-start gap-4 self-stretch">
				<div class="flex min-w-0 flex-1 flex-col gap-4">
					<div class="flex flex-col gap-1">
						<a href="/products/${encodeURIComponent(l.productId)}" class="font-roboto-flex text-[20px] font-light leading-normal text-black transition-opacity hover:opacity-70">${escapeHtml(l.name)}</a>
						<div class="flex items-center gap-2 uppercase">
							<span class="font-roboto-flex text-[20px] font-light leading-normal text-black">${format(l.price)}</span>
							${oldPrice ? `<span class="font-roboto-flex text-[16px] font-normal leading-normal text-[#cccccc] line-through">${oldPrice}</span>` : ""}
						</div>
					</div>
					${
						color || size
							? `<div class="flex items-center gap-1 font-roboto-flex text-[16px] font-light leading-normal text-black">
						${color ? `<span>Цвет:</span><span>${escapeHtml(color)}</span>` : ""}
						${size ? `<span class="ml-1">Размер:</span><span>${escapeHtml(size)}</span>` : ""}
					</div>`
							: ""
					}
				</div>
				<div class="flex h-full w-auto shrink-0 flex-col items-end justify-between gap-4 sm:w-[111px]">
					<button type="button" data-page-cart-remove data-id="${l.id}" class="flex size-6 items-center justify-center transition-opacity hover:opacity-70" aria-label="Удалить товар">
						<img src="${withBase("/icons/menu-close.svg")}" alt="" aria-hidden="true" width="12" height="12" class="size-3" />
					</button>
					${counterHtml(l)}
				</div>
			</div>
		</li>`;
}
