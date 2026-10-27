// Утечки значений в HTML пробного рендера (блок 2 «Секций и SDK», дополнение «Утечки в HTML»): объект, выведенный как
// текст («[object Object] ₽» вместо price.text), и слова undefined и NaN. Шаблон при этом не падает, и без этой сверки
// ошибка доходила до витрины. Смотрятся видимый текст и значения атрибутов, которые читает человек или поисковик; код
// <script>, <style> и комментарии пропускаются.

const OBJECT_TEXT = /\[object \w+\]/;
// undefined и NaN — отдельным словом: «undefined-page» в адресе или слово внутри другого слова не считаются.
const WORD = /(?<![\p{L}\p{N}_-])(?:undefined|NaN)(?![\p{L}\p{N}_-])/u;

const SKIPPED = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi;
const ATTRIBUTE_PART = String.raw`\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>\x60]+))?`;
const TAG = new RegExp(String.raw`<(\/?)([a-zA-Z][\w:-]*)((?:${ATTRIBUTE_PART})*)\s*\/?>`, 'g');
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// Атрибуты, значение которых человек видит или отдаёт поиску: подпись, подсказка, значение поля, адрес, содержимое meta.
const SEEN_ATTRIBUTES: ReadonlySet<string> = new Set([
  'alt',
  'title',
  'aria-label',
  'placeholder',
  'value',
  'href',
  'src',
  'content',
]);

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|(\w+));/g,
    (whole, dec?: string, hex?: string, name?: string) => {
      if (name !== undefined) return NAMED[name] ?? whole;
      const code = dec === undefined ? Number.parseInt(hex ?? '', 16) : Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

export interface Leak {
  // Где найдено: «в тексте» или «в атрибуте alt».
  place: string;
  // Что найдено: «[object Object]», «undefined», «NaN».
  found: string;
  // Окружение найденного, одной строкой: «[object Object] ₽».
  near: string;
}

const NEAR = 16;

function leaksOf(value: string, place: string, onlyObjects: boolean): Leak[] {
  const patterns = onlyObjects ? [OBJECT_TEXT] : [OBJECT_TEXT, WORD];
  return patterns.flatMap((pattern): Leak[] => {
    const match = pattern.exec(value);
    if (match === null) return [];
    const from = Math.max(0, match.index - NEAR);
    const near = value
      .slice(from, match.index + match[0].length + NEAR)
      .replace(/\s+/g, ' ')
      .trim();
    return [{ place, found: match[0], near }];
  });
}

// Утечки в HTML: каждая находка вида (объект, undefined, NaN) в каждом месте (текст, атрибут) — один раз.
// onlyObjects — только объекты: страница, которой секция не принадлежит, не даёт ей полей записи, и undefined на ней —
// не ошибка секции, а объект в тексте — ошибка на любой странице.
export function renderLeaks(html: string, onlyObjects = false): Leak[] {
  const source = html.replace(SKIPPED, ' ');
  const openingTags = [...source.matchAll(TAG)].filter((tag) => tag[1] !== '/');
  const attributes = openingTags.flatMap((tag) => [...(tag[3] ?? '').matchAll(ATTRIBUTE)]);
  const found: Leak[] = attributes.flatMap((attribute) => {
    const name = (attribute[1] ?? '').toLowerCase();
    if (!SEEN_ATTRIBUTES.has(name)) return [];
    const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    return leaksOf(decode(value), `в атрибуте ${name}`, onlyObjects);
  });
  found.push(...leaksOf(decode(source.replace(TAG, ' ')), 'в тексте', onlyObjects));
  const seen = new Set<string>();
  return found.filter((leak) => {
    const key = `${leak.place}|${leak.found}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Деньги записей магазина — объект { amount, currency, text }; рядом со знаком валюты утечка объекта почти всегда цена.
const CURRENCY = /[₽$€£]|руб/i;

// Подсказка автору: что значит находка и как исправить.
export function leakHint(leak: Leak): string {
  if (leak.found.startsWith('[object') && CURRENCY.test(leak.near))
    return 'цена записи — объект Money { amount, currency, text }: выводите price.text (и compareAtPrice.text), а не price';
  if (leak.found.startsWith('[object'))
    return 'выведен объект, а не текст: возьмите его поле (например, .text у цены, .title у записи) или проверьте тип значения';
  return 'в разметку попало пустое или нечисловое значение: проверьте поле на null и undefined до вывода и до вычислений над ним';
}
