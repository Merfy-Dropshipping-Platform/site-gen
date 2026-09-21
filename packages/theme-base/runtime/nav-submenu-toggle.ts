/**
 * Вложенные пункты меню в шторке раскрываются НАЖАТИЕМ.
 *
 * Пункт 25 документа владельца «баги шапки и меню»: «На десктопе подменю
 * раскрывается по наведению курсора. На телефоне — по нажатию».
 *
 * Замер по пяти темам (рендер шапки с трёхуровневым меню, Chromium 1440px):
 * наведение на десктопе уже работает у rose/bloom/flux/satin чистым CSS
 * (`group-hover`), у vanilla подменю не рисовалось вовсе — её маппинг пунктов
 * терял `submenu`. А на телефоне инлайн-навигация скрыта, меню живёт в шторке,
 * и там все вложенные уровни были РАЗВЁРНУТЫ всегда: нажимать нечего, длинное
 * меню разъезжалось на экран и больше.
 *
 * Здесь — общий обработчик для шторок всех пяти тем. Разметка договаривается
 * тремя атрибутами:
 *   [data-nav-group]      — обёртка одного пункта вместе с его вложенным списком;
 *   [data-nav-sub-toggle] — кнопка-стрелка рядом со ссылкой;
 *   [data-nav-sub]        — сам вложенный список, прямой потомок обёртки.
 * Пункт без вложенных остаётся ровно таким, каким был, — ни кнопки, ни обёртки.
 *
 * Строкой-исходником, а не модулем: клиентский код общих пакетов на собранной
 * витрине уезжает в путь сборщика и отдаёт 404 (поймано на VARIANT_CHIP_EQUALIZE
 * 21.09). Вставляется `<script is:inline set:html={…}>`.
 */
export const NAV_SUBMENU_TOGGLE_SOURCE = `
(function () {
  if (window.__merfyNavSubmenuToggle) return;
  window.__merfyNavSubmenuToggle = true;

  var setOpen = function (btn, panel, open) {
    if (open) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var btn = target.closest('[data-nav-sub-toggle]');
    if (!btn) return;
    // Кнопка живёт рядом со ссылкой пункта — переход по ссылке не трогаем,
    // но собственное нажатие по стрелке не должно всплывать к оверлею шторки.
    e.preventDefault();
    e.stopPropagation();
    var group = btn.closest('[data-nav-group]');
    var panel = group ? group.querySelector(':scope > [data-nav-sub]') : null;
    if (!panel) return;
    setOpen(btn, panel, panel.hasAttribute('hidden'));
  });

  // Открытая ветка активного раздела: мерчант пришёл на /collections/x — его
  // ветка развёрнута сразу, остальные закрыты.
  var openActive = function () {
    var current = (location.pathname || '/').replace(/\\/+$/, '') || '/';
    var links = document.querySelectorAll('[data-nav-sub] a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute('href') || '').replace(/\\/+$/, '') || '/';
      if (href !== current) continue;
      var node = links[i];
      while (node && node !== document.body) {
        if (node.hasAttribute && node.hasAttribute('data-nav-sub')) {
          var group = node.parentElement;
          var btn = group ? group.querySelector('[data-nav-sub-toggle]') : null;
          if (btn) setOpen(btn, node, true);
        }
        node = node.parentElement;
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openActive);
  } else {
    openActive();
  }
})();
`;
