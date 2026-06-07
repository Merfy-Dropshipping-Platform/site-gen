#!/usr/bin/env node
/**
 * Конвертирует все PNG/JPG из public/images/ (рекурсивно) в .webp рядом с оригиналом.
 * Если .webp уже существует и новее исходника — пропускает.
 * Не удаляет оригиналы (нужны как fallback в <picture>).
 *
 * Запуск: pnpm run images:optimize / npm run images:optimize
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = new URL("../public/images/", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
await fs.mkdir(ROOT_PATH, { recursive: true });

const QUALITY = 80;
const MAX_DIMENSION = 1920;

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const out = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walk(full)));
		} else if (/\.(png|jpe?g)$/i.test(entry.name)) {
			out.push(full);
		}
	}
	return out;
}

async function shouldRegenerate(src, dst) {
	try {
		const [srcStat, dstStat] = await Promise.all([fs.stat(src), fs.stat(dst)]);
		return srcStat.mtimeMs > dstStat.mtimeMs;
	} catch {
		return true;
	}
}

async function convert(file) {
	const dst = file.replace(/\.(png|jpe?g)$/i, ".webp");
	if (!(await shouldRegenerate(file, dst))) return { file, skipped: true };

	const srcSize = (await fs.stat(file)).size;

	await sharp(file)
		.rotate()
		.resize({
			width: MAX_DIMENSION,
			height: MAX_DIMENSION,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: QUALITY, effort: 5 })
		.toFile(dst);

	const dstSize = (await fs.stat(dst)).size;
	return {
		file,
		srcSize,
		dstSize,
		saved: ((1 - dstSize / srcSize) * 100).toFixed(1),
	};
}

const files = await walk(ROOT_PATH);
let totalSrc = 0;
let totalDst = 0;
let converted = 0;
let skipped = 0;

for (const file of files) {
	const res = await convert(file);
	const rel = path.relative(process.cwd(), res.file);
	if (res.skipped) {
		skipped += 1;
		continue;
	}
	totalSrc += res.srcSize;
	totalDst += res.dstSize;
	converted += 1;
	console.log(
		`✓ ${rel}  ${(res.srcSize / 1024).toFixed(0)}KB → ${(res.dstSize / 1024).toFixed(0)}KB  (-${res.saved}%)`
	);
}

console.log(
	`\nDone: ${converted} converted, ${skipped} skipped, total ${(totalSrc / 1024 / 1024).toFixed(1)}MB → ${(totalDst / 1024 / 1024).toFixed(1)}MB`
);
