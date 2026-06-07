import { gsap, prefersReducedMotion } from "./core";

/**
 * Animated FAQ accordion over native <details>. We intercept the summary click,
 * drive `details.open` ourselves, and tween the answer wrapper height/opacity.
 * Multiple items can stay open. Reduced-motion: instant toggle.
 */
export function initFaq(): void {
	const items = document.querySelectorAll<HTMLDetailsElement>("[data-faq-item]");
	if (!items.length) return;
	const reduced = prefersReducedMotion();

	items.forEach((details) => {
		const summary = details.querySelector("summary");
		const answer = details.querySelector<HTMLElement>("[data-faq-answer]");
		if (!summary || !answer) return;

		summary.addEventListener("click", (event) => {
			event.preventDefault();

			if (reduced) {
				details.open = !details.open;
				return;
			}

			if (details.open) {
				// Keep the collapsed inline height:0 (don't clearProps) — some
				// browsers don't hide closed <details> content after a scripted
				// toggle, so the overflow-hidden wrapper at height:0 enforces it.
				gsap.to(answer, {
					height: 0,
					opacity: 0,
					duration: 0.3,
					ease: "power2.inOut",
					overwrite: true,
					onComplete: () => {
						details.open = false;
					},
				});
			} else {
				details.open = true;
				gsap.fromTo(
					answer,
					{ height: 0, opacity: 0 },
					{
						height: "auto",
						opacity: 1,
						duration: 0.35,
						ease: "power2.out",
						overwrite: true,
						onComplete: () => gsap.set(answer, { clearProps: "height,opacity" }),
					},
				);
			}
		});
	});
}
