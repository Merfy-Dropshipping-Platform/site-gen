#!/usr/bin/env node
/**
 * Конвертирует все PNG/JPG из public/images/ (рекурсивно) в .webp рядом с оригиналом.
 * После успешной конвертации удаляет исходный PNG/JPEG — в public/images/ остаётся только WebP.
 * Если конвертация не удалась, исходник сохраняется.
 *
 * Hero-слайды: `vanilla-hero-slide-{1,2,3}.png` — только фон (без текста в PNG).
 * Существующие `.webp` >250KB или шире 1920px пересжимаются при prebuild.
 * После замены файлов запустите этот скрипт или `pnpm build` (prebuild).
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
/** WebP >250KB или больше MAX_DIMENSION — пересжать (quality 80, без upscale). */
const WEBP_SIZE_THRESHOLD = 250_000;

async function walkWebp(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const out = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkWebp(full)));
		} else if (/\.webp$/i.test(entry.name)) {
			out.push(full);
		}
	}
	return out;
}

async function optimizeWebp(file) {
	const stat = await fs.stat(file);
	const meta = await sharp(file).metadata();
	const needsResize =
		(meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION;
	const needsRecompress = stat.size > WEBP_SIZE_THRESHOLD || needsResize;
	if (!needsRecompress) {
		return { file, rel: path.relative(process.cwd(), file), skipped: true };
	}

	const tmp = `${file}.tmp.webp`;
	let pipeline = sharp(file).rotate();
	if (needsResize) {
		pipeline = pipeline.resize({
			width: MAX_DIMENSION,
			height: MAX_DIMENSION,
			fit: "inside",
			withoutEnlargement: true,
		});
	}

	await pipeline.webp({ quality: QUALITY, effort: 5 }).toFile(tmp);
	const newStat = await fs.stat(tmp);
	const rel = path.relative(process.cwd(), file);

	if (newStat.size < stat.size || needsResize) {
		await fs.rename(tmp, file);
		return {
			file,
			rel,
			srcSize: stat.size,
			dstSize: newStat.size,
			saved: ((1 - newStat.size / stat.size) * 100).toFixed(1),
			kind: "webp",
		};
	}

	await fs.unlink(tmp);
	return { file, rel, skipped: true };
}

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

async function deleteSource(file) {
	try {
		await fs.unlink(file);
		return true;
	} catch {
		return false;
	}
}

async function convert(file) {
	const dst = file.replace(/\.(png|jpe?g)$/i, ".webp");
	const rel = path.relative(process.cwd(), file);

	if (!(await shouldRegenerate(file, dst))) {
		const deleted = await deleteSource(file);
		return { file, rel, skipped: true, deleted };
	}

	const srcSize = (await fs.stat(file)).size;

	try {
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
		const deleted = await deleteSource(file);

		return {
			file,
			rel,
			srcSize,
			dstSize,
			saved: ((1 - dstSize / srcSize) * 100).toFixed(1),
			deleted,
		};
	} catch (error) {
		console.error(`✗ ${rel}  conversion failed — source kept`);
		throw error;
	}
}

const pngFiles = await walk(ROOT_PATH);
let totalSrc = 0;
let totalDst = 0;
let converted = 0;
let skipped = 0;
let deleted = 0;

for (const file of pngFiles) {
	const res = await convert(file);
	if (res.skipped) {
		skipped += 1;
		if (res.deleted) {
			deleted += 1;
			console.log(`✓ ${res.rel}  source removed (webp up to date)`);
		}
		continue;
	}
	totalSrc += res.srcSize;
	totalDst += res.dstSize;
	converted += 1;
	if (res.deleted) deleted += 1;
	console.log(
		`✓ ${res.rel}  ${(res.srcSize / 1024).toFixed(0)}KB → ${(res.dstSize / 1024).toFixed(0)}KB  (-${res.saved}%)${res.deleted ? "  [source deleted]" : ""}`
	);
}

const webpFiles = await walkWebp(ROOT_PATH);
let webpOptimized = 0;

for (const file of webpFiles) {
	const res = await optimizeWebp(file);
	if (res.skipped) continue;
	totalSrc += res.srcSize;
	totalDst += res.dstSize;
	webpOptimized += 1;
	console.log(
		`✓ ${res.rel}  ${(res.srcSize / 1024).toFixed(0)}KB → ${(res.dstSize / 1024).toFixed(0)}KB  (-${res.saved}%)  [webp]`
	);
}

console.log(
	`\nDone: ${converted} png converted, ${webpOptimized} webp recompressed, ${skipped} png skipped, ${deleted} sources deleted, total ${(totalSrc / 1024 / 1024).toFixed(1)}MB → ${(totalDst / 1024 / 1024).toFixed(1)}MB`
);
