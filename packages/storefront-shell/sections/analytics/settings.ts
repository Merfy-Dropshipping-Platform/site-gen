// Настройки модуля из конфига страницы (#merfy-config, блок 3; поле analytics — задача 1 плана блока 11). Модуль читает
// конфиг сам: секция берёт только @merfy/shell и свои файлы (блок 7, п. 20), а ядро поле analytics не проверяет. Полную
// схему проверила сборка; здесь — только то, без чего модулю нечего делать. Нет магазина, адреса сборщика или поля
// analytics (превью и стенд пишут null) — настроек нет, модуль ничего не отправляет. Битый конфиг — тоже: о нём пишет
// в консоль ядро (reportConfig, блок 7).
export const CONFIG_ID = 'merfy-config';
// Виды счётчиков мерчанта — те же, что в схеме конфига (@merfy/storefront-config; тест сверяет).
export const COUNTER_KINDS = ['metrika', 'vk', 'google'] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];

export interface Counter {
  kind: CounterKind;
  number: string;
}

export interface AnalyticsSettings {
  shopId: string;
  // mode: live — магазин покупателей; превью конструктора ничего не отправляет (решил сам 8).
  live: boolean;
  // Путь страницы из конфига — page_url событий (решил сам 6).
  path: string;
  // Адрес сборщика без косой черты в конце: события уходят на <url>/collect.
  url: string;
  counters: Counter[];
}

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
const isKind = (value: unknown): value is CounterKind => COUNTER_KINDS.some((kind) => kind === value);

// Значение по пути вида «shop.id»; пути нет — undefined.
const valueAt = (root: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (isObject(value) ? Reflect.get(value, key) : undefined), root);

function textAt(root: unknown, path: string): string {
  const value = valueAt(root, path);
  return typeof value === 'string' ? value : '';
}

function counterOf(value: unknown): Counter[] {
  const kind = valueAt(value, 'kind');
  const number = textAt(value, 'number');
  return isKind(kind) && number !== '' ? [{ kind, number }] : [];
}

function configOf(doc: Pick<Document, 'getElementById'>): unknown {
  try {
    const value: unknown = JSON.parse(doc.getElementById(CONFIG_ID)?.textContent ?? '');
    return value;
  } catch {
    return null;
  }
}

export function readSettings(doc: Pick<Document, 'getElementById'>): AnalyticsSettings | null {
  const config = configOf(doc);
  const counters = valueAt(config, 'analytics.counters');
  const settings: AnalyticsSettings = {
    shopId: textAt(config, 'shop.id'),
    live: valueAt(config, 'mode') === 'live',
    path: textAt(config, 'page.path'),
    url: textAt(config, 'analytics.url'),
    counters: Array.isArray(counters) ? counters.flatMap(counterOf) : [],
  };
  return settings.shopId === '' || settings.url === '' ? null : settings;
}
