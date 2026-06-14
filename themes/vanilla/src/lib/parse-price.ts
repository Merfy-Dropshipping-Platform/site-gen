/** «1 940₽» → 1940 */
export function parsePriceString(price: string): number {
	const digits = price.replace(/[^\d]/g, "");
	return Number.parseInt(digits, 10) || 0;
}
