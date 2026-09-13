/**
 * Split-чекаут: ОДИН источник разметки и стилей для пяти тем и для превью.
 *
 * Эталон владельца (третий круг тестировщика, п.4 «очень плохо работают
 * цветовые схемы»): цветовая схема применяется к КОЛОНКЕ целиком как к
 * поверхности, а не к блокам внутри неё. Правая колонка — сплошной цвет от
 * верха до низа окна и до правого края экрана, без полей и зазоров; текст и
 * цифры на ней берут цвет из той же схемы. Левая колонка — так же, если
 * мерчант задал схему форме.
 *
 * Замер «до» (прод, превью, 1280px, 2026-09-13):
 *   rose/bloom — колонка красилась, но цветом ЖЁСТКО зашитой `color-scheme-2`
 *                (у bloom — вообще литералами в разметке страницы);
 *   vanilla/satin/flux — поверхности не было: центрированная сетка
 *                `max-w-[1280px]`, колонка обрывалась на 1079px из 1280 —
 *                справа оставалась полоса фона страницы.
 *
 * Раньше эта разметка жила ШЕСТЬЮ копиями (пять `themes/<t>/src/pages/
 * checkout.astro` + `preview.service.ts:wrapCheckoutGrid`), и в каждой копии
 * стоял комментарий «правки дублировать там же». Дублировали не всегда —
 * отсюда три темы без поверхности. Теперь копия одна.
 *
 * Контракт разметки:
 *   [data-checkout-pane="form"|"summary"]  — КОЛОНКА-поверхность. На неё
 *       сборка вешает `color-scheme-N` секции (chrome-assembler:
 *       patchCheckoutColumnScheme), отсюда она и красится.
 *   [data-checkout-column="form"|"summary"] — внутренний контент колонки.
 *       Имя сохранено: по нему липнет сводка (баг 17) и его же ищет
 *       `closest()` в инлайн-скрипте высоты (баг 18-Б).
 */

/** Ширины и отступы — Figma 1:19998 (rose 1920: form 446, summary 556). */
export const CHECKOUT_SPLIT_CSS = `
.mfy-checkout-split { display: flex; flex-direction: column; width: 100%; min-height: 100dvh; background: rgb(var(--color-bg, 255 255 255)); }
.mfy-checkout-pane { width: 100%; box-sizing: border-box; color: rgb(var(--color-text, 0 0 0)); }
.mfy-checkout-pane__inner { width: 100%; max-width: 540px; margin: 0 auto; padding: 32px 16px; box-sizing: border-box; }
[data-checkout-pane="form"] { background: rgb(var(--color-bg, 255 255 255)); }
[data-checkout-pane="summary"] { background: rgb(var(--color-surface, 245 245 245)); }
@media (min-width: 1024px) {
  .mfy-checkout-split { flex-direction: row; align-items: stretch; }
  .mfy-checkout-pane { width: 50%; display: flex; }
  [data-checkout-pane="form"] { justify-content: flex-end; }
  [data-checkout-pane="summary"] { justify-content: flex-start; }
  [data-checkout-pane="form"] .mfy-checkout-pane__inner { margin: 0 0 0 auto; max-width: 446px; padding: 64px 28px 64px 24px; }
  [data-checkout-pane="summary"] .mfy-checkout-pane__inner { margin: 0 auto 0 0; max-width: 556px; padding: 64px 40px 64px 48px; }
  /* Баг-репорт 17: сводка едет вместе с формой. Стояла в самом верху растянутой
     колонки — первый оборот колеса уводил её за кромку, и правая половина экрана
     превращалась в пустое неподвижное полотно. \`align-self\` обязателен:
     растянутой на всю высоту колонке прилипать негде.
     Баг-репорт 18-Б: прежняя страховка (\`max-height\` + свой скролл) колонку
     РЕЗАЛА — на 30 позициях прокрутка страницы не доставала до последних (видно
     9 из 30). Колонку не режем: сводка ниже экрана липнет низом (отрицательный
     \`--checkout-summary-top\`, считает блок «Сводка заказа») и едет со страницей
     до последней позиции. */
  [data-checkout-column="summary"] { position: sticky; top: var(--checkout-summary-top, 24px); align-self: start; }
}
`.trim();

/**
 * Та же разметка строкой — для превью конструктора, где блоки уже отрендерены
 * в HTML (`preview.service.wrapCheckoutGrid`). Классы схемы сюда не вшиваются:
 * их вешает общая доводка чекаута, одна и для витрины, и для превью.
 */
export function checkoutSplitMarkup(formHtml: string, summaryHtml: string): string {
  return (
    `<style>${CHECKOUT_SPLIT_CSS}</style>` +
    '<div class="mfy-checkout-split">' +
    '<div class="mfy-checkout-pane mfy-checkout-pane--form" data-checkout-pane="form">' +
    '<div class="mfy-checkout-pane__inner" data-checkout-column="form" style="min-width:0">' +
    formHtml +
    '</div></div>' +
    '<div class="mfy-checkout-pane mfy-checkout-pane--summary" data-checkout-pane="summary">' +
    '<div class="mfy-checkout-pane__inner" data-checkout-column="summary" style="min-width:0">' +
    summaryHtml +
    '</div></div>' +
    '</div>'
  );
}
