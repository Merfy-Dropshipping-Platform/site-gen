/**
 * Универсальный резолвер корня блока (storefront) — ЕДИНЫЙ источник строки,
 * инжектируемой в <head> в обоих контекстах:
 *   • live  — build.service.injectBlockRootHelper (пост-обработка собранного dist)
 *   • превью — preview.controller.injectPreviewGlobals
 *
 * Определяется ДО любого блочного `<script is:inline>`, поэтому каждый блок
 * получает СВОЙ корень единообразно:
 *
 *   var root = window.__merfyRoot(blockId);
 *   if (!root) return;
 *
 * Двойная стратегия:
 *   1) по уникальному data-puck-component-id (переживает hot-replace конструктора —
 *      id вшит в define:vars, а document.currentScript при пересоздании скрипта = null);
 *   2) страховка — ближайшая предшествующая секция от document.currentScript
 *      (работает на свежей загрузке даже без blockId).
 *
 * Зачем: при 2+ одинаковых секциях на странице first-match (`querySelector('section[...]')`)
 * оживлял только первую. Этот примитив делает адресацию независимой от секции.
 *
 * Канон для авторов блоков — packages/theme-base/CLAUDE.md;
 * гард — packages/theme-base/__tests__/block-root-scoping.test.ts.
 *
 * Spec 102 (block-root-scoping).
 */
export const BLOCK_ROOT_INLINE =
  `<script>(function(){if(window.__merfyRoot)return;` +
  `window.__merfyRoot=function(blockId){` +
  `if(blockId){var el=document.querySelector('[data-puck-component-id="'+blockId+'"]');if(el)return el;}` +
  `var s=document.currentScript,p=s&&s.previousElementSibling;` +
  `while(p){if(p.nodeType===1&&p.hasAttribute('data-puck-component-id'))return p;p=p.previousElementSibling;}` +
  `return null;};})();</script>`;

/**
 * Маркер идемпотентности. Присутствует ТОЛЬКО в определении хелпера
 * (`window.__merfyRoot=function`), а не в его вызовах (`window.__merfyRoot(blockId)`),
 * поэтому страница с блоками, которые ВЫЗЫВАЮТ хелпер, не считается уже
 * проинжектированной.
 */
export const BLOCK_ROOT_MARKER = 'window.__merfyRoot=function';
