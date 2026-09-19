import * as fs from "fs/promises";
import * as path from "path";

/**
 * Оживление исторических ссылок `/catalog/<id|slug>`.
 *
 * До 19.09.2026 конструктор писал ссылку на коллекцию как `/catalog/<uuid>`
 * (починено в constructor `src/lib/collectionHref.ts`), и такие ссылки уже
 * лежат в сохранённых сайтах. Маршрута `/catalog/<x>` на витрине нет: все пять
 * тем публикуются веткой themes-v2, которая копирует готовый dist и не зовёт
 * `scaffold-builder` — то есть `generateCatalogSlugPage` («084 Stage 3 uniform
 * catalog redirect») не выполняется ни для одной темы. Замер прода 19.09:
 * `/catalog/<id>` → 404 у flux, satin и rose; 200 у vanilla и bloom дают
 * захардкоженные страницы верстальщиков (`themes/vanilla/src/pages/catalog/*`).
 *
 * Поэтому рядом с per-collection страницами `collections/<slug>/index.html`
 * кладём `catalog/<slug>/index.html` и `catalog/<id>/index.html` — редирект на
 * канонический `/collections/<slug>`. Уже существующие файлы не трогаем, иначе
 * затрём рабочие страницы темы.
 */
export type RedirectCollection = {
	id?: unknown;
	slug?: unknown;
	handle?: unknown;
	name?: unknown;
	title?: unknown;
};

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeJs(value: string): string {
	return JSON.stringify(value).slice(1, -1);
}

/**
 * HTML страницы-редиректа. `refresh` работает без JS, скрипт переносит query и
 * hash (`/catalog/<id>?sort=new` → `/collections/<slug>?sort=new`), canonical
 * уводит вес на каноническую страницу коллекции.
 */
export function renderCatalogRedirectHtml(
	slug: string,
	name: string | undefined,
	publicUrl: string,
): string {
	const target = `/collections/${encodeURIComponent(slug)}`;
	const canonical = publicUrl
		? `${publicUrl.replace(/\/+$/, "")}${target}`
		: target;
	const label = escapeAttr(name?.trim() || "Коллекция");
	return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label}</title>
<link rel="canonical" href="${escapeAttr(canonical)}">
<meta http-equiv="refresh" content="0; url=${escapeAttr(target)}">
<script>location.replace("${escapeJs(target)}" + location.search + location.hash);</script>
</head>
<body>
<p><a href="${escapeAttr(target)}">${label}</a></p>
</body>
</html>
`;
}

/**
 * Пишет редиректы в `<dist>/catalog/<slug>/index.html` и `<dist>/catalog/<id>/index.html`.
 * Возвращает, сколько написано и сколько пропущено (файл уже был).
 */
export async function writeCatalogRedirects(
	distDir: string,
	collections: readonly RedirectCollection[],
	publicUrl: string,
): Promise<{ written: number; skipped: number }> {
	let written = 0;
	let skipped = 0;

	for (const c of collections) {
		const rawSlug = c.slug ?? c.handle ?? c.id;
		const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
		if (!slug) continue;
		const name =
			(typeof c.name === "string" && c.name) ||
			(typeof c.title === "string" && c.title) ||
			undefined;
		const html = renderCatalogRedirectHtml(slug, name || undefined, publicUrl);

		const id = typeof c.id === "string" ? c.id.trim() : "";
		const keys = id && id !== slug ? [slug, id] : [slug];
		for (const key of keys) {
			// Ключ уезжает в путь файла — отсекаем всё, что может вывести из dist.
			if (key.includes("/") || key.includes("\\") || key === "." || key === "..") {
				continue;
			}
			const target = path.join(distDir, "catalog", key, "index.html");
			// Страница темы (хардкод vanilla) всегда сильнее нашего редиректа.
			const exists = await fs
				.access(target)
				.then(() => true)
				.catch(() => false);
			if (exists) {
				skipped++;
				continue;
			}
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, html, "utf8");
			written++;
		}
	}

	return { written, skipped };
}
