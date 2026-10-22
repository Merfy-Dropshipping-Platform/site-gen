// Скрытое начальное состояние появлений (design.md блока 6, раздел 9; «Решил сам» 10). Встроенный скрипт в <head>
// ставит флаг на <html>; CSS платформы скрывает [data-animate] только при флаге, при включённых появлениях
// (data-motion-reveal="on", словарь) и без «уменьшить движение». Часть behaviors снимает флаг после первого прохода
// секций — к этому времени появления уже поставили скрытое состояние инлайном. Ядро не запустилось — через 3 с CSS
// показывает всё; без JS флага нет — содержимое видно. Встраивает сборка (часть 6б), CSP — по хешу скрипта (блок 13).
export const MOTION_FLAG = 'data-merfy-motion';
export const MOTION_HEAD_SCRIPT = "document.documentElement.setAttribute('data-merfy-motion','pending')";
export const MOTION_CSS =
  '@media (prefers-reduced-motion:no-preference){html[data-motion-reveal="on"][data-merfy-motion="pending"] ' +
  '[data-animate]{opacity:0;animation:merfy-motion-fallback 0s 3s forwards}}' +
  '@keyframes merfy-motion-fallback{to{opacity:1}}';
