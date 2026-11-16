// Одна находка любой проверки магазина — один вид на все места (решение владельца 16.11: «чтобы проверки не лежали
// вразнобой»). Места — по тому, что проверке нужно на входе; устройство мест — README рядом.

// Места проверок. Здесь живут `html` (готовый HTML без браузера) и `browser` (открытая страница снимка черновика);
// остальные — в своих пакетах: `code` — приём секции (storefront-sections), `audit` — аудит страницы, `shop` — магазин
// целиком перед публикацией, `release` — выпуск (паспорт stand-check).
export type CheckPlace = 'code' | 'html' | 'browser' | 'audit' | 'shop' | 'release';

// Важность ставит проверка, последствие решает момент: при сохранении секции ошибка — отказ, в снимке — показать агенту.
export type CheckLevel = 'error' | 'warning';

export interface CheckFinding {
  place: CheckPlace;
  // Проверка: `semantic`.
  check: string;
  // Правило проверки: `heading-level`, `region`, `product-photo-alt`.
  rule: string;
  level: CheckLevel;
  // id экземпляра секции (`data-section-id`), где нашлось; null — вне секций.
  section: string | null;
  // Где на странице, словами: `h2 «Простые вещи»`, `img photo.jpg`.
  where: string;
  // «что не так · как починить».
  text: string;
  // Сколько одинаковых находок в этой секции (одно правило, один текст); `where` — у первой.
  count: number;
}

// Проверка не отработала — это не находка в магазине, а причина, почему находок может не хватать.
export interface CheckFailure {
  place: CheckPlace;
  check: string;
  reason: string;
}

export interface CheckReport {
  findings: CheckFinding[];
  failed: CheckFailure[];
}

// Одинаковые находки в секции — одной строкой со счётчиком: 30 фото товара без alt в слайдере — это одна правка шаблона.
export function grouped(findings: readonly Omit<CheckFinding, 'count'>[]): CheckFinding[] {
  const groups = new Map<string, CheckFinding>();
  for (const finding of findings) {
    const key = [finding.place, finding.check, finding.rule, finding.section ?? '', finding.text].join('\u0000');
    const known = groups.get(key);
    if (known === undefined) groups.set(key, { ...finding, count: 1 });
    else known.count += 1;
  }
  return [...groups.values()];
}

// Только находки нужных секций. `sections` не задан — все (снимок страницы целиком). Находки вне секций в снимок секций
// не идут: «на странице нет h1» приходит находкой той секции, где стоит первый заголовок.
export function inSections(findings: readonly CheckFinding[], sections?: readonly string[]): CheckFinding[] {
  if (sections === undefined) return [...findings];
  const wanted = new Set(sections);
  return findings.filter((finding) => finding.section !== null && wanted.has(finding.section));
}
