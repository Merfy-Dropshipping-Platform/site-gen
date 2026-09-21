/**
 * Кнопки вариантов одной группы — одной ширины.
 *
 * ЖАЛОБА ВЛАДЕЛЬЦА 21.09 со снимком PDP: «варианты кнопки одинаковыми должны
 * быть при одних и тех же показателях, S M L к примеру». Замер его же ряда
 * (Chrome, шрифт системы): XS 57, S 47, M 49, L 45, XL 56, XXL 66 — каждый чип
 * по своему слову.
 *
 * ЧТО ГОВОРИТ КАНОН. `NtVariantTextRow.astro` дизайн-системы (Figma 494:10735
 * «Кнопка -- Нет») задаёт `h-10 px-3` — ширина ПО СОДЕРЖИМОМУ, без минимума.
 * Равные чипы в каноне есть, но только у формы «Круг/Квадрат» (`h-12 min-w-12`
 * в ProductVariants). То есть «как у верстальщиков» = ровно то, на что владелец
 * жалуется; он на это и ответил «или сделай нормально».
 *
 * ПРАВИЛО. Внутри группы все чипы получают ширину самого широкого — но не шире
 * ДВОЙНОЙ ВЫСОТЫ чипа. Потолок не выдуман из длины подписи (такая эвристика
 * ломается на «42/44/46» и «One size»), а взят от самого чипа: шире двух своих
 * высот — это уже не токен размера, а слово. На практике:
 *
 *   размеры  XS…XXL   самый широкий 66 < потолка 96 → все 66, ровный ряд;
 *   цвета    «Светло-голубой» 154 > 96 → он остаётся 154, остальные тянутся
 *            до 96. Без потолка все четыре стали бы по 154, ряд вырос бы с
 *            419 до 640px и переносился на две строки — новый дефект вместо
 *            старого.
 *
 * ПОЧЕМУ НАБЛЮДАТЕЛЬ, А НЕ ПРАВКА В ШЕСТИ ФАЙЛАХ. Один и тот же ряд рисуют
 * шесть путей: `ProductVariants.astro` (сервер) и пять перерисовок гидрации
 * (rose `storefront-hydrate.ts`, ProductDetail у bloom/satin/vanilla/flux).
 * Правка в каждом — ровно тот случай «фича на одном пути из трёх», на котором
 * эта задача уже горела. Наблюдатель ловит ЛЮБУЮ перерисовку.
 *
 * ПОЧЕМУ ИСХОДНИКОМ-СТРОКОЙ, А НЕ МОДУЛЕМ. Первый заход подключил рантайм как
 * `<script>import …</script>`. На собранной витрине это дало
 * `src="/app/packages/theme-base/blocks/Product/Product.astro?astro&type=script…"`
 * — путь сборщика, который отдаёт 404 (проверено на живом стенде 21.09), то
 * есть код не грузился вовсе. Клиентский код блоков здесь живёт строкой и
 * вставляется `<script is:inline set:html={…}>` — так же, как
 * `CHECKOUT_BUTTON_CONTRAST_SOURCE`.
 */

/** Во сколько раз чип может быть шире своей высоты, оставаясь «токеном». */
export const CAP_RATIO = 2;

/**
 * Ширина, к которой равняется группа: самый широкий чип, но не шире потолка.
 * Вынесено отдельно, потому что jsdom размеров не считает — гард проверяет
 * решение на замеренных в браузере числах, а не на нулях.
 */
export function chipTargetWidth(widest: number, height: number): number {
  return Math.min(widest, height * CAP_RATIO);
}

/** Тело скрипта для `<script is:inline set:html={…}>`. */
export const VARIANT_CHIP_EQUALIZE_SOURCE = `
(function () {
  var CAP_RATIO = ${CAP_RATIO};

  // Группы чипов. Две разметки: theme-base помечает чипы
  // data-variant-chip + data-variant-key, порты тем и канон — строкой
  // role="radiogroup" с кнопками внутри.
  function chipGroups(root) {
    var out = [];
    var seen = [];
    var byKey = {};
    var keyed = root.querySelectorAll('[data-variant-chip][data-variant-key]');
    for (var i = 0; i < keyed.length; i++) {
      var el = keyed[i];
      var key = el.getAttribute('data-variant-key') || '';
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(el);
      seen.push(el);
    }
    for (var k in byKey) if (Object.prototype.hasOwnProperty.call(byKey, k)) out.push(byKey[k]);

    var rows = root.querySelectorAll('[role="radiogroup"]');
    for (var r = 0; r < rows.length; r++) {
      var chips = [];
      var kids = rows[r].children;
      for (var c = 0; c < kids.length; c++) {
        if (kids[c].tagName === 'BUTTON' && seen.indexOf(kids[c]) === -1) chips.push(kids[c]);
      }
      if (chips.length) out.push(chips);
    }
    return out;
  }

  function equalize(root) {
    var groups = chipGroups(root || document);
    for (var g = 0; g < groups.length; g++) {
      var chips = groups[g];
      if (chips.length < 2) continue;
      // Снимаем прошлый минимум — иначе повторный проход мерил бы уже
      // выровненные чипы и ряд только рос бы.
      for (var i = 0; i < chips.length; i++) chips[i].style.removeProperty('min-width');
      var widest = 0;
      var height = 0;
      for (var j = 0; j < chips.length; j++) {
        var rect = chips[j].getBoundingClientRect();
        if (rect.width > widest) widest = rect.width;
        if (rect.height > height) height = rect.height;
      }
      if (widest <= 0 || height <= 0) continue;
      var target = Math.min(widest, height * CAP_RATIO);
      for (var m = 0; m < chips.length; m++) chips[m].style.minWidth = Math.ceil(target) + 'px';
    }
  }

  window.__merfyEqualizeVariantChips = equalize;

  function start() {
    equalize(document);
    // Наблюдаем ТОЛЬКО за появлением/исчезновением узлов: свою правку мы вносим
    // в inline-стиль, а он childList не двигает — зацикливания нет.
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        equalize(document);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Шрифты доезжают позже разметки и меняют ширину подписей.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { equalize(document); });
    }
    window.addEventListener('resize', function () { equalize(document); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
