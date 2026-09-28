/**
 * Текст кнопки «Основного текста» — одно правило для всех тем.
 *
 * Кнопка есть, только когда в панели заполнено «Кнопка → Текст». Пусто или
 * одни пробелы — кнопки нет, и заглушки «Кнопка» тоже нет: в панели её не видно
 * (правило 3 контракта секций), мерчант не понимал, откуда кнопка и как её убрать.
 * Тестировщик: «при пустом инпуте в кнопке он отображает кнопку, не отображать
 * при пустом».
 *
 * Старое скрытое `cta` (стартовое наполнение тем: «К покупкам», «СМОТРЕТЬ
 * КАТАЛОГ») читается, только пока поля «Кнопка» в секции нет вовсе. Чтение
 * ревизии переносит его в поле панели (revision-migrations
 * `backfillMainTextLegacyButton`), дальше решает то, что мерчант видит в инпуте:
 * очищенный инпут сильнее старого `cta`.
 *
 * Сторож: src/themes/__tests__/main-text-button-empty.spec.ts.
 */
type ButtonLike = { text?: unknown } | null | undefined;

const filled = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export function mainTextButtonText(p: { button?: unknown; cta?: unknown }): string | undefined {
	const source = (p.button == null ? p.cta : p.button) as ButtonLike;
	const text = source?.text;
	return filled(text) ? text : undefined;
}
