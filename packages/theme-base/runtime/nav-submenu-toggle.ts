/**
 * Меню раскрывается НАЖАТИЕМ: вложенные пункты в шторке и меню шапки на
 * компьютере (второе — владелец 24.09: «не по ховеру, а по клику»; раньше
 * там было CSS-наведение по пункту 25 ниже).
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

  // Меню шапки на компьютере («Выпадающее», «Расширенное», третий уровень)
  // тоже раскрывается НАЖАТИЕМ, не наведением (владелец 24.09). Разметка:
  //   [data-nav-menu]        — обёртка пункта вместе с его панелью;
  //   [data-nav-menu-toggle] — кнопка пункта, прямой потомок обёртки;
  //   [data-open]            — ставится на обёртку, панель видна по нему (CSS).
  // Открыт один путь: нажатие закрывает всё, кроме нажатого пункта и его
  // родителей; нажатие мимо открытого меню и Esc закрывают всё.
  var setMenuOpen = function (group, open) {
    if (open) group.setAttribute('data-open', '');
    else group.removeAttribute('data-open');
    var btn = group.querySelector(':scope > [data-nav-menu-toggle]');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  var closeMenus = function (keep) {
    var open = document.querySelectorAll('[data-nav-menu][data-open]');
    for (var i = 0; i < open.length; i++) {
      if (!keep || !open[i].contains(keep)) setMenuOpen(open[i], false);
    }
  };

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var btn = target.closest('[data-nav-menu-toggle]');
    var group = btn ? btn.closest('[data-nav-menu]') : null;
    if (!group) {
      if (!target.closest('[data-nav-menu][data-open]')) closeMenus(null);
      return;
    }
    e.preventDefault();
    var open = !group.hasAttribute('data-open');
    closeMenus(group);
    setMenuOpen(group, open);
  });

  // Мимо меню — закрыть уже на нажатии кнопки мыши и при захвате: превью
  // конструктора глушит всплытие «click» у своих подсекций, и до обработчика
  // выше такое нажатие не доходит — меню оставалось открытым.
  document.addEventListener('pointerdown', function (e) {
    var target = e.target;
    if (target && target.closest && !target.closest('[data-nav-menu]')) closeMenus(null);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenus(null);
  });
})();
`;
