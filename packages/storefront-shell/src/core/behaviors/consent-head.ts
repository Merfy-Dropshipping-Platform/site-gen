import { CONSENT_KEY } from '../analytics/consent';
import { ROLE_ATTRIBUTE, type SectionRole } from '../roles';

// Баннер cookie с первого кадра (19.11, Web Vitals): секция баннера скрыта в HTML и до сих пор её показывал скрипт
// секции — текст баннера становился главным элементом первого экрана (LCP) и ждал бандл. Теперь встроенный скрипт в
// <head> до первой отрисовки смотрит ответ покупателя (тот же ключ, что у части consent ядра) и, если ответа нет,
// ставит на <html> класс; CSS платформы по классу показывает корень секции с ролью баннера. Класс снимается по
// merfy:page:ready: к этому времени скрипт секции сам показал баннер тому, кто не ответил, и спрятал ответившему.
// Покупателю с ответом класса нет — баннер скрыт, как раньше, и не мигает. Хранилище недоступно (приватный режим) —
// ответа нет, баннер виден: он должен показываться каждому, кто не согласился. Без JS класса нет — баннера нет, как раньше.
// Встраивает сборка (storefront-build/src/code.ts) на страницах с секцией этой роли; CSP — по хешу скрипта (csp.ts).
export const CONSENT_ROLE: SectionRole = 'cookie-banner';
export const CONSENT_CLASS = 'mfy-consent-new';

const READY = 'merfy:page:ready';
export const CONSENT_HEAD_SCRIPT =
  `(()=>{const d=document.documentElement;try{if(localStorage.getItem(${JSON.stringify(CONSENT_KEY)}))return}catch(e){}` +
  `d.classList.add(${JSON.stringify(CONSENT_CLASS)});` +
  `document.addEventListener(${JSON.stringify(READY)},()=>d.classList.remove(${JSON.stringify(CONSENT_CLASS)}),{once:true})})()`;

// Корень секции — прямой потомок обёртки (в обёртке лежит разметка секции как есть). Правило [hidden] базы страницы
// (preflight, @merfy/tokens) — display:none!important в слое base, а у !important слои идут в обратном порядке: раньше
// объявленный слой сильнее позднего, любой слой — сильнее правила без слоя. Поэтому наше правило — тоже !important и
// в слое theme (первом в порядке слоёв страницы: theme, base, components, utilities); без слоя оно бы проиграло.
export const CONSENT_CSS = `@layer theme{html.${CONSENT_CLASS} [${ROLE_ATTRIBUTE}="${CONSENT_ROLE}"]>[hidden]{display:block!important}}`;
