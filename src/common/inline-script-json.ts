/**
 * Значение для присваивания внутри `<script>…</script>` в HTML — ОДНА функция
 * для сборки витрины (`injectGlobalsIntoDist`, build.service) и превью
 * конструктора (`withPolicyUrlsGlobal` / `withPrivacyPolicyGlobal`,
 * preview.controller).
 *
 * Голый `JSON.stringify` для HTML небезопасен: строка `</script>` внутри
 * значения закрывает тег раньше времени, и хвост значения становится
 * разметкой страницы. Поэтому `<` → `<` (JS-строка та же, HTML-парсер
 * закрывающего тега не видит). U+2028/U+2029 — на случай старых движков, где
 * они рвут строковый литерал.
 */
export function inlineScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
