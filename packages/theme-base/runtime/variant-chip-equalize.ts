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
 * Правка в каждом — это ровно тот случай «фича на одном пути из трёх», на
 * котором эта задача уже горела. Наблюдатель ловит ЛЮБУЮ перерисовку.
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

type Chip = HTMLElement;

/**
 * Группы чипов. Два вида разметки:
 *  • theme-base — чипы помечены `data-variant-chip` + `data-variant-key`;
 *  • порты тем и канон — строка `role="radiogroup"` с кнопками внутри.
 */
function chipGroups(root: ParentNode): Chip[][] {
  const out: Chip[][] = [];
  const seen = new Set<Element>();

  const byKey = new Map<string, Chip[]>();
  root.querySelectorAll<Chip>('[data-variant-chip][data-variant-key]').forEach((el) => {
    const key = el.getAttribute('data-variant-key') ?? '';
    const list = byKey.get(key) ?? [];
    list.push(el);
    byKey.set(key, list);
    seen.add(el);
  });
  byKey.forEach((list) => out.push(list));

  root.querySelectorAll('[role="radiogroup"]').forEach((row) => {
    const chips = Array.from(row.children).filter(
      (c): c is Chip => c instanceof HTMLElement && c.tagName === 'BUTTON' && !seen.has(c),
    );
    if (chips.length) out.push(chips);
  });

  return out;
}

export function equalizeVariantChips(root: ParentNode = document): void {
  for (const chips of chipGroups(root)) {
    if (chips.length < 2) continue;
    // Снимаем прошлый минимум — иначе повторный проход мерил бы уже
    // выровненные чипы и ряд только рос бы.
    for (const c of chips) c.style.removeProperty('min-width');
    let widest = 0;
    let height = 0;
    for (const c of chips) {
      const r = c.getBoundingClientRect();
      widest = Math.max(widest, r.width);
      height = Math.max(height, r.height);
    }
    if (widest <= 0 || height <= 0) continue;
    const target = chipTargetWidth(widest, height);
    for (const c of chips) c.style.minWidth = `${Math.ceil(target)}px`;
  }
}

function start(): void {
  equalizeVariantChips();

  // Наблюдаем ТОЛЬКО за появлением/исчезновением узлов: свою правку мы вносим
  // в inline-стиль, а он childList не двигает — зацикливания нет.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      equalizeVariantChips();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Шрифты доезжают позже разметки и меняют ширину подписей.
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) void fonts.ready.then(() => equalizeVariantChips());
  window.addEventListener('resize', () => equalizeVariantChips());
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
