/**
 * 106-fix (перестановка хрома превью).
 *
 * `composeV2Page` раскладывает страницу как `хром → <main>тело</main> → хром`
 * (см. `themes/v2-page-composer.ts`: HEADER_TYPES = PromoBanner/Header,
 * FOOTER_TYPES = Footer). Reconcile в агенте превью морфит ТОЛЬКО `<main>`, а
 * для блоков вне него умел лишь скрыть/показать (`data-rc-hidden`). Поэтому
 * перестановка промо-баннера с шапкой меняла дерево конструктора, но не
 * превью: мерчант видел новый порядок лишь после ручной перезагрузки.
 *
 * Функция приводит соседей `<main>` к порядку целевого дерева прямо в DOM —
 * без сети, без перезагрузки iframe и без второго списка «типов хрома» на
 * стороне конструктора: что вне `<main>`, решает сам документ.
 *
 * Тело сериализуется в инлайн-агент через `.toString()`, поэтому функция
 * обязана быть self-contained: ES5-синтаксис, никаких импортов, замыканий и
 * необязательной цепочки. Тест исполняет ЭТУ ЖЕ функцию — двойника нет.
 */

/** Минимум от узла, который нужен перестановке (DOM-совместимо). */
export interface ReorderNode {
  parentElement: ReorderNode | null;
  parentNode?: ReorderNode | null;
  nextSibling?: ReorderNode | null;
  childNodes?: ArrayLike<ReorderNode>;
  contains(other: ReorderNode): boolean;
  insertBefore(node: ReorderNode, ref: ReorderNode | null): unknown;
}

/** Минимум от документа: поиск блока по его puck-id. */
export interface ReorderDoc {
  querySelector(selector: string): ReorderNode | null;
}

/** Элемент целевого дерева: видимый блок страницы в порядке конструктора. */
export interface ReorderTargetBlock {
  id?: string | null;
}

export function reorderChrome(
  rcTarget: ReorderTargetBlock[],
  rcMain: ReorderNode,
  doc: ReorderDoc,
): void {
  var parent = rcMain.parentNode || rcMain.parentElement;
  if (!parent || !rcTarget || !rcTarget.length) return;

  // Целевые позиции: хром, встреченный ДО первого блока тела, стоит перед
  // <main>; всё, что после, — за ним. Блок тела определяем по документу, а не
  // по списку типов: внутри <main> → тело, вне → хром.
  var before: ReorderNode[] = [];
  var after: ReorderNode[] = [];
  var seenBody = false;
  for (var i = 0; i < rcTarget.length; i++) {
    var block = rcTarget[i];
    if (!block || !block.id) continue;
    var el = doc.querySelector('[data-puck-component-id="' + block.id + '"]');
    if (!el || rcMain.contains(el)) {
      // Внутри <main> (или ещё не в DOM — morph уже свёл тело): граница хрома.
      seenBody = true;
      continue;
    }
    // Поднимаемся до соседа <main>: блок может быть обёрнут scheme-обёрткой
    // (`<div class="color-scheme-N">`), которая и является прямым ребёнком body.
    var top = el;
    while (top.parentElement && top.parentElement !== parent) {
      top = top.parentElement;
    }
    if (top.parentElement !== parent && top.parentNode !== parent) continue;
    if (seenBody) after.push(top);
    else before.push(top);
  }

  // Двигаем только при реальном расхождении: insertBefore переносит узел, а
  // перенос сбрасывает состояние живого поддерева (sticky-шапка, видео,
  // открытый дровер). Идемпотентный вызов обязан быть no-op.
  if (!sameOrder(collectSide(parent, rcMain, before, true), before)) {
    for (var b = 0; b < before.length; b++) {
      parent.insertBefore(before[b], rcMain);
    }
  }
  if (!sameOrder(collectSide(parent, rcMain, after, false), after)) {
    for (var a = after.length - 1; a >= 0; a--) {
      parent.insertBefore(after[a], rcMain.nextSibling || null);
    }
  }
}

/**
 * Фактический порядок интересующих нас узлов по одну сторону от <main>.
 * Посторонние соседи (скрытый хром, служебные узлы) игнорируются — их место
 * нас не касается.
 */
function collectSide(
  parent: ReorderNode,
  rcMain: ReorderNode,
  wanted: ReorderNode[],
  leftSide: boolean,
): ReorderNode[] {
  var kids = parent.childNodes;
  if (!kids) return [];
  var out: ReorderNode[] = [];
  var passedMain = false;
  for (var i = 0; i < kids.length; i++) {
    var node = kids[i];
    if (node === rcMain) {
      passedMain = true;
      continue;
    }
    if (passedMain === leftSide) continue;
    if (indexOfNode(wanted, node) !== -1) out.push(node);
  }
  return out;
}

function sameOrder(actual: ReorderNode[], expected: ReorderNode[]): boolean {
  if (actual.length !== expected.length) return false;
  for (var i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

function indexOfNode(list: ReorderNode[], node: ReorderNode): number {
  for (var i = 0; i < list.length; i++) {
    if (list[i] === node) return i;
  }
  return -1;
}

/**
 * Текст функций для инлайн-агента превью. Имя `__rcOrderChrome` — то, под
 * которым агент её зовёт из `__rcApply`.
 */
export const CHROME_REORDER_INLINE = [
  'var __rcOrderChrome = ' + reorderChrome.toString() + ';',
  'var collectSide = ' + collectSide.toString() + ';',
  'var sameOrder = ' + sameOrder.toString() + ';',
  'var indexOfNode = ' + indexOfNode.toString() + ';',
].join('\n');
