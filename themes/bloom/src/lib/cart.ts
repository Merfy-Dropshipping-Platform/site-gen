/**
 * Корзина Bloom — обёртка над локальным {@link createNtCart} (`nt-cart-bloom.ts`,
 * копия DS с поддержкой `variantCombinationId` для backend cart → order_items).
 */
import {
	createNtCart,
	type NtCartLine,
	type NtCartLineVariant,
} from "./nt-cart-bloom";
import { cartLineThumbPictureHtml } from "./cart-thumb-html";
import { withBase } from "./with-base";

const api = createNtCart({
	storageKey: "bloom:cart:v1",
	eventPrefix: "bloom:cart",
});

export type CartLine = NtCartLine;
export type CartLineVariant = NtCartLineVariant;

export const getCart = api.getCart;
export const addToCart = api.addToCart;
export const updateQuantity = api.updateQuantity;
export const removeFromCart = api.removeFromCart;
export const clearCart = api.clearCart;
export const getCartCount = api.getCartCount;
export const getCartTotal = api.getCartTotal;
export const formatCartPrice = api.formatCartPrice;

let cartUiInitialized = false;

const events = api.events;

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const productHref = (productId: string) => `/products/${encodeURIComponent(productId)}`;

// Строгое совпадение по конкретному варианту (verstka: карточка отражает «В
// корзине» именно выбранного цвета/размера). Порт добавляет variantCombinationId
// (спек 098) в id-ключ, поэтому строим его тем же makeLineId-набором. Мягкий
// фолбэк «по productId» УБРАН: он ломал per-variant toggle-состояние (#17).
const lineIdOf = (productId: string, variant?: NtCartLineVariant) =>
	[productId, variant?.variantCombinationId, variant?.color, variant?.size].filter(Boolean).join("|");

const findLine = (productId: string, variant?: NtCartLineVariant) => {
	const id = lineIdOf(productId, variant);
	return getCart().find((line) => line.id === id);
};

// Карточная «В корзину» (toggle) отражает вариант карточки. combinationId в id
// карточки нет (SSR-демо не несёт комбинаций), поэтому для сопоставления с уже
// добавленной строкой матчим по productId+color+size, игнорируя combinationId.
const findCardLine = (productId: string, variant?: NtCartLineVariant) =>
	getCart().find(
		(line) =>
			line.productId === productId &&
			(line.variant?.color ?? "") === (variant?.color ?? "") &&
			(line.variant?.size ?? "") === (variant?.size ?? ""),
	);

const setBodyModalLock = (locked: boolean) => {
	document.body.style.overflow = locked ? "hidden" : "";
};

const closeAddedModal = () => {
	const modal = document.querySelector<HTMLElement>("[data-cart-added-modal]");
	const card = document.querySelector<HTMLElement>("[data-cart-modal-card]");
	if (!modal || !card || modal.classList.contains("hidden")) return;

	card.classList.add("translate-y-3", "opacity-0");
	card.classList.remove("translate-y-0", "opacity-100");
	modal.setAttribute("aria-hidden", "true");
	setBodyModalLock(false);
	window.setTimeout(() => {
		modal.classList.add("hidden");
		modal.classList.remove("flex");
	}, 220);
};

const openAddedModal = ({
	productId,
	name,
	price,
	image,
	volume,
	line,
}: {
	productId: string;
	name: string;
	price: string;
	image: string;
	volume?: string;
	line?: NtCartLine;
}) => {
	const modal = document.querySelector<HTMLElement>("[data-cart-added-modal]");
	const card = document.querySelector<HTMLElement>("[data-cart-modal-card]");
	if (!modal || !card) return;

	const href = productHref(productId);
	const imageEl = modal.querySelector<HTMLImageElement>("[data-cart-modal-image]");
	const nameEls = modal.querySelectorAll<HTMLAnchorElement>("[data-cart-modal-name], [data-cart-modal-product-link]");
	const volumeEl = modal.querySelector<HTMLElement>("[data-cart-modal-volume]");
	const priceEl = modal.querySelector<HTMLElement>("[data-cart-modal-price]");
	const cartLink = modal.querySelector<HTMLAnchorElement>("[data-cart-modal-cart-link]");

	nameEls.forEach((el) => {
		el.href = href;
		if (el.matches("[data-cart-modal-name]")) el.textContent = name;
	});

	if (imageEl) {
		imageEl.src = withBase(image || line?.image || "");
		imageEl.alt = name;
	}
	if (volumeEl) {
		volumeEl.textContent = volume ? `Объём: ${volume}` : "";
		volumeEl.classList.toggle("hidden", !volume);
	}
	if (priceEl) {
		const qty = line?.quantity ?? 1;
		priceEl.textContent = line ? `${formatCartPrice(line.price * qty)} · ${qty} шт.` : price;
	}
	if (cartLink) cartLink.textContent = `В корзину (${getCartCount()})`;

	modal.classList.remove("hidden");
	modal.classList.add("flex");
	modal.setAttribute("aria-hidden", "false");
	setBodyModalLock(true);
	window.requestAnimationFrame(() => {
		card.classList.remove("translate-y-3", "opacity-0");
		card.classList.add("translate-y-0", "opacity-100");
	});
};

/** Бейджи, drawer и Bloom-модалка после добавления, поверх общего cart storage. */
export const initCartUI = () => {
	if (typeof window === "undefined" || cartUiInitialized) return;
	cartUiInitialized = true;

	const renderBadges = () => {
		const count = getCartCount();
		document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
			el.textContent = String(count);
			el.dataset.empty = count === 0 ? "true" : "false";
		});
	};

	const renderDrawer = () => {
		const lines = getCart();
		const empty = document.querySelector<HTMLElement>("[data-cart-empty]");
		const items = document.querySelector<HTMLElement>("[data-cart-items]");
		const summary = document.querySelector<HTMLElement>("[data-cart-summary]");
		const total = document.querySelector<HTMLElement>("[data-cart-total]");
		if (!empty || !items || !summary || !total) return;

		if (lines.length === 0) {
			empty.classList.remove("hidden");
			items.classList.add("hidden");
			summary.classList.add("hidden");
			items.innerHTML = "";
			items.classList.remove("flex");
			summary.classList.remove("flex");
			return;
		}

		empty.classList.add("hidden");
		items.classList.remove("hidden");
		summary.classList.remove("hidden");
		items.classList.add("flex");
		summary.classList.add("flex");

		items.innerHTML = lines
			.map((line) => {
				const variant = [line.variant?.color, line.variant?.size].filter(Boolean).join(", ");
				const href = productHref(line.productId);
				return `
					<li class="flex items-start gap-4" data-line-id="${escapeHtml(line.id)}">
						<a href="${href}" class="group block size-20 shrink-0 overflow-hidden rounded-[12px] bg-[#F5F5F5]">
							${cartLineThumbPictureHtml(line.image, line.name)}
						</a>
						<div class="flex flex-1 flex-col gap-2">
							<div class="flex items-start justify-between gap-2">
								<div class="flex flex-col gap-1">
									<a href="${href}" class="font-inter text-[16px] font-light leading-normal text-[#000000] transition-opacity hover:opacity-70">${escapeHtml(line.name)}</a>
									${variant ? `<span class="font-inter text-[14px] font-light leading-normal text-[#999999]">${escapeHtml(variant)}</span>` : ""}
								</div>
								<button type="button" data-cart-remove data-id="${escapeHtml(line.id)}" class="font-inter text-[14px] font-light leading-normal text-[#999999] transition-colors hover:text-[#E38E9F]" aria-label="Удалить">Удалить</button>
							</div>
							<div class="flex items-center justify-between gap-3">
								<div class="inline-flex h-9 items-center rounded-full border border-[#FFD4E5] bg-white">
									<button type="button" data-cart-dec data-id="${escapeHtml(line.id)}" class="flex h-9 w-9 items-center justify-center text-[#E38E9F] transition-opacity hover:opacity-70" aria-label="Уменьшить">−</button>
									<span class="min-w-[28px] text-center font-inter text-[14px] font-light text-[#000000]">${line.quantity}</span>
									<button type="button" data-cart-inc data-id="${escapeHtml(line.id)}" class="flex h-9 w-9 items-center justify-center text-[#E38E9F] transition-opacity hover:opacity-70" aria-label="Увеличить">+</button>
								</div>
								<span class="font-inter text-[16px] font-light leading-none text-[#000000]">${formatCartPrice(line.price * line.quantity)}</span>
							</div>
						</div>
					</li>
				`;
			})
			.join("");

		total.textContent = formatCartPrice(getCartTotal(lines));
	};

	// Кнопки-карточки «В корзину» с data-cart-toggle отражают, лежит ли выбранный
	// вариант товара в корзине: «Inactive»-стиль (data-in-cart) + метка «В корзине»
	// (#17). Гоняется из syncCartChrome — на astro:page-load и на bloom:cart:updated.
	const syncProductCards = () => {
		document.querySelectorAll<HTMLButtonElement>("[data-add-to-cart][data-cart-toggle]").forEach((btn) => {
			const inCart = Boolean(
				findCardLine(btn.dataset.productId ?? "", {
					color: btn.dataset.variantColor || undefined,
					size: btn.dataset.variantSize || undefined,
				}),
			);
			btn.dataset.inCart = inCart ? "true" : "false";
			btn.setAttribute("aria-pressed", inCart ? "true" : "false");
			const label = inCart ? btn.dataset.labelInCart : btn.dataset.labelDefault;
			if (label) btn.textContent = label;
		});
	};

	const syncCartChrome = () => {
		renderBadges();
		renderDrawer();
		syncProductCards();
	};

	const onClick = (event: MouseEvent) => {
		const target = event.target as HTMLElement;

		// Свотч цвета на карточке товара (#16): выбор варианта для «В корзину».
		// Переключает aria-checked внутри radiogroup и переносит выбранный цвет на
		// кнопку добавления, затем пересинхронивает toggle-состояние карточек.
		const swatch = target.closest<HTMLButtonElement>("[data-card-color]");
		if (swatch) {
			const card = swatch.closest<HTMLElement>('[data-nt="bloom-product-card"]');
			if (!card) return;
			card.querySelectorAll<HTMLButtonElement>("[data-card-color]").forEach((b) => {
				b.setAttribute("aria-checked", b === swatch ? "true" : "false");
			});
			card
				.querySelector<HTMLButtonElement>("[data-add-to-cart]")
				?.setAttribute("data-variant-color", swatch.dataset.cardColor ?? "");
			syncProductCards();
			return;
		}

		const addBtn = target.closest<HTMLButtonElement>("[data-add-to-cart]");
		if (addBtn) {
			event.preventDefault();
			const variant = {
				color: addBtn.dataset.variantColor || undefined,
				size: addBtn.dataset.variantSize || undefined,
				// combinationId реальной комбинации (Phase 2) → backend cart → order_items.
				variantCombinationId: addBtn.dataset.variantCombinationId || undefined,
			};
			const productId = addBtn.dataset.productId ?? "";
			const name = addBtn.dataset.name ?? "";
			const price = addBtn.dataset.price ?? "0";
			const image = addBtn.dataset.image ?? "";
			const volume = addBtn.dataset.volume ?? "";

			// Toggle-кнопки карточек (#17): повторный клик по товару «в корзине» —
			// удаляет его (без модалки). Кнопки без data-cart-toggle (PDP/гидрация)
			// всегда добавляют. combinationId в SSR-карточке нет → матчим findCardLine.
			if (addBtn.hasAttribute("data-cart-toggle")) {
				const existing = findCardLine(productId, variant);
				if (existing) {
					removeFromCart(existing.id);
					return;
				}
			}

			addToCart({
				productId,
				name,
				price,
				oldPrice: addBtn.dataset.oldPrice,
				image,
				quantity: Number(addBtn.dataset.quantity ?? "1"),
				variant,
			});
			openAddedModal({
				productId,
				name,
				price,
				image,
				volume,
				line: findLine(productId, variant),
			});
			return;
		}

		if (target.closest("[data-cart-page-items]")) return;

		const inc = target.closest<HTMLButtonElement>("[data-cart-inc]");
		if (inc) {
			const id = inc.dataset.id ?? "";
			const line = getCart().find((l) => l.id === id);
			if (line) updateQuantity(id, line.quantity + 1);
			return;
		}

		const dec = target.closest<HTMLButtonElement>("[data-cart-dec]");
		if (dec) {
			const id = dec.dataset.id ?? "";
			const line = getCart().find((l) => l.id === id);
			if (line) updateQuantity(id, line.quantity - 1);
			return;
		}

		const remove = target.closest<HTMLButtonElement>("[data-cart-remove]");
		if (remove) {
			removeFromCart(remove.dataset.id ?? "");
			return;
		}

		if (
			target.closest("[data-cart-modal-close]") ||
			target.closest("[data-cart-modal-overlay]") ||
			target.closest("[data-cart-modal-continue]")
		) {
			closeAddedModal();
		}
	};

	document.addEventListener("click", onClick);
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") closeAddedModal();
	});
	document.addEventListener("astro:before-swap", closeAddedModal);
	document.addEventListener("astro:page-load", syncCartChrome);
	window.addEventListener(events.updated, syncCartChrome);
	syncCartChrome();
};
