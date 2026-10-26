// Исполняемые встроенные скрипты HTML (блок 15, часть 15е, Р15е-4): текст каждого <script> без src; тип — нет атрибута,
// пустой, text/javascript, application/javascript, module или importmap; текст как есть (хеш CSP — от него). Блоки
// данных JSON не исполняются, пустой скрипт браузер не запускает. Разбирается только HTML страниц оформления (build.ts).

// Тег script (без учёта регистра) с атрибутами и телом до закрывающего тега; атрибут type — кавычки или без.
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const TYPE_ATTR = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

// Тип исполняемого JavaScript: нет атрибута type, пустой или один из известных MIME/значений.
const JS_TYPES: ReadonlySet<string> = new Set([
  '',
  'text/javascript',
  'application/javascript',
  'module',
  'importmap',
]);

const isJsType = (attrs: string): boolean => {
  const match = TYPE_ATTR.exec(attrs);
  const type = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').toLowerCase();
  return JS_TYPES.has(type);
};

export function inlineScripts(html: string): string[] {
  SCRIPT_TAG.lastIndex = 0;
  const texts: string[] = [];
  for (const match of html.matchAll(SCRIPT_TAG)) {
    const attrs = match[1] ?? '';
    const text = match[2] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (!isJsType(attrs)) continue;
    if (text === '') continue;
    texts.push(text);
  }
  return texts;
}
