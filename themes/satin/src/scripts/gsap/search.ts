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

// NOTE: values are injected via innerHTML unescaped — safe because the index
// is built at build time from local catalogProducts (no user input). If the
// data source ever becomes user-controlled, escape these fields.
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
			gsap.killTweensOf(results);
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
