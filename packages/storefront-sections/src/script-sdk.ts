// Список разрешённого «только SDK» (design.md блока 5, раздел 3.9; 15 Г) — что коду секции можно из окружения JS. Любое
// другое свободное имя — sdk-only с подсказкой. Список меняется только вместе с тестом обхода (риск 1 design.md).

// Список имён строкой через пробел: так таблица читается, а не растягивается на сотню строк.
const words = (text: string): ReadonlySet<string> => new Set(text.split(/\s+/).filter((word) => word !== ''));

// Члены свободного имени, которые можно читать и вызывать: Math.round(…), JSON.parse(…), Date.now().
export const MEMBER_GLOBALS: Readonly<Record<string, ReadonlySet<string>>> = {
  Math: words(`
    abs acos acosh asin asinh atan atan2 atanh cbrt ceil clz32 cos cosh exp expm1 floor fround hypot imul log log10
    log1p log2 max min pow random round sign sin sinh sqrt tan tanh trunc E LN10 LN2 LOG10E LOG2E PI SQRT1_2 SQRT2
  `),
  JSON: words('parse stringify'),
  Number: words('isFinite isInteger isNaN parseFloat parseInt MAX_SAFE_INTEGER MIN_SAFE_INTEGER EPSILON'),
  Array: words('isArray from of'),
  Object: words('keys values entries fromEntries'),
  Date: words('now UTC parse'),
  Promise: words('all allSettled race resolve reject'),
};

// Свободные имена, которые можно только вызвать: Number(x), String(x), parseInt(x).
export const CALL_GLOBALS = words(
  'Number String Boolean parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent',
);

// Свободные имена после new: new Date(…), new Map().
export const NEW_GLOBALS = words('Date Map Set WeakMap WeakSet Promise Error TypeError RangeError');

// new Intl.NumberFormat(…) и другие форматтеры Intl.
export const NEW_INTL = words('NumberFormat DateTimeFormat PluralRules RelativeTimeFormat ListFormat Collator');

// Свободные имена-значения: читать можно, присваивать нельзя.
export const VALUE_GLOBALS = words('undefined NaN Infinity');

// Поля, через которые JS доходит до конструктора и прототипа (как у ADsafe, раздел 7 design.md): через точку, ключом-
// строкой и в деструктуризации — sdk-only; запись a[k] с таким ключом — исключение в браузере (script-rewrite.ts).
export const FORBIDDEN_FIELDS = words(`
  constructor prototype __proto__ caller callee arguments __defineGetter__ __defineSetter__ __lookupGetter__
  __lookupSetter__
`);

// Подсказки к самым частым именам вне SDK (таблица раздела 3.9).
const HINT_GROUPS: readonly (readonly [readonly string[], string])[] = [
  [
    ['document', 'window', 'globalThis', 'self', 'parent', 'top'],
    "элементы своей секции — ctx.ref и ctx.refs; клавиши и прокрутка страницы — ctx.on('document' или 'window', …)",
  ],
  [['setTimeout', 'setInterval', 'requestAnimationFrame'], 'таймеры — ctx.after и ctx.every; анимации — ctx.animate'],
  [['fetch', 'XMLHttpRequest', 'navigator', 'WebSocket'], 'данные — ctx.data и модули SDK по uses'],
  [['localStorage', 'sessionStorage', 'indexedDB', 'cookie'], 'хранилище секции — ctx.storage'],
  [['console'], 'отладка — ctx.log, пишет в консоль превью'],
  [['eval', 'Function'], 'исполнять строку и подгружать код нельзя'],
  [['Reflect', 'Proxy'], 'меняет объекты страницы — нельзя; копия объекта — { ...a, ...b }'],
  [['arguments'], 'параметры — по именам: function show(ctx, coat)'],
];

const NAME_HINTS: ReadonlyMap<string, string> = new Map(
  HINT_GROUPS.flatMap(([names, hint]) => names.map((name): [string, string] => [name, hint])),
);

const OBJECT_CHANGES = words('assign defineProperty getPrototypeOf setPrototypeOf create');
const SDK_ONLY_TAIL = 'в коде секции — только ctx, свои переменные и простые операции JS';

function memberText(object: string, member: string): string {
  if (object === 'Object' && OBJECT_CHANGES.has(member))
    return `${object}.${member} — не из SDK: меняет объекты страницы — нельзя; копия объекта — { ...a, ...b }`;
  return `${object}.${member} — не из SDK: у ${object} можно только ${[...(MEMBER_GLOBALS[object] ?? [])].join(', ')}`;
}

// Тексты отказа sdk-only и script-invalid — одни для приёма, merfy section check и MCP (вид строки — problemText).
export const SDK_TEXT = {
  name: (name: string): string => `${name} — не из SDK: ${NAME_HINTS.get(name) ?? SDK_ONLY_TAIL}`,
  member: memberText,
  value: (name: string): string => `${name} — только вызовом или чтением члена из списка: ${name}.…(…)`,
  assign: (name: string): string => `${name} — менять нельзя`,
  newCall: 'new — только у Date, Map, Set, WeakMap, WeakSet, Promise, Error, TypeError, RangeError и Intl.…Format',
  this: 'this в коде секции нет: экземпляр — ctx, элементы — ctx.ref',
  super: 'super в коде секции нет: поле объекта — по имени',
  class: 'class в коде секции нет: состояние — ctx.state, помощники — функции',
  delete: 'delete нельзя: поле убирает копия объекта без него',
  dynamicImport: 'import() — исполнять строку и подгружать код нельзя',
  meta: 'import.meta и new.target в коде секции нет',
  field: (name: string): string => `поле ${name} — служебное поле JS, коду секции оно недоступно`,
  service: (name: string): string => `имя ${name}: префикс __merfy — служебный`,
  computedUpdate: 'a[k] += … и a[k]++ нельзя: пиши a[k] = a[k] + 1',
  computedPattern: 'вычисляемый ключ в деструктуризации и слева от for…of нельзя: возьми значение a[k] отдельно',
  optionalComputed: 'a?.[k] нельзя: сначала проверь a, потом a[k]',
  topLevel: 'вне defineSection — только объявления: import, const, function, type',
  importShell: 'из @merfy/shell — только defineSection и типы; модули — uses и ctx',
  importStar: 'свои файлы — импорт по именам: import { show } from "./show"',
  declare: 'declare, enum и namespace в коде секции нет',
  defineOnly: 'defineSection — только в export default defineSection({ … })',
  defineForm: 'нужен export default defineSection({ … }) — объект определения прямо в вызове',
  defineName: 'имя секции пишется в section.json: export default defineSection({ … })',
} as const;
