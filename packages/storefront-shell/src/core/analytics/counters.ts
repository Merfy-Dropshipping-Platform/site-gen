import type { Counter, CounterKind } from './settings.ts';

// Счётчики мерчанта (design.md блока 11, С11-4 Б): Метрика, VK и Google по номеру, код — наш шаблон, тот же, что
// отдаёт сборщик аналитики нынешним темам (internal/handler/pixels.go, generateInjectHTML). Грузятся только при
// согласии (С11-2 В) и после загрузки страницы (решил сам 13). Номер вписывается в код, поэтому перед вставкой он ещё
// раз сверяется с правилом вида — тем же, что у схемы конфига (тест сверяет с @merfy/storefront-config).
export const COUNTER_NUMBERS: Readonly<Record<CounterKind, RegExp>> = {
  metrika: /^[1-9][0-9]{0,11}$/,
  vk: /^VK-RTRG-[0-9]{1,12}-[A-Za-z0-9]{1,32}$/,
  google: /^G-[A-Z0-9]{4,20}$/,
};

export interface CounterScript {
  // null — встроенный код.
  src: string | null;
  code: string;
}

const TEMPLATES: Readonly<Record<CounterKind, (number: string) => CounterScript[]>> = {
  metrika: (number) => [
    {
      src: null,
      code: `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${number},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`,
    },
  ],
  vk: (number) => [
    {
      src: null,
      code: `!function(){var t=document.createElement("script");t.type="text/javascript",t.async=!0,t.src="https://vk.com/js/api/openapi.js?169",t.onload=function(){VK.Retargeting.Init("${number}"),VK.Retargeting.Hit()},document.head.appendChild(t)}();`,
    },
  ],
  google: (number) => [
    { src: `https://www.googletagmanager.com/gtag/js?id=${number}`, code: '' },
    {
      src: null,
      code: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${number}');`,
    },
  ],
};

const fits = (counter: Counter): boolean => COUNTER_NUMBERS[counter.kind].test(counter.number);
// Скрипты счётчика по шаблону вида; номер не по правилу — ни одного. Сборка магазина считает по ним хеши встроенного кода для CSP (блок 13 «Секций и SDK», часть 13б).
export const counterScripts = (counter: Counter): CounterScript[] =>
  fits(counter) ? TEMPLATES[counter.kind](counter.number) : [];

function addScript(doc: Document, script: CounterScript): void {
  const element = doc.createElement('script');
  element.async = true;
  if (script.src !== null) element.src = script.src;
  element.textContent = script.code;
  doc.head.append(element);
}

export function loadCounters(doc: Document, counters: readonly Counter[]): void {
  counters
    .filter((counter) => !fits(counter))
    .forEach((counter) => console.error(`Аналитика: счётчик ${counter.kind} — номер не по правилу`));
  counters.flatMap(counterScripts).forEach((script) => addScript(doc, script));
}
