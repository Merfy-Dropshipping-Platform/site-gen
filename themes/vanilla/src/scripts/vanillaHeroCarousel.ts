export interface VanillaHeroSlideCopy {
	title: string;
	subtitle: string;
	ctaText: string;
	ctaHref: string;
	/** Канон-классы лестниц размеров (Фаза B): смена слайда переключает и размер. */
	titleCls?: string;
	subtitleCls?: string;
}

export function bindVanillaHeroCarousel(root: HTMLElement) {
	if (root.dataset.vanillaHeroBound === "true") return;
	root.dataset.vanillaHeroBound = "true";

	const raw = root.dataset.slidesJson;
	if (!raw) return;

	let slides: VanillaHeroSlideCopy[];
	try {
		slides = JSON.parse(raw) as VanillaHeroSlideCopy[];
	} catch {
		return;
	}
	if (!slides.length) return;

	const imgs = [...root.querySelectorAll<HTMLElement>("[data-hero-slide-img]")];
	const titleEl = root.querySelector<HTMLElement>("[data-hero-title]");
	const subEl = root.querySelector<HTMLElement>("[data-hero-subtitle]");
	const ctaEl = root.querySelector<HTMLAnchorElement>("[data-hero-cta]");
	if (!titleEl || !subEl || !ctaEl) return;
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	const fadeCopy = (...els: (HTMLElement | null)[]) => {
		if (reduceMotion) return;
		for (const el of els) {
			if (!el) continue;
			el.classList.remove("vanilla-hero-copy-fade");
			void el.offsetWidth;
			el.classList.add("vanilla-hero-copy-fade");
		}
	};

	let idx = 0;

	const apply = (next: number) => {
		idx = (next + slides.length) % slides.length;
		const copy = slides[idx];
		if (!copy) return;

		imgs.forEach((el, k) => {
			const on = k === idx;
			el.classList.toggle("opacity-100", on);
			el.classList.toggle("opacity-0", !on);
			el.classList.toggle("pointer-events-none", !on);
			el.setAttribute("aria-hidden", on ? "false" : "true");
			if (reduceMotion) {
				el.classList.remove("transition-opacity", "duration-500", "ease-out");
			}
		});

		titleEl.textContent = copy.title;
		subEl.textContent = copy.subtitle;
		ctaEl.textContent = copy.ctaText;
		ctaEl.setAttribute("href", copy.ctaHref);
		// Канон-лестницы (Фаза B): per-slide heading.size/text.size приходят готовыми
		// классами в JSON; без них (legacy-JSON) классы остаются серверные.
		if (copy.titleCls) titleEl.className = copy.titleCls;
		if (copy.subtitleCls) subEl.className = copy.subtitleCls;
		// Слайд без текста кнопки прячет CTA (канон-слайды могут не нести кнопку).
		ctaEl.classList.toggle("hidden", !copy.ctaText);
		fadeCopy(titleEl, subEl, ctaEl);

		root.querySelectorAll<HTMLButtonElement>("[data-hero-bullet]").forEach((btn, k) => {
			const on = k === idx;
			btn.setAttribute("aria-current", on ? "true" : "false");
			btn.classList.toggle("text-white", on);
			btn.classList.toggle("text-white/45", !on);
		});
	};

	// Автолистание (Фаза B, канон autoplay/interval): ТОЛЬКО при data-autoplay="true"
	// (его выставляет канон-секция при пропе autoplay; дефолт-ветка верстальщика —
	// без атрибута и без таймера). Ручная навигация перезапускает таймер.
	const autoplay = root.dataset.autoplay === "true";
	const intervalMs = Math.max(1000, Number.parseInt(root.dataset.interval || "5000", 10) || 5000);
	let timer: ReturnType<typeof setInterval> | null = null;
	const restartAutoplay = () => {
		if (timer !== null) {
			clearInterval(timer);
			timer = null;
		}
		if (!autoplay || reduceMotion || slides.length < 2) return;
		timer = setInterval(() => {
			// Hot-replace превью убирает узел из DOM — глушим осиротевший таймер.
			if (!root.isConnected) {
				if (timer !== null) clearInterval(timer);
				timer = null;
				return;
			}
			apply(idx + 1);
		}, intervalMs);
	};

	root.querySelector("[data-hero-prev]")?.addEventListener("click", () => {
		apply(idx - 1);
		restartAutoplay();
	});
	root.querySelector("[data-hero-next]")?.addEventListener("click", () => {
		apply(idx + 1);
		restartAutoplay();
	});

	root.querySelectorAll<HTMLButtonElement>("[data-hero-bullet]").forEach((btn) => {
		btn.addEventListener("click", () => {
			const n = Number(btn.dataset.heroIndex);
			if (Number.isFinite(n)) {
				apply(n);
				restartAutoplay();
			}
		});
	});

	let touchX = 0;
	root.addEventListener(
		"touchstart",
		(e) => {
			touchX = e.changedTouches[0]?.screenX ?? 0;
		},
		{ passive: true },
	);
	root.addEventListener(
		"touchend",
		(e) => {
			const x = e.changedTouches[0]?.screenX ?? touchX;
			const dx = x - touchX;
			if (Math.abs(dx) < 44) return;
			if (dx < 0) apply(idx + 1);
			else apply(idx - 1);
			restartAutoplay();
		},
		{ passive: true },
	);

	apply(0);
	restartAutoplay();
}
