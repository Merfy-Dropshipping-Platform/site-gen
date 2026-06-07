import { gsap, prefersReducedMotion } from "./core";

/**
 * Re-animates the design-system cart drawer with GSAP. The DS keeps owning
 * state (it sets `data-state` on #satin-cart-drawer-root for every open/close
 * path: events, [data-cart-open]/[data-cart-close] clicks, toggle, and the
 * auto-open on add-to-cart). We observe that attribute and drive the visuals.
 * gsap-overrides.css disables the DS transitions and forces the root to stay
 * rendered so the close animation is visible.
 */
export function initCartDrawer(): void {
	const root = document.getElementById("satin-cart-drawer-root");
	if (!root) return;

	const panel = root.querySelector<HTMLElement>("[data-cart-panel]");
	const overlay = root.querySelector<HTMLElement>("[data-cart-close]");
	if (!panel || !overlay) return;

	const reduced = prefersReducedMotion();

	// Closed starting state (inline → wins over the DS Tailwind classes).
	// `x: 0` zeroes the base px-translate GSAP would otherwise read from the DS
	// `translate-x-full` class (457px) and ADD to xPercent — without it the panel
	// stays one width off-screen when "open". GSAP now fully owns the transform.
	gsap.set(panel, { x: 0, xPercent: 100 });
	gsap.set(overlay, { autoAlpha: 0 });
	root.inert = true; // closed: not keyboard-focusable, hidden from AT

	const open = () => {
		root.inert = false;
		root.style.pointerEvents = "auto";
		gsap.to(overlay, { autoAlpha: 1, duration: reduced ? 0 : 0.3, ease: "power2.out", overwrite: true });
		gsap.to(panel, { xPercent: 0, duration: reduced ? 0 : 0.5, ease: reduced ? "none" : "back.out(1.1)", overwrite: true });
	};

	const close = () => {
		gsap.to(overlay, { autoAlpha: 0, duration: reduced ? 0 : 0.3, ease: "power2.in", overwrite: true });
		gsap.to(panel, {
			xPercent: 100,
			duration: reduced ? 0 : 0.4,
			ease: "power3.in",
			overwrite: true,
			onComplete: () => {
				root.style.pointerEvents = "none";
				root.inert = true;
			},
		});
	};

	let last = root.dataset.state ?? "closed";
	const apply = () => {
		const state = root.dataset.state ?? "closed";
		if (state === last) return;
		last = state;
		if (state === "open") open();
		else close();
	};

	const observer = new MutationObserver(apply);
	observer.observe(root, { attributes: true, attributeFilter: ["data-state"] });

	// Honour an already-open drawer on load (rare, but cheap to cover).
	apply();
}
