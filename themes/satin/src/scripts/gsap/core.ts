import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/** True when the user asked the OS to minimise non-essential motion. */
export const prefersReducedMotion = (): boolean =>
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True for devices with a real hover-capable, fine pointer (i.e. mouse/trackpad). */
export const canHover = (): boolean =>
	window.matchMedia("(hover: hover) and (pointer: fine)").matches;
