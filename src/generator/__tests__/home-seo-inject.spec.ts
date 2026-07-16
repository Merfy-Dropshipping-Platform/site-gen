import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { applyHomeSeoToHtml, injectHomeSeo } from "../home-seo-inject";

const SKELETON = `<html><head>
<title>Мой сайт</title>
<meta name="description" content="placeholder desc">
<meta property="og:title" content="Мой сайт">
<meta property="og:description" content="placeholder desc">
<meta property="twitter:title" content="Мой сайт">
<meta property="twitter:description" content="placeholder desc">
</head><body>home</body></html>`;

describe("home-seo-inject — applyHomeSeoToHtml", () => {
	it("пустой SEO → HTML без изменений", () => {
		expect(applyHomeSeoToHtml(SKELETON, undefined)).toBe(SKELETON);
		expect(applyHomeSeoToHtml(SKELETON, null)).toBe(SKELETON);
		expect(applyHomeSeoToHtml(SKELETON, {})).toBe(SKELETON);
		expect(applyHomeSeoToHtml(SKELETON, { title: "  " })).toBe(SKELETON); // только пробелы
	});

	it("title патчит <title> + og:title + twitter:title", () => {
		const out = applyHomeSeoToHtml(SKELETON, { title: "Новый заголовок" });
		expect(out).toContain("<title>Новый заголовок</title>");
		expect(out).toContain(`<meta property="og:title" content="Новый заголовок">`);
		expect(out).toContain(`<meta property="twitter:title" content="Новый заголовок">`);
		// description не тронут
		expect(out).toContain(`content="placeholder desc"`);
	});

	it("description патчит meta description + og/twitter description", () => {
		const out = applyHomeSeoToHtml(SKELETON, { description: "Живое описание" });
		expect(out).toContain(`<meta name="description" content="Живое описание">`);
		expect(out).toContain(`<meta property="og:description" content="Живое описание">`);
		expect(out).toContain(`<meta property="twitter:description" content="Живое описание">`);
		// title не тронут
		expect(out).toContain("<title>Мой сайт</title>");
	});

	it("keywords вставляет <meta keywords> перед </head> (только непусто, идемпотентно)", () => {
		const out = applyHomeSeoToHtml(SKELETON, { keywords: "обувь, кроссовки" });
		expect(out).toMatch(/<meta name="keywords" data-merfy-seo content="обувь, кроссовки">\s*<\/head>/);
		// повторный прогон не дублирует
		const twice = applyHomeSeoToHtml(out, { keywords: "обувь, кроссовки" });
		expect(twice.match(/name="keywords"/g)?.length).toBe(1);
	});

	it("пустой keywords → тег не вставляется", () => {
		const out = applyHomeSeoToHtml(SKELETON, { title: "X", keywords: "" });
		expect(out).not.toContain("keywords");
	});

	it("& в значениях экранируется", () => {
		const out = applyHomeSeoToHtml(SKELETON, { title: "A & B" });
		expect(out).toContain("<title>A &amp; B</title>");
		expect(out).not.toContain("<title>A & B</title>");
	});

	it("$-паттерны в keywords вставляются дословно (замена через функцию)", () => {
		const out = applyHomeSeoToHtml(SKELETON, { keywords: "a$1b" });
		expect(out).toContain(`content="a$1b"`);
	});

	it("$-паттерны в title/description дословны (цена «$100», «$$») — не порча тегов", () => {
		const out = applyHomeSeoToHtml(SKELETON, { title: "$100 off", description: "Big $$ Sale" });
		expect(out).toContain("<title>$100 off</title>");
		expect(out).toContain(`content="$100 off"`); // og/twitter title
		expect(out).toContain(`content="Big $$ Sale"`); // og/twitter/meta description
		// нет удвоения префикса / голых <meta внутри content (симптом $-порчи)
		expect(out).not.toContain(`content="<meta`);
	});

	it("все три поля вместе", () => {
		const out = applyHomeSeoToHtml(SKELETON, {
			title: "T",
			description: "D",
			keywords: "K",
		});
		expect(out).toContain("<title>T</title>");
		expect(out).toContain(`<meta name="description" content="D">`);
		expect(out).toContain(`content="K">`);
	});
});

describe("home-seo-inject — injectHomeSeo (fs sandbox)", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "home-seo-"));
	});
	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	it("патчит dist/index.html и возвращает true", async () => {
		await fs.writeFile(path.join(dir, "index.html"), SKELETON, "utf8");
		const changed = await injectHomeSeo(dir, { title: "Главная SEO", description: "Опис" });
		expect(changed).toBe(true);
		const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
		expect(html).toContain("<title>Главная SEO</title>");
		expect(html).toContain(`<meta name="description" content="Опис">`);
	});

	it("трогает ТОЛЬКО index.html (другие страницы не меняются)", async () => {
		await fs.writeFile(path.join(dir, "index.html"), SKELETON, "utf8");
		await fs.writeFile(path.join(dir, "catalog.html"), SKELETON, "utf8");
		await injectHomeSeo(dir, { title: "Главная" });
		const catalog = await fs.readFile(path.join(dir, "catalog.html"), "utf8");
		expect(catalog).toBe(SKELETON); // каталог не тронут
	});

	it("пустой SEO → noop (false, файл не тронут)", async () => {
		await fs.writeFile(path.join(dir, "index.html"), SKELETON, "utf8");
		const changed = await injectHomeSeo(dir, {});
		expect(changed).toBe(false);
		expect(await fs.readFile(path.join(dir, "index.html"), "utf8")).toBe(SKELETON);
	});

	it("нет index.html → false, без падения", async () => {
		expect(await injectHomeSeo(dir, { title: "X" })).toBe(false);
	});
});
