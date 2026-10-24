import { CONSENT_RULES, type ConsentState } from './consent.ts';

// «Свой код» мерчанта (блок 13 «Секций и SDK», 13.4; В13-1 В): текст из кабинета — счётчик вида «Свой код»; сборка
// записывает его в конфиг страницы (analytics.custom). Как loader.js пяти тем, ядро выбирает из текста только <script> и
// пересоздаёт их в конце <head>: адрес, текст, async; остальная разметка (<noscript>, <img>, <div>) не вставляется.
// Текст разбирается в <template>: там ничего не грузится и не выполняется (у div.innerHTML из loader.js <img onerror>
// срабатывает). consent — когда запускать: required — по столбцу custom таблицы согласия (consent.ts), none — сразу.
// Каждый код — один раз на загрузку страницы.
export interface CustomCode {
  readonly code: string;
  readonly consent: 'required' | 'none';
}

export interface CustomCodeRunner {
  // Ответ на баннер прочитан или сменился: запустить коды, которым теперь можно и которые ещё не запускались.
  apply(answer: ConsentState): void;
}

const allowed = (code: CustomCode, answer: ConsentState): boolean =>
  code.consent === 'none' || CONSENT_RULES[answer].custom;

function scriptsOf(doc: Document, code: string): HTMLScriptElement[] {
  const template = doc.createElement('template');
  template.innerHTML = code;
  return [...template.content.querySelectorAll('script')];
}

// Скрипт из <template> не выполняется — нужен новый элемент. Адрес — как написан: его разрешает страница.
function recreated(doc: Document, source: HTMLScriptElement): HTMLScriptElement {
  const script = doc.createElement('script');
  const src = source.getAttribute('src');
  if (src !== null) script.src = src;
  script.text = source.text;
  script.async = true;
  return script;
}

export function customCodeRunner(doc: Document, codes: readonly CustomCode[]): CustomCodeRunner {
  const done = new Set<number>();
  return {
    apply(answer) {
      codes.forEach((code, index) => {
        if (done.has(index) || !allowed(code, answer)) return;
        done.add(index);
        scriptsOf(doc, code.code).forEach((script) => doc.head.append(recreated(doc, script)));
      });
    },
  };
}
