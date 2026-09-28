/**
 * Кнопка колонки «Мультиколонн» — одно правило для всех тем.
 *
 * Подпись кнопки — только «Название ссылки» (`linkText`). Пусто или одни
 * пробелы — кнопки нет, как обещает подсказка поля «Оставьте пустой, чтобы
 * скрыть». Выбиралка ссылки пишет в `link` объект `{ href, text }`, где `text` —
 * имя выбранной страницы, коллекции или товара; подписью кнопки оно не
 * становится (владелец 26.09: у rose/vanilla/flux/bloom кнопка показывала
 * «О нас» вместо введённого «Подробнее», у satin пустое поле не скрывало кнопку).
 *
 * Старый формат стартового контента хранил подпись в самой ссылке:
 * `link: { text, href, enabled }`. Выбиралка поля `enabled` не пишет никогда,
 * поэтому по нему старую ссылку и узнаём; её подпись читается, только пока
 * поля «Название ссылки» в колонке нет вовсе.
 *
 * Сторож: src/themes/__tests__/multicolumns-column-link-label.spec.ts.
 */
export type MultiColumnLink = { text: string; href: string };

type LegacyLinkEnvelope = { text?: unknown; href?: unknown; enabled?: unknown };

/** Куда ведёт кнопка, если ссылку не выбрали. */
const FALLBACK_HREF = "/catalog";

const filled = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

const isLegacyEnvelope = (link: unknown): link is LegacyLinkEnvelope =>
	typeof link === "object" && link !== null && "enabled" in link;

function columnLabel(column: { linkText?: unknown; link?: unknown }): unknown {
	if (typeof column.linkText === "string") return column.linkText;
	if (!isLegacyEnvelope(column.link)) return undefined;
	return column.link.enabled === "false" ? undefined : column.link.text;
}

function columnHref(link: unknown): string {
	if (filled(link)) return link;
	const href = (link as { href?: unknown } | null | undefined)?.href;
	return filled(href) ? href : FALLBACK_HREF;
}

export function multiColumnLink(column: { linkText?: unknown; link?: unknown }): MultiColumnLink | undefined {
	const text = columnLabel(column);
	return filled(text) ? { text, href: columnHref(column.link) } : undefined;
}
