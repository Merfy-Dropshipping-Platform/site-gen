/**
 * extension-orders.styles — вид записей расширений в «Моих заказах» и
 * страницы записи.
 *
 * ПОЧЕМУ СТРОКА В .ts. Как у формы покупки (`extension-purchase.styles.ts`):
 * правила пакета запрещают хексы в `.astro`, а палитра — из прототипа PM
 * (спека 120, `mockups/_prototype`), не токены темы. Тема вставляет строку
 * через `<style is:inline set:html={EXTENSION_ORDERS_STYLES} />`.
 *
 * ИЗОЛЯЦИЯ. Каждое правило под `.xo-row` (строка в чужом списке заказов) или
 * `.xo` (страница записи); цвета — переменные `--xo-*` в этих областях.
 * Шрифт не задаётся: `var(--font-body)` идёт от темы.
 *
 * РЕЖИМ «КАК ТЕМА» (спека 120, этап 5 на vanilla): атрибут
 * `data-look="theme"` на самой .xo/.xo-row или любом их предке (например, на
 * контейнере списка заказов) перекрашивает палитру прототипа в токены темы и
 * схемы секции — переопределяются те же переменные `--xo-*`. Без атрибута
 * значения по умолчанию дают прежний вид байт в байт (снимок
 * __tests__/extension-theme-look.test.ts). Цвета статусов (info, warning,
 * success, danger, neutral) — не темы: статусы остаются читаемыми.
 */
export const EXTENSION_ORDERS_STYLES = `
.xo, .xo-row {
  --xo-ink: #141414;
  --xo-back: #6A6A6A;
  --xo-muted: #8A8A8A;
  --xo-faint: #9A9A9A;
  --xo-line: #ECECEC;
  --xo-surface: #FFFFFF;
  --xo-info-bg: #E7F3FE;
  --xo-info: #2472B8;
  --xo-warning-bg: #FDF2E2;
  --xo-warning: #8F520A;
  --xo-success-bg: #E6F4EA;
  --xo-success: #2E7D46;
  --xo-danger-bg: #FDECEA;
  --xo-danger: #B3261E;
  --xo-neutral-bg: #F1F1F3;
  --xo-neutral: #6B6B70;
  --xo-weight: 300;
  --xo-radius-row: 12px;
  --xo-radius-button: 9px;
  --xo-btn-bg: #141414;
  --xo-btn-text: #FFFFFF;
  --xo-btn-bg-hover: #141414;
  --xo-btn-text-hover: #FFFFFF;
  box-sizing: border-box;
  font-family: var(--font-body, system-ui, sans-serif);
  font-weight: var(--xo-weight);
  color: var(--xo-ink);
}
.xo *, .xo-row * { box-sizing: border-box; }
.xo-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border: 1px solid var(--xo-line); border-radius: var(--xo-radius-row); background: var(--xo-surface); text-decoration: none; }
.xo-row-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.xo-row-title { font-size: 15px; line-height: 1.35; }
.xo-row-date { font-size: 12px; color: var(--xo-muted); }
.xo-badge { flex: none; padding: 3px 9px; border-radius: 11px; font-size: 12px; font-weight: 400; line-height: 16px; white-space: nowrap; background: var(--xo-neutral-bg); color: var(--xo-neutral); }
.xo-badge[data-tone="info"] { background: var(--xo-info-bg); color: var(--xo-info); }
.xo-badge[data-tone="warning"] { background: var(--xo-warning-bg); color: var(--xo-warning); }
.xo-badge[data-tone="success"] { background: var(--xo-success-bg); color: var(--xo-success); }
.xo-badge[data-tone="danger"] { background: var(--xo-danger-bg); color: var(--xo-danger); }
.xo { display: flex; flex-direction: column; gap: 12px; font-size: 13.5px; line-height: 1.45; }
.xo-back { align-self: flex-start; font-size: 13px; color: var(--xo-back); text-decoration: none; }
.xo-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.xo-number { margin: 0; font-size: 20px; font-weight: 300; line-height: 1.2; }
.xo-meta { font-size: 12px; color: var(--xo-faint); }
.xo-blocks { display: flex; flex-direction: column; gap: 12px; }
.xo-text { margin: 0; }
.xo-line { display: block; }
.xo-lines { display: flex; flex-direction: column; }
.xo-lines-row, .xo-lines-total, .xo-pair { display: flex; justify-content: space-between; gap: 12px; }
.xo-lines-row { padding: 8px 0; border-bottom: 1px solid var(--xo-line); }
.xo-lines-total { padding-top: 10px; font-size: 17px; }
.xo-lines-total .xo-value { font-weight: 400; }
.xo-value { flex: none; text-align: right; }
.xo-pairs { display: flex; flex-direction: column; gap: 4px; }
.xo-pair { justify-content: flex-start; }
.xo-pair .xo-label { flex: 0 0 50%; color: var(--xo-muted); }
.xo-pair .xo-value { text-align: left; }
.xo-button { display: flex; align-items: center; justify-content: center; height: 46px; border-radius: var(--xo-radius-button); background: var(--xo-btn-bg); color: var(--xo-btn-text); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; text-decoration: none; }
.xo-state { margin: 0; color: var(--xo-faint); }

/* Режим «как тема»: тот же набор переменных, значения — токены темы и схемы
   секции. Селекторы: атрибут на самих .xo/.xo-row или на любом предке. */
.xo[data-look="theme"], .xo-row[data-look="theme"], [data-look="theme"] .xo, [data-look="theme"] .xo-row {
  --xo-ink: rgb(var(--color-text));
  --xo-back: rgb(var(--color-muted));
  --xo-muted: rgb(var(--color-muted));
  --xo-faint: rgb(var(--color-muted));
  --xo-line: rgb(var(--color-text) / .2);
  --xo-surface: rgb(var(--color-bg));
  --xo-weight: var(--weight-body);
  --xo-radius-row: var(--radius-card);
  --xo-radius-button: var(--radius-button);
  --xo-btn-bg: var(--color-button-bg);
  --xo-btn-text: var(--color-button-text);
  --xo-btn-border: var(--color-button-border);
  --xo-btn-bg-hover: var(--color-button-bg-hover);
  --xo-btn-text-hover: var(--color-button-text-hover);
  font-family: var(--font-body);
}
/* Кнопка записи получает рамку кнопочного токена; наведение — hover-токены. */
:is(.xo[data-look="theme"], [data-look="theme"] .xo) .xo-button { border: 1px solid var(--xo-btn-border); }
:is(.xo[data-look="theme"], [data-look="theme"] .xo) .xo-button:hover { background: var(--xo-btn-bg-hover); color: var(--xo-btn-text-hover); }
`.trim();
