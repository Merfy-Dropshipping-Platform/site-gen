/**
 * Ванильные GSAP-анимации сайта (не тянет @gsap/react — для inline <script>).
 *  - reveal секций/заголовков: [data-reveal] — мягкий fade-up при скролле;
 *  - stagger карточек: [data-reveal-group] — дети контейнера появляются по очереди.
 * Уважает prefers-reduced-motion: при reduce ничего не анимируем, контент виден
 * сразу (см. правило в global.css). До анимации элементы скрыты только при JS
 * (класс .has-js на <html>), поэтому без JS контент остаётся видимым.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function initAnimations() {
	const mm = gsap.matchMedia();

	mm.add("(prefers-reduced-motion: no-preference)", () => {
		// Одиночный reveal: секции, заголовки, текстовые блоки
		const singles = gsap.utils.toArray<HTMLElement>("[data-reveal]");
		if (singles.length) {
			gsap.set(singles, { y: 24 });
			ScrollTrigger.batch(singles, {
				start: "top 85%",
				once: true,
				onEnter: (els) =>
					gsap.to(els, {
						opacity: 1,
						y: 0,
						duration: 0.6,
						ease: "power2.out",
						stagger: 0.08,
						overwrite: true,
					}),
			});
		}

		// Группы: дети контейнера появляются со stagger (карточки, колонки)
		gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
			const items = gsap.utils.toArray<HTMLElement>(group.children);
			if (!items.length) return;
			gsap.set(items, { y: 24 });
			ScrollTrigger.create({
				trigger: group,
				start: "top 85%",
				once: true,
				onEnter: () =>
					gsap.to(items, {
						opacity: 1,
						y: 0,
						duration: 0.5,
						ease: "power2.out",
						stagger: 0.07,
						overwrite: true,
					}),
			});
		});
	});

	// Пересчёт позиций после загрузки картинок/шрифтов (меняют высоту страницы)
	window.addEventListener("load", () => ScrollTrigger.refresh());

	return mm;
}

export { gsap, ScrollTrigger };
