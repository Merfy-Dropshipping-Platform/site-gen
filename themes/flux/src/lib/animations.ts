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

// B3 (владелец, 2026-08-02): смена «Позиции» (и любой другой правки, идущей
// через update-block/reconcile в превью-конструкторе — preview.service.ts
// el.outerHTML=html / idiomorph) роняла ВЕСЬ текстовый блок Hero в невидимое
// состояние. Причина: ScrollTrigger.batch собирался ОДИН раз при первой
// загрузке по СТАРЫМ DOM-узлам; hot-replace создаёт СВЕЖИЙ узел с data-reveal
// (CSS `.has-js [data-reveal]{opacity:0}`, global.css:76), которого исходный
// ScrollTrigger не видел — навсегда opacity:0 (подтверждено computed-style:
// opacity 1→0, transform matrix(...)→none ровно на замене). Rose уже решает
// тот же класс бага для своего data-animate/IntersectionObserver: повторный
// вызов initScrollAnimations() на astro:after-swap (rose Layout.astro:135-136).
// Astro-события уже шлются ПОСЛЕ каждого hot-replace (preview.service.ts
// executeScriptsIn → dispatchAstroNavEventsDebounced), их не хватало только
// GSAP-реализации flux. Отличие от rose: gsap.set(...) НЕЛЬЗЯ звать повторно
// на уже раскрытых элементах (в отличие от идемпотентного classList.add) —
// сбросит y/opacity уже показанного контента. Метка data-reveal-bound не даёт
// повторно обработать то, что уже отследил предыдущий вызов; свежие узлы без
// метки подхватываются и проигрывают обычный reveal (мгновенно — Hero уже в
// зоне видимости, ScrollTrigger даёт onEnter сразу при создании).
export function initAnimations() {
	const mm = gsap.matchMedia();

	mm.add("(prefers-reduced-motion: no-preference)", () => {
		// Одиночный reveal: секции, заголовки, текстовые блоки
		const singles = gsap.utils.toArray<HTMLElement>(
			"[data-reveal]:not([data-reveal-bound])",
		);
		if (singles.length) {
			singles.forEach((el) => el.setAttribute("data-reveal-bound", ""));
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
		gsap.utils
			.toArray<HTMLElement>("[data-reveal-group]:not([data-reveal-group-bound])")
			.forEach((group) => {
				const items = gsap.utils.toArray<HTMLElement>(group.children);
				if (!items.length) return;
				group.setAttribute("data-reveal-group-bound", "");
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
