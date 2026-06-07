# GSAP Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vanilla-GSAP animation layer to the static Satin Astro theme — section scroll-reveal, 3D card tilt + lift, add-to-cart hover reveal, search autocomplete, and a GSAP-driven cart drawer over the design-system events.

**Architecture:** Plain GSAP modules under `src/scripts/gsap/`, registered once through `src/scripts/gsap/index.ts` imported in `Layout.astro`. No React. Every animation is gated on `prefers-reduced-motion` (via `matchMedia`) and, where relevant, `(hover: hover)`. The cart drawer is driven by a `MutationObserver` on the DS root's `data-state` (the one source of truth for all open/close paths), with a CSS override file neutralising the DS transitions.

**Tech Stack:** Astro 5, Tailwind v4, `gsap@3.15.0` (+ `gsap/ScrollTrigger`), TypeScript.

> **Note on verification:** The theme has **no test runner** (confirmed in the spec; introducing one is out of scope). Standard TDD is replaced by: `pnpm build` must pass, plus a manual smoke checklist (Task 8). Each task still ends with a commit.

---

## File Structure

**New files:**
- `src/scripts/gsap/core.ts` — registers `ScrollTrigger`, exports `gsap`/`ScrollTrigger`, `prefersReducedMotion()`, `canHover()`.
- `src/scripts/gsap/sections.ts` — `initSectionReveals()`.
- `src/scripts/gsap/product-card.ts` — `initProductCards()`.
- `src/scripts/gsap/search.ts` — `initSearch()`.
- `src/scripts/gsap/cart-drawer.ts` — `initCartDrawer()`.
- `src/scripts/gsap/index.ts` — entry; calls all `init*()` on DOM ready.
- `src/styles/gsap-overrides.css` — drawer transition/visibility neutralisation + pre-JS hidden state for the add-to-cart button on hover devices.

**Modified files:**
- `src/styles/global.css` — `@import "./gsap-overrides.css";`.
- `src/components/Header.astro` — search index JSON + suggestion containers + `data-search-*` hooks.
- `src/layouts/Layout.astro` — import the GSAP entry script.
- `package.json` / lockfile — remove `@gsap/react`.

---

### Task 1: Remove unused dep and create the GSAP core

**Files:**
- Modify: `package.json` (remove `@gsap/react`)
- Create: `src/scripts/gsap/core.ts`

- [ ] **Step 1: Remove `@gsap/react`**

Run:
```bash
pnpm remove @gsap/react
```
Expected: `package.json` no longer lists `@gsap/react`; `gsap` remains.

- [ ] **Step 2: Create the core module**

Create `src/scripts/gsap/core.ts`:
```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src/scripts/gsap/core.ts
git commit -m "feat(satin): GSAP core (register ScrollTrigger, motion helpers)"
```

---

### Task 2: CSS overrides (drawer + button base state)

**Files:**
- Create: `src/styles/gsap-overrides.css`
- Modify: `src/styles/global.css:2`

- [ ] **Step 1: Create the overrides stylesheet**

Create `src/styles/gsap-overrides.css`:
```css
/* GSAP takes over these visuals — neutralise the design-system's own CSS. */

/* Cart drawer: GSAP (cart-drawer.ts) drives the panel transform and overlay
   opacity, so the DS CSS transitions must be off and the root must stay
   rendered (otherwise the close animation would be clipped by
   `visibility:hidden`). The root is click-through by default; cart-drawer.ts
   sets `pointer-events:auto` on it while the drawer is open and restores
   `none` when the close animation finishes. */
#satin-cart-drawer-root {
	visibility: visible !important;
	pointer-events: none;
}
/* Only the full-screen overlay (direct child) — NOT the in-panel "Скрыть"
   button, whose hover fade we want to keep. */
#satin-cart-drawer-root [data-cart-panel],
#satin-cart-drawer-root > [data-cart-close] {
	transition: none !important;
}

/* Add-to-cart button: hidden by default on hover-capable devices so it can
   reveal on card hover. Touch devices keep it visible (can't hover to reveal).
   This pre-JS rule prevents a flash before product-card.ts runs. */
@media (hover: hover) and (pointer: fine) {
	[data-nt="satin-product-card"] [data-add-to-cart] {
		opacity: 0;
		visibility: hidden;
		transform: translateY(8px);
	}
	/* Keyboard-accessibility fallback if JS hasn't revealed it yet (or fails). */
	[data-nt="satin-product-card"]:focus-within [data-add-to-cart] {
		opacity: 1;
		visibility: visible;
		transform: none;
	}
}
```

- [ ] **Step 2: Wire it into global.css**

In `src/styles/global.css`, add the import on a new line immediately after line 2 (`@import "@merfy-dropshipping-platform/design-systems-theme/tokens.css";`):
```css
@import "./gsap-overrides.css";
```

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm build
```
Expected: build completes without CSS errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/gsap-overrides.css src/styles/global.css
git commit -m "feat(satin): GSAP CSS overrides (drawer + add-to-cart base state)"
```

---

### Task 3: Section scroll-reveal

**Files:**
- Create: `src/scripts/gsap/sections.ts`

- [ ] **Step 1: Implement section reveals**

Create `src/scripts/gsap/sections.ts`:
```ts
import { gsap, ScrollTrigger, prefersReducedMotion } from "./core";

/**
 * Reveals top-level <main> sections as they scroll into view:
 * fade + slight upward rise + alternating side-slide (even from left,
 * odd from right) for a sense of movement. Reduced-motion: no-op (content
 * stays visible).
 */
export function initSectionReveals(): void {
	if (prefersReducedMotion()) return;

	const sections = gsap.utils.toArray<HTMLElement>("main > section");
	if (!sections.length) return;

	sections.forEach((section, i) => {
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

				const items = section.querySelectorAll<HTMLElement>("[data-reveal-item]");
				if (items.length) {
					gsap.from(items, {
						opacity: 0,
						y: 20,
						duration: 0.5,
						ease: "power2.out",
						stagger: 0.08,
					});
				}
			},
		});
	});
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/gsap/sections.ts
git commit -m "feat(satin): GSAP section scroll-reveal"
```

---

### Task 4: Product card 3D tilt + lift + button reveal

**Files:**
- Create: `src/scripts/gsap/product-card.ts`

- [ ] **Step 1: Implement card interactions**

Create `src/scripts/gsap/product-card.ts`:
```ts
import { gsap, canHover, prefersReducedMotion } from "./core";

const MAX_TILT = 6; // degrees

/**
 * Adds hover interactions to every product card on the page:
 *  - 3D tilt that follows the cursor (smoothed via quickTo)
 *  - a slight lift + soft shadow
 *  - reveal of the "В корзину" button (also on keyboard focus)
 * Only runs on hover-capable, fine-pointer devices with motion allowed;
 * otherwise cards keep their static CSS (button stays visible on touch).
 */
export function initProductCards(): void {
	if (prefersReducedMotion() || !canHover()) return;

	const cards = gsap.utils.toArray<HTMLElement>('[data-nt="satin-product-card"]');
	cards.forEach(setupCard);
}

function setupCard(card: HTMLElement): void {
	const button = card.querySelector<HTMLElement>("[data-add-to-cart]");

	gsap.set(card, { transformPerspective: 700 });
	if (button) gsap.set(button, { autoAlpha: 0, y: 8 });

	const rotX = gsap.quickTo(card, "rotationX", { duration: 0.4, ease: "power3" });
	const rotY = gsap.quickTo(card, "rotationY", { duration: 0.4, ease: "power3" });
	const moveY = gsap.quickTo(card, "y", { duration: 0.4, ease: "power3" });

	const onMove = (e: PointerEvent) => {
		const rect = card.getBoundingClientRect();
		const px = (e.clientX - rect.left) / rect.width; // 0..1
		const py = (e.clientY - rect.top) / rect.height; // 0..1
		rotY((px - 0.5) * 2 * MAX_TILT);
		rotX((0.5 - py) * 2 * MAX_TILT);
	};

	const showButton = () => {
		if (button) gsap.to(button, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" });
	};
	const hideButton = () => {
		if (button) gsap.to(button, { autoAlpha: 0, y: 8, duration: 0.25, ease: "power2.in" });
	};

	card.addEventListener("pointerenter", () => {
		moveY(-6);
		gsap.to(card, { boxShadow: "0 18px 40px rgba(0,0,0,0.12)", duration: 0.4 });
		showButton();
		card.addEventListener("pointermove", onMove);
	});

	card.addEventListener("pointerleave", () => {
		card.removeEventListener("pointermove", onMove);
		rotX(0);
		rotY(0);
		moveY(0);
		gsap.to(card, { boxShadow: "0 0px 0px rgba(0,0,0,0)", duration: 0.4 });
		hideButton();
	});

	// Keyboard users: reveal while focus is inside the card.
	card.addEventListener("focusin", showButton);
	card.addEventListener("focusout", (e) => {
		if (!card.contains(e.relatedTarget as Node)) hideButton();
	});
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/gsap/product-card.ts
git commit -m "feat(satin): GSAP product-card 3D tilt, lift, button reveal"
```

---

### Task 5: Search autocomplete (markup + logic)

**Files:**
- Modify: `src/components/Header.astro`
- Create: `src/scripts/gsap/search.ts`

- [ ] **Step 1: Add the search index + suggestion containers to Header**

In `src/components/Header.astro` frontmatter, add the import and index right after line 3 (`import { SITE_TITLE } from "../consts";`):
```ts
import { catalogProducts } from "../data/products";

const searchIndex = catalogProducts.map((p) => ({
	id: p.id,
	name: p.name,
	price: p.price,
	image: p.image,
	href: `/products/${p.id}`,
}));
```

In the desktop search panel, replace the whole block (current lines 153–158) with the version that adds a `data-search-results` container after the form:
```astro
		<!-- Search Panel -->
		<div data-search-panel class="satin-pad hidden w-full border-t border-[#DDDDDD] bg-white py-4" hidden>
			<form role="search" action="/catalog" method="get" class="satin-container flex h-10 items-center justify-between gap-2 border border-[#DDDDDD] bg-white pl-3 pr-1">
				<input type="search" name="q" placeholder="Поиск..." aria-label="Поиск" autocomplete="off" class="min-w-0 flex-1 bg-transparent font-manrope text-sm font-light leading-normal text-[#000000] placeholder:text-[#999999] outline-none" />
				<button type="submit" class="flex h-8 shrink-0 items-center justify-center bg-[#000000] px-4 font-manrope text-[12px] font-normal uppercase leading-normal text-white transition-opacity hover:opacity-95">Найти</button>
			</form>
			<div data-search-results role="listbox" aria-label="Подсказки поиска" class="satin-container mt-1 hidden flex-col border border-[#DDDDDD] bg-white"></div>
		</div>
```

In the mobile burger menu, add a `data-search-results` container immediately after the search-row `</div>` (the row currently ending at line 173, before the `<nav ...>` at line 175):
```astro
			<div data-search-results role="listbox" aria-label="Подсказки поиска" class="mt-2 hidden flex-col border border-[#DDDDDD] bg-white"></div>
```

At the very end of the file, just before the closing `</div>` of the sticky wrapper (the last line, currently line 189), add the serialized index:
```astro
	<script type="application/json" data-search-index set:html={JSON.stringify(searchIndex)}></script>
```

- [ ] **Step 2: Implement the search module**

Create `src/scripts/gsap/search.ts`:
```ts
import { gsap, prefersReducedMotion } from "./core";

interface SearchItem {
	id: string;
	name: string;
	price: string;
	image: string;
	href: string;
}

const MAX_RESULTS = 6;
const DEBOUNCE_MS = 120;

function loadIndex(): SearchItem[] {
	const el = document.querySelector<HTMLScriptElement>("[data-search-index]");
	if (!el?.textContent) return [];
	try {
		return JSON.parse(el.textContent) as SearchItem[];
	} catch {
		return [];
	}
}

function rowHtml(item: SearchItem): string {
	return `
		<a href="${item.href}" data-search-item role="option"
			class="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-[#F5F5F5] aria-selected:bg-[#F5F5F5]">
			<img src="${item.image}" alt="" loading="lazy" class="h-12 w-9 shrink-0 object-cover" />
			<span class="flex min-w-0 flex-col">
				<span class="truncate font-manrope text-[14px] font-normal leading-tight text-[#000000]">${item.name}</span>
				<span class="font-manrope text-[12px] font-light leading-tight text-[#999999]">${item.price}</span>
			</span>
		</a>`;
}

function setupScope(input: HTMLInputElement, results: HTMLElement, index: SearchItem[]): void {
	const reduced = prefersReducedMotion();
	let active = -1;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const items = (): HTMLAnchorElement[] =>
		Array.from(results.querySelectorAll<HTMLAnchorElement>("[data-search-item]"));

	const hide = () => {
		results.classList.add("hidden");
		results.classList.remove("flex");
		results.innerHTML = "";
		active = -1;
	};

	const setActive = (next: number) => {
		const all = items();
		if (!all.length) return;
		active = (next + all.length) % all.length;
		all.forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
		all[active].scrollIntoView({ block: "nearest" });
	};

	const render = (query: string) => {
		const q = query.trim().toLowerCase();
		if (!q) return hide();
		const matches = index.filter((it) => it.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
		if (!matches.length) return hide();

		results.innerHTML = matches.map(rowHtml).join("");
		results.classList.remove("hidden");
		results.classList.add("flex");
		active = -1;

		if (!reduced) {
			gsap.fromTo(results, { autoAlpha: 0, y: -6 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out" });
			gsap.from(items(), { autoAlpha: 0, y: 8, duration: 0.2, ease: "power2.out", stagger: 0.04 });
		}
	};

	input.addEventListener("input", () => {
		clearTimeout(timer);
		timer = setTimeout(() => render(input.value), DEBOUNCE_MS);
	});

	input.addEventListener("keydown", (e) => {
		const all = items();
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive(active + 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive(active - 1);
		} else if (e.key === "Enter") {
			if (active >= 0 && all[active]) {
				e.preventDefault();
				window.location.href = all[active].href;
			}
		} else if (e.key === "Escape") {
			hide();
		}
	});

	document.addEventListener("click", (e) => {
		if (!results.contains(e.target as Node) && e.target !== input) hide();
	});
}

export function initSearch(): void {
	const index = loadIndex();
	if (!index.length) return;

	document.querySelectorAll<HTMLElement>("[data-search-results]").forEach((results) => {
		// The matching input is the search field within the same form-bearing scope.
		const scope = results.parentElement;
		const input = scope?.querySelector<HTMLInputElement>("input[type='search']");
		if (input) setupScope(input, results, index);
	});
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm build
```
Expected: build passes; the rendered HTML contains `data-search-index` and two `data-search-results` containers.

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.astro src/scripts/gsap/search.ts
git commit -m "feat(satin): search autocomplete with animated suggestions"
```

---

### Task 6: GSAP-driven cart drawer

**Files:**
- Create: `src/scripts/gsap/cart-drawer.ts`

- [ ] **Step 1: Implement the drawer animation**

Create `src/scripts/gsap/cart-drawer.ts`:
```ts
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
	gsap.set(panel, { xPercent: 100 });
	gsap.set(overlay, { autoAlpha: 0 });

	const open = () => {
		root.style.pointerEvents = "auto";
		gsap.to(overlay, { autoAlpha: 1, duration: reduced ? 0 : 0.3, ease: "power2.out" });
		gsap.to(panel, { xPercent: 0, duration: reduced ? 0 : 0.5, ease: reduced ? "none" : "back.out(1.1)" });
	};

	const close = () => {
		gsap.to(overlay, { autoAlpha: 0, duration: reduced ? 0 : 0.3, ease: "power2.in" });
		gsap.to(panel, {
			xPercent: 100,
			duration: reduced ? 0 : 0.4,
			ease: "power3.in",
			onComplete: () => {
				root.style.pointerEvents = "none";
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
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/gsap/cart-drawer.ts
git commit -m "feat(satin): GSAP-driven cart drawer over DS data-state"
```

---

### Task 7: Entry point + Layout wiring

**Files:**
- Create: `src/scripts/gsap/index.ts`
- Modify: `src/layouts/Layout.astro:29-32`

- [ ] **Step 1: Create the entry module**

Create `src/scripts/gsap/index.ts`:
```ts
import { initSectionReveals } from "./sections";
import { initProductCards } from "./product-card";
import { initSearch } from "./search";
import { initCartDrawer } from "./cart-drawer";

const start = (): void => {
	initSectionReveals();
	initProductCards();
	initSearch();
	initCartDrawer();
};

if (document.readyState !== "loading") start();
else document.addEventListener("DOMContentLoaded", start);
```

- [ ] **Step 2: Import the entry in Layout**

In `src/layouts/Layout.astro`, replace the existing script block (lines 29–32) with:
```astro
		<NtCartDrawer rootId="satin-cart-drawer-root" eventPrefix="satin:cart" />
		<script>
			import { initCartUI } from "../lib/cart";
			import "../scripts/gsap/index";
			initCartUI();
		</script>
```
(The `<NtCartDrawer ... />` line is already present at line 28 — shown for context; do not duplicate it.)

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm build
```
Expected: build passes; the GSAP entry is bundled into the page scripts.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/gsap/index.ts src/layouts/Layout.astro
git commit -m "feat(satin): wire GSAP entry into Layout"
```

---

### Task 8: Full build + manual smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Clean build**

Run:
```bash
pnpm build
```
Expected: completes with no errors/warnings about the new modules.

- [ ] **Step 2: Preview and smoke-test**

Run:
```bash
pnpm preview
```
Then open the printed URL and confirm:
- Home: sections fade + slide in on scroll (alternating sides); reload to re-check the hero.
- Product cards (home "Popular" / catalog): tilt-follow-cursor + lift on hover; "В корзину" button slides up on hover and on keyboard focus.
- Header search (desktop): typing shows up to 6 animated suggestions; ↑/↓ highlights, Enter/click navigates to the product, Esc/outside-click closes.
- Cart: clicking "В корзину" auto-opens the drawer with a GSAP slide (slight overshoot); the header cart button and overlay/close also animate; page is clickable again after close.
- Reduced motion: enable OS "Reduce motion", reload — sections/cards/search appear instantly; drawer opens without overshoot.
- Touch emulation (DevTools): the "В корзину" button stays visible (no hover dependence).

- [ ] **Step 3: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "fix(satin): GSAP animation smoke-test adjustments"
```
(Skip if nothing changed.)

---

## Self-Review (completed)

**Spec coverage:** §1 sections → Task 3; §2 card tilt+lift → Task 4; §3 add-to-cart reveal → Task 4 + Task 2 CSS; §4 search autocomplete → Task 5; §5 cart drawer → Task 6 + Task 2 CSS; reduced-motion → every module via `core.ts`; `@gsap/react` removal → Task 1; entry/Layout wiring → Task 7; verification → Task 8. All covered.

**Deviation from spec (intentional, low-risk):** `SatinProductCard.astro` does **not** need editing — the 3D perspective is applied in JS (`transformPerspective`) and the button's hidden state comes from `gsap-overrides.css`, so the card markup is untouched. Search autocomplete is wired to **both** the desktop search panel and the mobile burger search (both `data-search-results` containers), as specified.

**Type consistency:** `initSectionReveals` / `initProductCards` / `initSearch` / `initCartDrawer` names match between their modules and `index.ts`. `SearchItem` shape matches the `searchIndex` serialized in `Header.astro` (`id, name, price, image, href`).

**Placeholder scan:** none — every step contains full code or exact commands.
