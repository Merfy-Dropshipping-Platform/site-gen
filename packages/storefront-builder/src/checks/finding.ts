// Одна находка любой проверки магазина — один вид на все места (решение владельца 16.11: «чтобы проверки не лежали
// вразнобой»). Места — по тому, что проверке нужно на входе; устройство мест — README рядом.

import type { VitalsSummary } from './browser/vitals';

// Места проверок. Здесь живут `html` (готовый HTML без браузера) и `browser` (открытая страница снимка черновика);
// остальные — в своих пакетах: `code` — приём секции (storefront-sections), `audit` — аудит страницы, `shop` — магазин
// целиком перед публикацией, `release` — выпуск (паспорт stand-check).
export type CheckPlace = 'code' | 'html' | 'browser' | 'audit' | 'shop' | 'release';

// Важность ставит проверка, последствие решает момент: при сохранении секции ошибка — отказ, в снимке — показать агенту.
export type CheckLevel = 'error' | 'warning';

// Кто чинит находку: `silent` — агент молча (разметка и код, мерчант их не видит); `ask` — это данные магазина, агент
// предлагает и спрашивает мерчанта; `platform` — чинит платформа, агенту не показывается. Контракт с merfy-mcp.
export type CheckFix = 'silent' | 'ask' | 'platform';

// Кто чинит — по месту проверки (решение 19.11). Одна таблица: свои правила у проверок не заводим, а когда у проверки
// исключение — она задаёт `fix` сама (необязательное поле черновика находки).
export const FIX_BY_PLACE: Record<CheckPlace, CheckFix> = {
  code: 'silent',
  html: 'silent',
  browser: 'silent',
  audit: 'silent',
  shop: 'ask',
  release: 'platform',
};

// Исключения из таблицы мест — по коду проверки (правило находки `rule`, у старой формы — `code`; решение 19.11 и
// этап 5, 21.11). `ask` — исправление меняет вид или тексты, значит, решает мерчант: агент говорит, как исправит, и
// спрашивает. Нет в таблице — по месту. Спорные (`text-content`, `heading-level`, `nested-interactive`, `lcp-background`)
// остаются `silent`: агент выбирает исправление без смены вида (aria-label, тег без смены стиля).
export const FIX_BY_CHECK: Record<string, CheckFix> = {
  // Lighthouse, Web Vitals и семантика: картинке меняют пропорции, первый экран — показ, пустому заголовку — текст.
  'image-aspect-ratio': 'ask',
  'lcp-hidden': 'ask',
  'empty-heading': 'ask',
  // Проверки вёрстки (`LAYOUT_CODES`): правка вёрстки видна глазом.
  'row-unequal': 'ask',
  'row-not-filling': 'ask',
  'overflow-x': 'ask',
  'text-clipped': 'ask',
  overlap: 'ask',
  'image-distorted': 'ask',
  'columns-many': 'ask',
  'row-orphan': 'ask',
  'stack-tall': 'ask',
  'tap-small': 'ask',
  'text-small': 'ask',
};

// Старая форма находки (`LookFinding`): код проверки вёрстки — по таблице выше, остальное — по источнику. Детектор
// Impeccable ловит приёмы дизайна (градиентный текст, боковая рамка): любая правка меняет вид, поэтому все его коды `ask`.
const FIX_BY_LOOK_SOURCE: Record<'impeccable' | 'layout', CheckFix> = {
  impeccable: 'ask',
  layout: 'ask',
};

// Кто чинит находку нового вида: код проверки, иначе место.
export const fixOf = (place: CheckPlace, rule: string): CheckFix => FIX_BY_CHECK[rule] ?? FIX_BY_PLACE[place];

// Кто чинит находку старой формы: код проверки, иначе источник.
export const lookFixOf = (source: 'impeccable' | 'layout', code: string): CheckFix =>
  FIX_BY_CHECK[code] ?? FIX_BY_LOOK_SOURCE[source];

// Кто чинит находку в секции платформы (19.11, 21.11): платформенная — библиотечная секция, которую в магазине не
// меняли (`html/platform.ts`); её код — код платформы, а не агента. Что чинят правкой кода секции — молча (`silent`) или
// после вопроса (`ask`) — теперь дело платформы и агенту не показывается. Изменённая и своя секция сюда не попадают,
// даже если у неё есть роль (`data-role`): агент мог написать свою корзину.
export const FIX_ON_PLATFORM_SECTION: Record<CheckFix, CheckFix> = {
  silent: 'platform',
  ask: 'platform',
  platform: 'platform',
};

// Места, чьи находки от секции не зависят: вопрос мерчанту про данные магазина (`library-update`) остаётся `ask`.
const KEEP_FIX_ON_PLATFORM_SECTION: ReadonlySet<CheckPlace> = new Set<CheckPlace>(['shop']);

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
  // Кто чинит; в ответе заполнено всегда.
  fix: CheckFix;
}

// То, что отдаёт проверка: без счётчика (его ставит `grouped`) и, как правило, без `fix` (берётся из `FIX_BY_CHECK`,
// иначе из `FIX_BY_PLACE`).
export type FindingDraft = Omit<CheckFinding, 'count' | 'fix'> & { fix?: CheckFix };

// Проверка не отработала — это не находка в магазине, а причина, почему находок может не хватать.
export interface CheckFailure {
  place: CheckPlace;
  check: string;
  reason: string;
}

export interface CheckReport {
  findings: CheckFinding[];
  failed: CheckFailure[];
  // Сводка Web Vitals черновика (снимок страницы и секции). Нет замера — нет поля.
  vitals?: VitalsSummary;
}

// Одинаковые находки в секции — одной строкой со счётчиком: 30 фото товара без alt в слайдере — это одна правка шаблона.
export function grouped(findings: readonly FindingDraft[]): CheckFinding[] {
  const groups = new Map<string, CheckFinding>();
  for (const draft of findings) {
    const finding: Omit<CheckFinding, 'count'> = { ...draft, fix: draft.fix ?? fixOf(draft.place, draft.rule) };
    const key = [finding.place, finding.check, finding.rule, finding.section ?? '', finding.text, finding.fix].join(
      '\u0000',
    );
    const known = groups.get(key);
    if (known === undefined) groups.set(key, { ...finding, count: 1 });
    else known.count += 1;
  }
  return [...groups.values()];
}

// `fix` находки в секции платформы: по таблице, кроме мест, чьё решение от секции не зависит.
const fixOnPlatformSection = (finding: CheckFinding): CheckFix =>
  KEEP_FIX_ON_PLATFORM_SECTION.has(finding.place) ? finding.fix : FIX_ON_PLATFORM_SECTION[finding.fix];

// Находки секций платформы (`platform` — id их экземпляров, `platformSections` в `html/platform.ts`) — со своим `fix`.
export function onPlatformSections(findings: readonly CheckFinding[], platform: ReadonlySet<string>): CheckFinding[] {
  return findings.map((finding) =>
    finding.section !== null && platform.has(finding.section)
      ? { ...finding, fix: fixOnPlatformSection(finding) }
      : finding,
  );
}

// То же правило для находок старой формы (`LookFinding`): вёрстка в секции платформы — дело платформы. Находки без
// секции (детектор Impeccable) остаются как есть: правило не к чему применить.
export function lookOnPlatformSections<T extends { section: string | null; fix: CheckFix }>(
  findings: readonly T[],
  platform: ReadonlySet<string>,
): T[] {
  return findings.map((finding) =>
    finding.section !== null && platform.has(finding.section)
      ? { ...finding, fix: FIX_ON_PLATFORM_SECTION[finding.fix] }
      : finding,
  );
}

// Только находки нужных секций. `sections` не задан — все (снимок страницы целиком). Находки вне секций в снимок секций
// не идут: «на странице нет h1» приходит находкой той секции, где стоит первый заголовок.
export function inSections(findings: readonly CheckFinding[], sections?: readonly string[]): CheckFinding[] {
  if (sections === undefined) return [...findings];
  const wanted = new Set(sections);
  return findings.filter((finding) => finding.section !== null && wanted.has(finding.section));
}
