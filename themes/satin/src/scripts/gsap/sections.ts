import { gsap, ScrollTrigger, prefersReducedMotion } from "./core";

/**
 * Reveals top-level <main> sections as they scroll into view:
 * fade + slight upward rise + alternating side-slide (even from left,
 * odd from right) for a sense of movement. Sections already visible on load
 * are left untouched so they don't flash (the entry is a deferred module that
 * runs after first paint). Reduced-motion: no-op (content stays visible).
 */
export function initSectionReveals(): void {
	if (prefersReducedMotion()) return;

	const sections = gsap.utils.toArray<HTMLElement>("main > section");
	if (!sections.length) return;

	sections.forEach((section, i) => {
		// Skip anything already in view at load — hiding it would cause a flash.
		if (section.getBoundingClientRect().top < window.innerHeight) return;

		const fromX = i % 2 === 0 ? -32 : 32;
		gsap.set(section, { opacity: 0, x: fromX, y: 24 });

		ScrollTrigger.create({
			trigger: section,
			start: "top 85%",
			once: true,
			onEnter: () => {
				gsap.to(section, {
					opacity: 1,
					x: 0,
					y: 0,
					duration: 0.7,
					ease: "power3.out",
				});
			},
		});
	});
}
