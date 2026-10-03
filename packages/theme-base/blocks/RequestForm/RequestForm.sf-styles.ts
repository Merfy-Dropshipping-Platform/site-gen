/**
 * RequestForm.sf-styles — порт стилей `sf-*` формы заявки с «сайта магазина»
 * мокапа (scratchpad/zayavki-screens/module-extract.css, секция «форма на
 * сайте магазина: и в превью, и на странице товара»).
 *
 * ПОЧЕМУ СТРОКА В .ts, А НЕ `<style>` В .astro. Валидатор блока
 * (theme-contract/validateBlock) и правила пакета запрещают хексы и сырые
 * rgb() в `.astro`/`.classes.ts`. Дизайн формы — это собственная палитра
 * мокапа («бумажный» магазин: --st-ink/#1C1B19 и т.д.), а не тема, поэтому
 * она НЕ переводится на var(--color-*): значения переносятся как есть, но
 * живут здесь — в единственном файле-исключении, см. комментарий в
 * CLAUDE.md про исключения. Блок инжектирует строку через
 * `<style is:inline set:html={RequestFormSfStyles} />` (глобально, без
 * Astro-scoping) — чтобы стили применялись и к разметке, которую в T013b
 * будет дорисовывать рантайм (renderFormHTML) в контейнер [data-request-form].
 *
 * ИЗОЛЯЦИЯ. Каждое правило спрятано под `.rq-sf`: глобальный inline-стиль
 * не может протекать в чужие секции. Все значения мокапа объявлены
 * переменными --st-* в области .rq-sf (локально, не :root) — T013b сможет
 * подстроить их от темы, не трогая правила. Шрифт мокапа (Arsenal) не
 * хардкодится: --st-font идёт от темы через var(--font-body).
 */
export const RequestFormSfStyles = `
.rq-sf {
  /* палитра «сайта магазина» из мокапа (module-extract.css :root --st-*) */
  --st-ink: #1C1B19;
  --st-ink2: #6B6862;
  --st-line: #E7E4DE;
  --st-err: #B4442F;
  /* остальное из значений sf-правил мокапа (#fff, #CFC9BE, …) */
  --st-surface: #FFFFFF;
  --st-up-border: #CFC9BE;
  --st-icon-bg: #F1EEE8;
  --st-thumb-bg: #EEEEEE;
  --st-thumb-x: rgba(0, 0, 0, 0.55);
  --st-ghost: #CFCAC2;
  --st-focus: #71C0FF;
  --st-vid-a: #2B2F36;
  --st-vid-b: #555B66;
  /* шрифт формы — от темы, не хардкод мокапа (Arsenal) */
  --st-font: var(--font-body, Arial, sans-serif);
  --st-font-mono: ui-monospace, 'JetBrains Mono', monospace;
}
.rq-sf .sf { display: grid; gap: 14px; font-family: var(--st-font); font-size: 15px; font-weight: 400; line-height: 1.45; color: var(--st-ink); }
.rq-sf .sf h4 { font-family: var(--st-font); font-size: 18px; font-weight: 400; line-height: 1.2; margin: 0; }
.rq-sf .sf-f { display: grid; gap: 6px; }
.rq-sf .sf-l { display: flex; justify-content: space-between; gap: 10px; font-size: 14.5px; }
.rq-sf .sf-l .sf-q { color: var(--st-ink2); font-size: 12.5px; text-align: right; }
.rq-sf .sf-h { font-size: 12.5px; color: var(--st-ink2); margin: 0; line-height: 1.4; }
.rq-sf .sf-e { font-size: 12.5px; color: var(--st-err); margin: 0; }
.rq-sf .sf-in { width: 100%; min-height: 44px; border: 1px solid var(--st-line); border-radius: 3px; padding: 10px 12px; background: var(--st-surface); font-family: var(--st-font); font-size: 15px; line-height: 1.4; color: var(--st-ink); outline: none; }
.rq-sf .sf-in:focus { border-color: var(--st-ink); }
.rq-sf textarea.sf-in { min-height: 84px; resize: vertical; }
.rq-sf .sf-in.bad { border-color: var(--st-err); }
.rq-sf .sf-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.rq-sf .sf-btns button { min-height: 40px; padding: 6px 14px; border: 1px solid var(--st-line); border-radius: 3px; background: var(--st-surface); font-family: var(--st-font); font-size: 14px; font-weight: 400; color: var(--st-ink); cursor: pointer; }
.rq-sf .sf-btns button.on { border-color: var(--st-ink); box-shadow: inset 0 0 0 1px var(--st-ink); }
.rq-sf .sf-chk { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.4; cursor: pointer; }
.rq-sf .sf-chk input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--st-ink); flex: none; }
.rq-sf .sf-up { position: relative; display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 8px 12px; border: 1px dashed var(--st-up-border); border-radius: 3px; background: var(--st-surface); cursor: pointer; }
.rq-sf .sf-up:hover { border-color: var(--st-ink); }
.rq-sf .sf-up:focus-within { outline: 2px solid var(--st-focus); outline-offset: 2px; }
.rq-sf .sf-up input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.rq-sf .sf-up .ic { width: 34px; height: 34px; border-radius: 3px; background: var(--st-icon-bg); display: flex; align-items: center; justify-content: center; flex: none; }
.rq-sf .sf-up .ic svg { width: 18px; height: 18px; }
.rq-sf .sf-up .tx { display: grid; min-width: 0; font-size: 14px; }
.rq-sf .sf-up .tx small { color: var(--st-ink2); font-size: 12px; }
.rq-sf .sf-up.bad { border-color: var(--st-err); }
.rq-sf .sf-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(54px, 1fr)); gap: 6px; }
.rq-sf .sf-thumbs div { position: relative; aspect-ratio: 1; border-radius: 3px; overflow: hidden; background: var(--st-thumb-bg); }
.rq-sf .sf-thumbs img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rq-sf .sf-thumbs button { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border: 0; border-radius: 50%; background: var(--st-thumb-x); color: var(--st-surface); font-size: 12px; line-height: 20px; cursor: pointer; padding: 0; }
.rq-sf .sf-thumbs .more { display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--st-ink2); }
.rq-sf .sf-vids { display: grid; gap: 6px; }
.rq-sf .sf-vid { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--st-line); border-radius: 3px; background: var(--st-surface); font-size: 13.5px; }
.rq-sf .sf-vid i { width: 44px; height: 30px; border-radius: 2px; background: linear-gradient(150deg, var(--st-vid-a), var(--st-vid-b)); flex: none; display: flex; align-items: center; justify-content: center; color: var(--st-surface); font-style: normal; font-size: 11px; }
.rq-sf .sf-vid span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rq-sf .sf-vid small { color: var(--st-ink2); }
.rq-sf .sf-vid button { border: 0; background: none; color: var(--st-ink2); cursor: pointer; font-size: 16px; }
.rq-sf .sf-sub { height: 50px; border: 0; border-radius: 2px; background: var(--st-ink); color: var(--st-surface); font-family: var(--st-font); font-size: 14px; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; }
.rq-sf .sf-sub[disabled] { background: var(--st-ghost); cursor: not-allowed; }
.rq-sf .sf-note { font-size: 12.5px; color: var(--st-ink2); line-height: 1.45; margin: 0; }
.rq-sf .sf-box { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--st-line); border-radius: 3px; background: var(--st-surface); }
.rq-sf .sf-sec { font-family: var(--st-font-mono); font-size: 11px; font-weight: 400; line-height: 1.3; letter-spacing: 0.08em; text-transform: uppercase; color: var(--st-ink2); padding-top: 6px; border-top: 1px solid var(--st-line); }
.rq-sf .sf-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 640px) {
  .rq-sf .sf-two { grid-template-columns: 1fr; }
}
`.trim();
