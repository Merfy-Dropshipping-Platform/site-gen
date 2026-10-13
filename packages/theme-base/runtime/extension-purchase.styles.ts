/**
 * extension-purchase.styles — стили формы расширения на странице товара.
 *
 * ПОЧЕМУ СТРОКА В .ts, А НЕ `<style>` В .astro. Правила пакета запрещают хексы
 * и сырые rgb() в `.astro` и `.classes.ts` (CLAUDE.md пакета). Дизайн формы —
 * палитра прототипа PM (спека 120, `mockups/_prototype`), а не токены темы, поэтому
 * значения переносятся как есть и живут здесь, в файле-исключении — по образцу
 * файла `*.sf-styles.ts` старой формы товара (папка blocks). Блок вставляет строку через
 * `<style is:inline set:html={EXTENSION_PURCHASE_STYLES} />`.
 *
 * ИЗОЛЯЦИЯ. Каждое правило спрятано под `.xp` (контейнер формы) либо под слот
 * примечания у цены: глобальный inline-стиль не протекает в чужие секции.
 * Цвета — локальные переменные `--xp-*` в области `.xp`, не `:root`. Шрифт
 * не хардкодится: `var(--font-body)` идёт от темы.
 */
export const EXTENSION_PURCHASE_STYLES = `
.xp {
  --xp-ink: #141414;
  --xp-label: #222222;
  --xp-mark: #A0A0A0;
  --xp-muted: #9A9A9A;
  --xp-frame: #ECECEC;
  --xp-line: #E2E2E2;
  --xp-surface: #FFFFFF;
  --xp-err: #D9473B;
  --xp-bad: #E5483C;
  --xp-upload-line: #CFCFCF;
  --xp-icon-bg: #F2F2F2;
  --xp-ok-bg: #F2F8F3;
  --xp-file-bg: #F6F6F6;
  --xp-thumb-close: rgba(0, 0, 0, .6);
  --xp-thumb-note: rgba(255, 255, 255, .85);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--xp-frame);
  border-radius: 14px;
  font-family: var(--font-body, system-ui, sans-serif);
  font-size: 13.5px;
  font-weight: 300;
  line-height: 1.45;
  color: var(--xp-ink);
  /* Экран ответа прокручивается к началу формы: отступ — под липкую шапку темы (у flux 80 px). */
  scroll-margin-top: 96px;
}
.xp[hidden] { display: none; }
.xp *, .xp *::before, .xp *::after { box-sizing: border-box; }
.xp.done { gap: 10px; padding: 0; border: 0; }
.xp button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.xp .sf-h b { font-size: 15px; font-weight: 500; }
.xp .sf-f { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.xp .sf-l { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--xp-label); }
.xp .sf-l small { color: var(--xp-mark); font-size: 11px; white-space: nowrap; }
.xp .sf-in { width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--xp-line); border-radius: 9px; background: var(--xp-surface); font: inherit; font-size: 14px; line-height: 1.3; color: var(--xp-ink); outline: none; }
.xp .sf-in:focus { border-color: var(--xp-ink); }
.xp textarea.sf-in { min-height: 64px; resize: vertical; }
.xp .sf-in.bad, .xp .sf-up.bad { border-color: var(--xp-bad); }
.xp .err { font-size: 11.5px; color: var(--xp-err); }
.xp .sf-num { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.xp .sf-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.xp .sf-seg button { padding: 8px 12px; border: 1px solid var(--xp-line); border-radius: 9px; font-size: 13px; }
.xp .sf-seg button.on { border-color: var(--xp-ink); box-shadow: inset 0 0 0 1px var(--xp-ink); }
.xp .sf-up { position: relative; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px dashed var(--xp-upload-line); border-radius: 9px; background: var(--xp-surface); cursor: pointer; }
.xp .sf-up input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.xp .sf-up .ic { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 8px; background: var(--xp-icon-bg); font-size: 15px; }
.xp .sf-up b { display: block; font-size: 13px; font-weight: 400; }
.xp .sf-up small { font-size: 11px; color: var(--xp-muted); }
.xp .sf-th { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
.xp .sf-thumb { position: relative; display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; border-radius: 8px; background: var(--xp-icon-bg); font-size: 10px; color: var(--xp-muted); }
.xp .sf-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.xp .sf-thumb.loading img { opacity: .5; }
.xp .sf-thumb.failed { box-shadow: inset 0 0 0 1px var(--xp-bad); }
.xp .sf-thumb small { position: absolute; left: 3px; right: 3px; bottom: 3px; border-radius: 4px; background: var(--xp-thumb-note); font-size: 9px; line-height: 1.3; text-align: center; color: var(--xp-ink); }
.xp .sf-thumb button { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--xp-thumb-close); color: var(--xp-surface); font-size: 11px; line-height: 18px; }
.xp .sf-fl { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 9px; background: var(--xp-file-bg); font-size: 12.5px; }
.xp .sf-fl span { min-width: 0; overflow-wrap: anywhere; }
.xp .sf-fl.failed { color: var(--xp-err); }
.xp .sf-fl button { flex: none; color: var(--xp-muted); }
.xp .sf-cb { display: flex; align-items: flex-start; gap: 9px; font-size: 12.5px; cursor: pointer; }
.xp .sf-cb input { flex: none; width: 17px; height: 17px; margin: 1px 0 0; accent-color: var(--xp-ink); }
.xp .sf-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: 46px; border-radius: 9px; background: var(--xp-ink); color: var(--xp-surface); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; text-decoration: none; cursor: pointer; }
.xp .sf-btn.light { background: var(--xp-surface); color: var(--xp-ink); border: 1px solid var(--xp-ink); }
.xp .sf-btn:disabled { opacity: .6; cursor: default; }
.xp .sf-note { font-size: 11.5px; color: var(--xp-muted); }
.xp .okbox { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 14px; background: var(--xp-ok-bg); }
.xp .okbox b { font-size: 17px; font-weight: 500; }
[data-extension-purchase-note] { margin-left: 6px; font-size: 12px; color: #8A8A8A; }
`.trim();
