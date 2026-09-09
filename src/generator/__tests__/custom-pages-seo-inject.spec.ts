import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { injectCustomPagesSeo, seoMetaToHomeSeo } from "../custom-pages-seo-inject";

const SKELETON = `<html><head>
<title>Page</title>
<meta name="description" content="ph">
<meta property="og:title" content="Page">
<meta property="og:description" content="ph">
<meta property="twitter:title" content="Page">
<meta property="twitter:description" content="ph">
</head><body></body></html>`;

describe("custom-pages-seo-inject — injectCustomPagesSeo", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "cps-"));
	});
	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	const writePage = async (slug: string) => {
		await fs.mkdir(path.join(dir, slug), { recursive: true });
		await fs.writeFile(path.join(dir, slug, "index.html"), SKELETON, "utf8");
	};

	it("патчит кастомную страницу по её slug (title/description/keywords)", async () => {
		await writePage("delivery");
		const rev = {
			pages: [
				{
					id: "page-custom-1",
					role: "custom",
					isCustom: true,
					slug: "delivery",
					seo: { title: "Доставка", description: "Как мы доставляем", keywords: "a, b" },
				},
			],
		};
		const count = await injectCustomPagesSeo(dir, rev);
		expect(count).toBe(1);
		const html = await fs.readFile(path.join(dir, "delivery", "index.html"), "utf8");
		expect(html).toContain("<title>Доставка</title>");
		expect(html).toContain(`<meta name="description" content="Как мы доставляем">`);
		expect(html).toContain(`content="a, b"`);
	});

	it("пропускает системные и home", async () => {
		await writePage("catalog");
		await writePage("home");
		const rev = {
			pages: [
				{ id: "page-catalog", role: "system", isCustom: false, slug: "catalog", seo: { title: "X" } },
				{ id: "home", role: "custom", isCustom: true, slug: "home", seo: { title: "Y" } },
			],
		};
		const count = await injectCustomPagesSeo(dir, rev);
		expect(count).toBe(0);
		expect(await fs.readFile(path.join(dir, "catalog", "index.html"), "utf8")).toBe(SKELETON);
	});

	it("пропускает кастомную страницу со слагом verbatim-роута темы (blog) — не перезаписывает системную", async () => {
		await writePage("blog");
		const rev = {
			pages: [{ id: "c1", isCustom: true, slug: "blog", seo: { title: "Мой блог" } }],
		};
		const count = await injectCustomPagesSeo(dir, rev);
		expect(count).toBe(0);
		// системная blog-страница не тронута
		expect(await fs.readFile(path.join(dir, "blog", "index.html"), "utf8")).toBe(SKELETON);
	});

	it("кастомная без seo → skip; отсутствующий dist-файл → skip без throw", async () => {
		const rev = {
			pages: [
				{ id: "p1", role: "custom", isCustom: true, slug: "no-seo", seo: null },
				{ id: "p2", role: "custom", isCustom: true, slug: "not-built", seo: { title: "Z" } },
			],
		};
		expect(await injectCustomPagesSeo(dir, rev)).toBe(0);
	});

	it("несколько кастомных страниц → счётчик пропатченных", async () => {
		await writePage("about");
		await writePage("faq");
		const rev = {
			pages: [
				{ id: "c1", isCustom: true, slug: "about", seo: { title: "О нас" } },
				{ id: "c2", isCustom: true, slug: "faq", seo: { description: "Вопросы" } },
			],
		};
		expect(await injectCustomPagesSeo(dir, rev)).toBe(2);
	});

	it("пустой/битый revData → 0 без throw", async () => {
		expect(await injectCustomPagesSeo(dir, null)).toBe(0);
		expect(await injectCustomPagesSeo(dir, {})).toBe(0);
		expect(await injectCustomPagesSeo(dir, { pages: "not-array" })).toBe(0);
	});
});

describe("custom-pages-seo-inject — seoMetaToHomeSeo", () => {
	it("проецирует title/description/keywords", () => {
		expect(seoMetaToHomeSeo({ title: "t", description: "d", keywords: "k" })).toEqual({
			title: "t",
			description: "d",
			keywords: "k",
		});
	});
	it("null/undefined → пустая проекция", () => {
		expect(seoMetaToHomeSeo(null)).toEqual({
			title: undefined,
			description: undefined,
			keywords: undefined,
		});
	});
});
