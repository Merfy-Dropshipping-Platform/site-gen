/**
 * Префикс пути статики для Astro base (`import.meta.env.BASE_URL`).
 * При деплое в подкаталоге (`/rose/`) превращает `/icons/x.svg` → `/rose/icons/x.svg`.
 */
export function withBase(absolutePath: string): string {
	const p = absolutePath.startsWith("/") ? absolutePath : `/${absolutePath}`;
	const raw = import.meta.env.BASE_URL ?? "/";
	const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
	if (!base) return p;
	return `${base}${p}`;
}
