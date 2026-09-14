/**
 * Кнопка оплаты «как у Shopify»: её видно всегда.
 *
 * ЗАЧЕМ. После того как цветовая схема перестала заливать ЛЕВУЮ колонку
 * чекаута (эталон владельца: «левая часть от нас, там только меняется цвет
 * кнопки и юр инфа цвет»), кнопка осталась на паре токенов схемы —
 * `--color-button-bg` / `--color-button-text`. А пары в темах собраны под фон
 * ТОЙ ЖЕ СХЕМЫ: у тёмной схемы кнопка светлая, потому что подразумевается
 * тёмная поверхность под ней. Поверхности больше нет — и плашка совпадает с
 * фоном колонки. Замер собранных витрин (Chromium, 1440×900, 13-14.09) дал 7
 * таких связок из 21: rose scheme-4, satin scheme-4, bloom scheme-1 и -2,
 * vanilla scheme-1/3/4 (у vanilla колонка сама тёмно-зелёная, и ровно этот
 * зелёный лежит в `--color-button-bg`).
 *
 * ЧТО РЕШЕНО (владелец, 14.09): «делаем как у Shopify» — и это ЕДИНСТВЕННОЕ
 * место, где разрешено завести новый механизм. Три требования:
 *   1) плашка заметна на фоне колонки: контраст WCAG ≥ 3:1 (несплошной текст);
 *   2) подпись читаема на плашке: ≥ 4.5:1, и считается по ЯРКОСТИ плашки, а не
 *      «мерчант подобрал пару»;
 *   3) цвет по-прежнему приходит ИЗ СХЕМЫ, а не из темы.
 *
 * КАК УСТРОЕНО (по шагам, чтобы не пришлось угадывать по коду):
 *   ① `--color-button-bg` берётся КАК ЕСТЬ, если он уже даёт ≥ 3:1. Это 14
 *      связок из 21 — их вид не меняется ни на пиксель;
 *   ② иначе перебираются остальные роли ТОЙ ЖЕ схемы — accent, heading, bg,
 *      text, button-2-bg — и берётся самая контрастная к фону колонки. Для
 *      тёмной схемы на светлой колонке это обычно её собственный `--color-bg`:
 *      чёрная плашка на белой форме, ровно шопифаевский вид;
 *   ③ если ни одна роль не дотянула (во всей матрице пяти тем это ровно один
 *      случай — bloom scheme-2, лучшая роль даёт 2.43:1), самая контрастная из
 *      них ЗАТЕНЯЕТСЯ к чёрному или белому ровно до порога. Оттенок при этом
 *      сохраняется — значит цвет остаётся «из схемы», а не подменяется чужим;
 *   ④ подпись: `--color-button-text` остаётся, если читаем на получившейся
 *      плашке; иначе чёрная или белая — что контрастнее. max(чёрный, белый)
 *      никогда не опускается ниже 4.58:1, поэтому порог достижим всегда.
 *
 * ПОЧЕМУ В РАНТАЙМЕ, А НЕ В tokens-css. Фон левой колонки задаёт САМА ТЕМА
 * (`<body>` / `global.css` порта), а не tokens.css: замер показал vanilla
 * 58,69,48 и bloom 255,255,255 при том, что второй `:root` в tokens.css
 * объявляет 38,49,28 и 207,122,139. Считать контраст в сборке значило бы
 * угадывать фон или вшивать в TS по значению на тему — то есть завести
 * per-theme override, чего делать нельзя. В браузере фон читается фактический.
 *
 * ПОЧЕМУ СТРОКОЙ. Исходник инлайнится в блок (`CheckoutSubmit.astro`,
 * `<script is:inline set:html={…}>`) и ИМ ЖЕ исполняется в гарде
 * (`src/themes/__tests__/checkout-submit-contrast.spec.ts`): один текст на
 * витрину и на проверку, копия разъехалась бы молча. Тот же приём, что у
 * `PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE` в preview.service.
 *
 * Панель не трогается: новых полей нет, состав параметров — канон.
 */
export const CHECKOUT_BUTTON_CONTRAST_SOURCE = `
function __merfyCheckoutButtonColors(roles, columnBg) {
  var MIN_PLATE = 3;    // WCAG 1.4.11 non-text contrast — плашка к фону
  var MIN_LABEL = 4.5;  // WCAG 1.4.3 AA — подпись к плашке
  var BLACK = [0, 0, 0];
  var WHITE = [255, 255, 255];

  function triple(value) {
    if (typeof value !== 'string') return null;
    var parts = value.trim().split(/[\\s,]+/);
    if (parts.length < 3) return null;
    var out = [];
    for (var i = 0; i < 3; i++) {
      var n = parseInt(parts[i], 10);
      if (!isFinite(n)) return null;
      out.push(Math.min(255, Math.max(0, n)));
    }
    return out;
  }
  function channel(c) {
    var s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  function luminance(rgb) {
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  }
  function ratio(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    return ((la > lb ? la : lb) + 0.05) / ((la < lb ? la : lb) + 0.05);
  }
  /** Смешение к цели: t=0 — исходный цвет, t=1 — цель. Порядок каналов цел. */
  function mix(rgb, target, t) {
    return [
      Math.round(rgb[0] + (target[0] - rgb[0]) * t),
      Math.round(rgb[1] + (target[1] - rgb[1]) * t),
      Math.round(rgb[2] + (target[2] - rgb[2]) * t)
    ];
  }

  var column = triple(columnBg) || WHITE;
  var order = ['button-bg', 'accent', 'heading', 'bg', 'text', 'button-2-bg'];
  var values = {
    'button-bg': triple(roles && roles.buttonBg),
    'accent': triple(roles && roles.accent),
    'heading': triple(roles && roles.heading),
    'bg': triple(roles && roles.bg),
    'text': triple(roles && roles.text),
    'button-2-bg': triple(roles && roles.button2Bg)
  };

  // ① пара мерчанта уже читается — ничего не трогаем.
  var plate = values['button-bg'];
  var source = 'button-bg';
  var shaded = false;
  // ①-бис ЦВЕТ КНОПКИ МЕРЧАНТА НЕ ВЫБРАСЫВАЕМ. Если он ОТЛИЧАЕТСЯ от фона
  // колонки, но не дотянул до порога, — затеняем ЕГО до порога, а не меняем на
  // чужую роль. Замер жалобы 15.09 («в левой части не применяется цветовая
  // схема к кнопке»): мерчант задал кнопку #B722B0 = 183 34 176 на фоне схемы
  // #71C0FF = 113 192 255, контраст 2.76:1 — не хватило 0.24 до порога 3:1, и
  // шаг ② отдавал вместо неё чужую роль: rose/satin/flux → button-2-bg
  // (0 0 0 / 8 2 0 / 11 11 11), vanilla/bloom → heading (38 49 28 / 0 0 0).
  // Кнопка становилась почти чёрной, а вместе с disabled:opacity-50 пустой
  // корзины читалась как серая и неактивная.
  //
  // Почему именно «отличается от фона». Все СЕМЬ заводских связок, ради которых
  // шаг ② и заводился, имеют контраст РОВНО 1.00 и манхэттенское расстояние
  // РОВНО 0: --color-button-bg там побайтно равен фону колонки (замер всей
  // матрицы 21 связки: rose scheme-4, satin scheme-4, bloom scheme-1/2,
  // vanilla scheme-1/3/4). Такой цвет о кнопке не говорит ничего — подменять
  // его ролью правильно. Цвет, который мерчант выбрал сам, отличается от фона
  // (в жалобе — на 307 по манхэттену) и несёт его выбор: у него сохраняем
  // ОТТЕНОК, а порог добираем затенением — тем же приёмом, что и шаг ③.
  var sameAsColumn =
    !!plate && plate[0] === column[0] && plate[1] === column[1] && plate[2] === column[2];
  if (plate && !sameAsColumn && ratio(plate, column) < MIN_PLATE) {
    var tgt = ratio(BLACK, column) >= ratio(WHITE, column) ? BLACK : WHITE;
    for (var s1 = 1; s1 <= 64; s1++) {
      var cand = mix(plate, tgt, s1 / 64);
      if (ratio(cand, column) >= MIN_PLATE) { plate = cand; shaded = true; break; }
    }
    if (!shaded) { plate = tgt; shaded = true; }
  }
  if (!plate || ratio(plate, column) < MIN_PLATE) {
    // ② самая контрастная роль ТОЙ ЖЕ схемы.
    var best = null;
    var bestRatio = -1;
    var bestSource = null;
    for (var i = 0; i < order.length; i++) {
      var v = values[order[i]];
      if (!v) continue;
      var r = ratio(v, column);
      if (r > bestRatio) { bestRatio = r; best = v; bestSource = order[i]; }
    }
    if (!best) {
      // Схема не дала ни одного разбираемого цвета — берём максимальный контраст
      // к колонке. Сюда попадают только битые данные ревизии.
      best = ratio(BLACK, column) >= ratio(WHITE, column) ? BLACK : WHITE;
      bestSource = 'fallback';
      bestRatio = ratio(best, column);
    }
    plate = best;
    source = bestSource;
    // ③ ни одна роль не дотянула — затеняем выбранную до порога, сохраняя оттенок.
    if (bestRatio < MIN_PLATE) {
      var target = ratio(BLACK, column) >= ratio(WHITE, column) ? BLACK : WHITE;
      for (var step = 1; step <= 64; step++) {
        var candidate = mix(best, target, step / 64);
        if (ratio(candidate, column) >= MIN_PLATE) {
          plate = candidate;
          shaded = true;
          break;
        }
      }
      if (!shaded) { plate = target; shaded = true; }
    }
  }

  // ④ подпись: мерчантская, если читается; иначе — по яркости плашки.
  var label = values['button-text'] || triple(roles && roles.buttonText);
  if (!label || ratio(label, plate) < MIN_LABEL) {
    label = ratio(BLACK, plate) >= ratio(WHITE, plate) ? BLACK : WHITE;
  }

  return {
    plate: plate,
    label: label,
    source: source,
    shaded: shaded,
    plateRatio: ratio(plate, column),
    labelRatio: ratio(label, plate)
  };
}
if (typeof window !== 'undefined') { window.__merfyCheckoutButtonColors = __merfyCheckoutButtonColors; }
`.trim();
