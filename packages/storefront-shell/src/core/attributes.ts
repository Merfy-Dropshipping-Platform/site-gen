import { ShellError } from '../errors';

// Что код секции пишет в атрибуты через El.attr и El.cssVar (design.md блока 5, раздел 3.3; 15 Г). Граница «только SDK»
// в браузере: проверка при сохранении (часть 5б) находит имя строкой в коде, здесь — имя и значение из переменной.
// Остальное — attr-forbidden: обработчики on…, style, class, id, служебные data-* платформы, адреса не по списку.
const FREE_NAMES: ReadonlySet<string> = new Set([
  'hidden',
  'disabled',
  'title',
  'alt',
  'open',
  'tabindex',
  'role',
  'placeholder',
  'min',
  'max',
  'step',
]);
// data-* шаблона и платформы: имена в разметке задаёт шаблон, служебные — платформа.
const PLATFORM_DATA: ReadonlySet<string> = new Set([
  'data-action',
  'data-ref',
  'data-behavior',
  'data-animate',
  'data-section',
  'data-section-id',
]);
const PLATFORM_PREFIX = 'data-merfy-';

// Адрес ссылки — от корня сайта (не //host и не /\host: браузер читает их как адрес другого сайта), якорь, https:,
// mailto:, tel:. Картинка — от корня сайта или https:. Пробелы по краям браузер отбрасывает — проверяем без них.
interface UrlRule {
  readonly url: RegExp;
  readonly tags: ReadonlySet<string> | null; // null — у любого элемента
}
const URL_RULES: Readonly<Record<string, UrlRule>> = {
  href: { url: /^(?:\/(?![/\\])|#|https:|mailto:|tel:)/i, tags: null },
  src: { url: /^(?:\/(?![/\\])|https:)/i, tags: new Set(['img', 'source']) },
};

// Значение CSS-переменной: без url(…), кавычек и «\». Кавычки дали бы адрес в image-set("…"), «\» — url через
// экранирование (u\72 l(…)): запрос на чужой адрес мимо шлюза (15 Г).
const CSS_VALUE_FORBIDDEN = /url\s*\(|["'\\]/i;
const CSS_VAR_NAME = /^[a-z][a-z0-9-]*$/;

const forbidden = (name: string, why: string): ShellError => new ShellError('attr-forbidden', `${name}: ${why}`);

const isFreeData = (name: string): boolean =>
  name.startsWith('data-') && !name.startsWith(PLATFORM_PREFIX) && !PLATFORM_DATA.has(name);
const isFree = (name: string): boolean => name.startsWith('aria-') || FREE_NAMES.has(name) || isFreeData(name);
const urlRuleOf = (name: string): UrlRule | undefined => (Object.hasOwn(URL_RULES, name) ? URL_RULES[name] : undefined);

function checkUrl(tag: string, name: string, rule: UrlRule, value: string | null): void {
  if (rule.tags !== null && !rule.tags.has(tag)) throw forbidden(name, `у <${tag}> этот атрибут писать нельзя`);
  if (value !== null && !rule.url.test(value.trim())) throw forbidden(name, `адрес «${value}» писать нельзя`);
}

// tag — имя тега в нижнем регистре (localName); value null — снять атрибут. Отдаёт имя, которое писать, — в нижнем
// регистре: HTML не различает регистр имён, ONCLICK — тот же onclick.
export function checkAttributeWrite(tag: string, name: string, value: string | null): string {
  const lower = name.toLowerCase();
  const rule = urlRuleOf(lower);
  if (rule !== undefined) checkUrl(tag, lower, rule, value);
  if (rule === undefined && !isFree(lower)) throw forbidden(lower, 'этот атрибут код секции не пишет');
  return lower;
}

// El.cssVar('progress', 40) → --progress: 40. Отдаёт имя свойства.
export function checkCssVar(name: string, value: string | number | null): string {
  if (!CSS_VAR_NAME.test(name))
    throw forbidden(`--${name}`, 'имя переменной — латиница в нижнем регистре, цифры и дефис');
  if (typeof value === 'string' && CSS_VALUE_FORBIDDEN.test(value))
    throw forbidden(`--${name}`, 'url(…), кавычки и «\\» в значении нельзя');
  return `--${name}`;
}
