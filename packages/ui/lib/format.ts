const currencySymbols: Record<string, string> = {
  RUB: "\u20BD",
  USD: "$",
  EUR: "\u20AC",
};

/**
 * Format price in minor units (kopecks) to display string.
 * formatMoney(2990, "RUB") → "2 990 ₽"
 * formatMoney(1500, "USD") → "$15.00"
 */
export function formatMoney(
  amount: number,
  currency: string = "RUB"
): string {
  const symbol = currencySymbols[currency] ?? currency;

  if (currency === "RUB") {
    const formatted = amount
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
    return `${formatted} ${symbol}`;
  }

  const major = (amount / 100).toFixed(2);
  return `${symbol}${major}`;
}

/**
 * Format discount percentage.
 * formatDiscount(15) → "-15%"
 * formatDiscount(0) → ""
 */
export function formatDiscount(percent: number): string {
  if (percent <= 0) return "";
  return `-${Math.round(percent)}%`;
}

/**
 * Russian pluralization.
 * pluralize(1, "товар", "товара", "товаров") → "товар"
 * pluralize(2, "товар", "товара", "товаров") → "товара"
 * pluralize(5, "товар", "товара", "товаров") → "товаров"
 */
export function pluralize(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
