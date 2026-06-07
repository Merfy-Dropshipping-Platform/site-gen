import fs from "node:fs";
import path from "node:path";

/** Cache-bust для /public/* — при деплое браузер подхватывает обновлённые webp. */
export function assetUrl(src: string): string {
	if (!src.startsWith("/")) return src;

	const rel = src.replace(/^\/+/, "");
	const filePath = path.join(process.cwd(), "public", rel);

	try {
		const stat = fs.statSync(filePath);
		return `${src}?v=${Math.floor(stat.mtimeMs)}`;
	} catch {
		const webpPath = src.replace(/\.(png|jpe?g)$/i, ".webp");
		if (webpPath !== src) {
			const webpRel = webpPath.replace(/^\/+/, "");
			try {
				const stat = fs.statSync(path.join(process.cwd(), "public", webpRel));
				return `${webpPath}?v=${Math.floor(stat.mtimeMs)}`;
			} catch {
				// fall through
			}
		}
		return src;
	}
}
