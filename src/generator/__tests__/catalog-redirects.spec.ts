import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
	renderCatalogRedirectHtml,
	writeCatalogRedirects,
} from "../catalog-redirects";

/**
 * Хвост бага тестера #1 (18.09): конструктор до 19.09 писал ссылки на коллекции
 * как `/catalog/<uuid>`. Такие ссылки уже лежат в сайтах мерчантов, а маршрута
 * `/catalog/<x>` на витрине нет — замер прода 19.09 дал 404 у flux, satin и rose
 * (200 у vanilla и bloom — там лежат захардкоженные страницы верстальщиков).
 *
 * Чиним со стороны витрины: рядом с `collections/<slug>/index.html` кладём
 * `catalog/<slug>/index.html` и `catalog/<id>/index.html` — лёгкий редирект на
 * канонический `/collections/<slug>`. Существующие файлы НЕ трогаем, иначе
 * затрём рабочие страницы vanilla.
 */
describe("catalog-redirects — оживление старых ссылок /catalog/<id>", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "catredir-"));
	});
	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	const read = (p: string) => fs.readFile(path.join(dir, p), "utf8");

	it("кладёт редирект и по слагу, и по id коллекции", async () => {
		const res = await writeCatalogRedirects(
			dir,
			[{ id: "1d25335c-0d6f-4271-8f4d-202f4d966147", slug: "tovary", name: "Товары" }],
			"https://shop.merfy.ru",
		);

		expect(res.written).toBe(2);
		const bySlug = await read("catalog/tovary/index.html");
		const byId = await read("catalog/1d25335c-0d6f-4271-8f4d-202f4d966147/index.html");
		for (const html of [bySlug, byId]) {
			expect(html).toContain('http-equiv="refresh"');
			expect(html).toContain("/collections/tovary");
			expect(html).toContain('rel="canonical" href="https://shop.merfy.ru/collections/tovary"');
		}
	});

	it("не трогает уже существующую страницу темы (хардкод vanilla)", async () => {
		await fs.mkdir(path.join(dir, "catalog", "textile"), { recursive: true });
		await fs.writeFile(path.join(dir, "catalog", "textile", "index.html"), "СТРАНИЦА ТЕМЫ", "utf8");

		const res = await writeCatalogRedirects(
			dir,
			[{ id: "c-1", slug: "textile", name: "Текстиль" }],
			"https://shop.merfy.ru",
		);

		expect(await read("catalog/textile/index.html")).toBe("СТРАНИЦА ТЕМЫ");
		expect(res.skipped).toBe(1);
		expect(res.written).toBe(1); // только по id
	});

	it("коллекция без слага редиректит на /collections/<id>", async () => {
		await writeCatalogRedirects(dir, [{ id: "c-2", name: "Без слага" }], "");
		expect(await read("catalog/c-2/index.html")).toContain("/collections/c-2");
	});

	it("экранирует кавычки в названии и слаге", () => {
		const html = renderCatalogRedirectHtml('a"b', 'Имя "в кавычках"', "");
		expect(html).not.toMatch(/url=\/collections\/a"b/);
		expect(html).toContain("&quot;");
	});

	it("переносит query и hash на целевой адрес", () => {
		expect(renderCatalogRedirectHtml("tovary", "Товары", "")).toContain("location.search");
	});
});

/**
 * Сторож ПОДКЛЮЧЕНИЯ, а не поведения: модуль выше можно оставить идеальным и
 * ни разу не позвать — тогда старые ссылки останутся битыми, а тесты будут
 * зелёными. Поэтому проверяем сам факт вызова в ветке themes-v2.
 */
describe("catalog-redirects подключён к сборке витрины", () => {
	it("build.service зовёт writeCatalogRedirects в блоке коллекций themes-v2", async () => {
		const src = await fs.readFile(
			path.join(__dirname, "..", "build.service.ts"),
			"utf8",
		);
		expect(src).toContain('from "./catalog-redirects"');
		expect(src).toContain("await writeCatalogRedirects(");
		const call = src.indexOf("await writeCatalogRedirects(");
		const tail = src.slice(call, call + 400);
		expect(tail).toContain("ctx.distDir");
		expect(tail).toContain("v2Store.collections");
	});
});
