import {
  MESSAGE_MAX_LENGTH,
  PREVIEW_UPDATE_EVENT,
  PREVIEW_UPDATED_EVENT,
  SECTION_ERROR_EVENT,
} from '@merfy/shell/preview';

// Код секций (блок 5, часть 5г): правку секции с кодом получает скрипт превью (dist/preview.js) — событие
// merfy:preview:update на узле секции, рамка выбора — по merfy:preview:updated; сбой скрипта секции — красная рамка и
// подпись первым элементом секции; кнопки и поля секции её не выбирают, как в превью пяти тем.
// Подпункты (часть 3): клик — select-subsection, выбранный — рамка #88b0da, наведение на секцию — #cfdff0 у её
// подпунктов; подписи и кнопок у подпункта нет (Р59). Часть 4: место секции по группе из reconcile, navigate по
// ссылке на свою страницу, меню и настройки темы — в запросе блока.
// Скрипт превью секций (блок 1 «Секций и SDK»; сообщения — как у превью нынешних тем). Работает рядом со слушателем
// токенов (preview-agent.ts) на превью главной. Шлёт ready каждые 300 мс, пока не придёт init (не больше 40 раз). Клик
// по секции — select-block; set-selection — рамка выбранной секции с её названием и «Удалить» (Р7; у верхнего края
// страницы подпись — внутри рамки) и «Скопировать» — duplicate-block; кнопки — по set-selection.actions (п. 24),
// секция за краем окна — прокрутка к ней; «Удалить» — delete-block. update-block —
// POST <адрес превью>/block с экземпляром и замена секции по data-section-id; ответ на старую правку отбрасывается.
// reconcile — лишние секции убираются, новые и изменённые запрашиваются, порядок — как в списке, ответ —
// reconcile-ack; ответ блока, на который уже ушёл более новый запрос, тоже отбрасывается — на странице остаётся новый
// (Р11). Ошибка запроса — render-error. Скрипт — строкой ES5: страница печатает его как есть. Рамка и плашка — как у
// превью нынешних тем (site-gen, src/services/preview.service.ts): рамка 2px #88b0da, плашка #181818, текст #c3c3c3,
// шрифт системный, значок «Удалить» — мусорная корзина.
export const PREVIEW_SECTIONS_AGENT = `(function () {
  var blockUrl = new URL('preview/block', location.href).href;
  // Часть 5г: имена событий — из протокола превью @merfy/shell/preview.
  var UPDATE_EVENT = ${JSON.stringify(PREVIEW_UPDATE_EVENT)};
  var UPDATED_EVENT = ${JSON.stringify(PREVIEW_UPDATED_EVENT)};
  var ERROR_EVENT = ${JSON.stringify(SECTION_ERROR_EVENT)};
  var MESSAGE_MAX = ${MESSAGE_MAX_LENGTH};
  // Кнопки и поля секции — как в превью пяти тем (src/services/preview.service.ts): нажатие — коду секции, выбора нет.
  var CONTROLS = 'button, input, select, textarea, label[for], [data-action]';
  // «Ошибка в скрипте секции «» — escape-последовательностями, как подсказки кнопок рамки.
  var SCRIPT_ERROR = '\\u041e\\u0448\\u0438\\u0431\\u043a\\u0430 \\u0432 \\u0441\\u043a\\u0440\\u0438\\u043f\\u0442\\u0435 \\u0441\\u0435\\u043a\\u0446\\u0438\\u0438 \\u00ab';
  var STYLE = '#merfy-selection{position:absolute;display:none;pointer-events:none;box-sizing:border-box;border:2px solid #88b0da;z-index:2147483646}'
    + '#merfy-selection [data-merfy-label]{position:absolute;left:-2px;top:-26px;display:flex;align-items:center;gap:8px;height:24px;padding:0 8px;border-radius:8px 8px 0 0;background:#181818;color:#c3c3c3;font:500 12px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;white-space:nowrap}'
    + '#merfy-selection [data-merfy-delete],#merfy-selection [data-merfy-duplicate]{display:flex;align-items:center;gap:4px;border:0;padding:0;background:none;color:inherit;font:inherit;cursor:pointer}'
    + '[data-merfy-block][data-merfy-block-hint]{outline:2px solid #cfdff0 !important;outline-offset:2px}'
    + '[data-merfy-block][data-merfy-block-selected]{outline:2px solid #88b0da !important;outline-offset:2px}'
    + 'merfy-section[data-merfy-state="failed"]{outline:2px solid #dc2626 !important;outline-offset:-2px}'
    + '[data-merfy-script-error]{border:2px solid #dc2626;padding:16px;color:#dc2626;font:14px/1.4 system-ui,sans-serif}';
  var DELETE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  // «Скопировать» — значок подписи превью пяти тем (src/services/preview.service.ts, строки 2107–2109), 16 px.
  var COPY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var labels = {};
  // Какие кнопки показать на подписи (set-selection.actions, п. 24): duplicate: false — без «Скопировать»,
  // remove: false — без «Удалить»; флагов нет — обе.
  var actions = {};
  var selected = null;
  var frame = null;
  // Подпункты (часть 3, Р59, Р60): выбранный — секция и место среди разных data-merfy-block секции; секция под курсором.
  var blockParent = null;
  var blockIndex = null;
  var hinted = null;
  var initialized = false;
  var readySent = 0;
  var tickets = {};
  var hashes = {};
  function post(message) {
    window.parent.postMessage(message, '*');
  }
  function sendReady() {
    if (initialized || readySent >= 40) return clearInterval(readyTimer);
    readySent += 1;
    post({ type: 'ready' });
  }
  var readyTimer = setInterval(sendReady, 300);
  sendReady();
  function all() {
    return Array.prototype.slice.call(document.querySelectorAll('merfy-section[data-section-id]'));
  }
  function byId(id) {
    return document.querySelector('merfy-section[data-section-id="' + id + '"]');
  }
  function sectionOf(node) {
    for (; node && node.nodeType === 1; node = node.parentNode) {
      if (node.tagName === 'MERFY-SECTION' && node.hasAttribute('data-section-id')) return node;
    }
    return null;
  }
  // Разные id блоков секции в порядке страницы: место в этом списке — index в select-subsection и set-selection.
  function blockIdsOf(section) {
    var ids = [];
    Array.prototype.forEach.call(section.querySelectorAll('[data-merfy-block]'), function (node) {
      var id = node.getAttribute('data-merfy-block');
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }
  function blockNodesOf(section, id) {
    return Array.prototype.filter.call(section.querySelectorAll('[data-merfy-block]'), function (node) {
      return node.getAttribute('data-merfy-block') === id;
    });
  }
  // Атрибут подсветки — только у этих узлов: у остальных снимается.
  function mark(attribute, nodes) {
    Array.prototype.forEach.call(document.querySelectorAll('[' + attribute + ']'), function (node) {
      node.removeAttribute(attribute);
    });
    nodes.forEach(function (node) {
      node.setAttribute(attribute, '');
    });
  }
  // Рамка выбранного подпункта — как на проде: только рамка, без подписи. Возвращает первый его узел или null.
  function showBlock() {
    var section = blockParent === null ? null : byId(blockParent);
    var id = section && blockIndex !== null ? blockIdsOf(section)[blockIndex] : undefined;
    var nodes = section && id !== undefined ? blockNodesOf(section, id) : [];
    mark('data-merfy-block-selected', nodes);
    return nodes[0] || null;
  }
  function ensureFrame() {
    if (frame) return frame;
    var style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    frame = document.createElement('div');
    frame.id = 'merfy-selection';
    // Подсказки кнопок — escape-последовательности: страница превью может быть декодирована не в UTF-8, литералы в
    // script-строке искажаются.
    frame.innerHTML = '<div data-merfy-label><span data-merfy-name></span>'
      + '<button type="button" data-merfy-duplicate title="\\u0421\\u043a\\u043e\\u043f\\u0438\\u0440\\u043e\\u0432\\u0430\\u0442\\u044c" aria-label="\\u0421\\u043a\\u043e\\u043f\\u0438\\u0440\\u043e\\u0432\\u0430\\u0442\\u044c">' + COPY_ICON + '</button>'
      + '<button type="button" data-merfy-delete title="\\u0423\\u0434\\u0430\\u043b\\u0438\\u0442\\u044c" aria-label="\\u0423\\u0434\\u0430\\u043b\\u0438\\u0442\\u044c">' + DELETE_ICON + '</button></div>';
    document.body.appendChild(frame);
    return frame;
  }
  function place() {
    if (!frame) return;
    var section = selected === null ? null : byId(selected);
    if (!section) {
      frame.style.display = 'none';
      return;
    }
    var rect = section.getBoundingClientRect();
    var name = section.getAttribute('data-section') || '';
    frame.style.display = 'block';
    frame.style.top = rect.top + window.scrollY + 'px';
    frame.style.left = rect.left + window.scrollX + 'px';
    frame.style.width = rect.width + 'px';
    frame.style.height = rect.height + 'px';
    frame.querySelector('[data-merfy-name]').textContent = labels[name] || name;
    // У верхнего края страницы подпись — внутри рамки: над рамкой её не видно и «Удалить» не нажать.
    var label = frame.querySelector('[data-merfy-label]');
    label.style.top = rect.top + window.scrollY < label.offsetHeight + 2 ? '0' : '';
  }
  function select(id) {
    selected = id;
    ensureFrame();
    place();
    var block = showBlock();
    var section = id === null ? null : byId(id);
    var target = block || section;
    if (!target) return;
    var rect = target.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) target.scrollIntoView({ block: block ? 'center' : 'start' });
  }
  function showActions() {
    if (!frame) return;
    frame.querySelector('[data-merfy-duplicate]').style.display = actions.duplicate === false ? 'none' : '';
    frame.querySelector('[data-merfy-delete]').style.display = actions.remove === false ? 'none' : '';
  }
  function setCss(id, css) {
    var old = document.querySelector('style[data-merfy-block-css="' + id + '"]');
    if (old) old.parentNode.removeChild(old);
    if (!css) return;
    var style = document.createElement('style');
    style.setAttribute('data-merfy-block-css', id);
    style.textContent = css;
    document.head.appendChild(style);
  }
  function nodeOf(html) {
    var holder = document.createElement('div');
    holder.innerHTML = html;
    return holder.firstElementChild;
  }
  // Правка секции — скрипту превью (часть 5г): событие на узле секции. Отменил — HTML меняет он, ядро сохраняет
  // состояние экземпляра; не отменил или script нет в ответе (сборщик до 5г) — HTML меняет этот скрипт.
  function handOver(node, html, script, codeOnly) {
    if (script === undefined) return false;
    var detail = { html: html, script: script, codeOnly: codeOnly };
    return !node.dispatchEvent(new CustomEvent(UPDATE_EVENT, { bubbles: true, cancelable: true, detail: detail }));
  }
  // Тело запроса блока: экземпляр; меню ревизии и правки настроек темы (часть 4) — если конструктор их прислал.
  function fetchBlock(instance, props) {
    var payload = { instance: instance };
    if (props && Array.isArray(props.menus)) payload.menus = props.menus;
    if (props && props.theme && typeof props.theme === 'object') payload.theme = props.theme;
    var request = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) };
    return fetch(blockUrl, request).then(function (response) {
      if (!response.ok) throw new Error('блок ' + instance.id + ': ответ ' + response.status);
      return response.json();
    });
  }
  // blocks — как в ревизии, со скрытыми (часть 3): только если у экземпляра есть ключ.
  function instanceOf(id, type, props) {
    var instance = { id: id, section: type, settings: (props && props.settings) || {} };
    if (props && Array.isArray(props.blocks)) instance.blocks = props.blocks;
    // Часть 5 блока 1: общие настройки секции — объект, как в ревизии.
    if (props && props.wrapper && typeof props.wrapper === 'object') instance.wrapper = props.wrapper;
    return instance;
  }
  function failed(error) {
    post({ type: 'render-error', message: error.message });
  }
  // Ссылка на страницу своего сайта (часть 4, Р1-4-12): после выбора — navigate, конструктор открывает страницу, как на
  // проде (site-gen, src/services/preview.service.ts: href с «/», не с «//»). Чужая ссылка превью не уводит.
  function navigateTo(target) {
    var link = target && target.closest ? target.closest('a[href]') : null;
    var href = link ? link.getAttribute('href') || '' : '';
    if (href.charAt(0) === '/' && href.charAt(1) !== '/') post({ type: 'navigate', path: href });
  }
  function updateBlock(data) {
    var instance = instanceOf(data.blockId, data.blockType, data.props);
    var ticket = (tickets[instance.id] || 0) + 1;
    tickets[instance.id] = ticket;
    fetchBlock(instance, data.props)
      .then(function (answer) {
        var old = byId(instance.id);
        var fresh = nodeOf(answer.html);
        if (tickets[instance.id] !== ticket || !old || !fresh) return;
        setCss(instance.id, answer.css);
        if (handOver(old, answer.html, answer.script, false)) return;
        old.parentNode.replaceChild(fresh, old);
        place();
        showBlock();
      })
      .catch(failed);
  }
  function containerOf() {
    var first = all()[0];
    return (first && first.parentNode) || document.querySelector('main') || document.body;
  }
  // Место секции по группе (часть 4, Р1-4-11): header — перед <main>, page — в <main>, footer — сразу после <main>;
  // внутри группы — порядок списка; группы нет — page. <main> нет — все в контейнер, как раньше.
  function placeAll(blocks, nodes, container) {
    var main = document.querySelector('main');
    var groups = { header: [], page: [], footer: [] };
    blocks.forEach(function (block) {
      var old = byId(block.id);
      var node = nodes[block.id] || old;
      if (!node) return;
      if (old && old !== node) old.parentNode.removeChild(old);
      var group = block.props && block.props.group;
      groups[group === 'header' || group === 'footer' ? group : 'page'].push(node);
    });
    if (!main) {
      groups.header.concat(groups.page, groups.footer).forEach(function (node) {
        container.appendChild(node);
      });
      return;
    }
    groups.header.forEach(function (node) {
      main.parentNode.insertBefore(node, main);
    });
    groups.page.forEach(function (node) {
      main.appendChild(node);
    });
    groups.footer
      .slice()
      .reverse()
      .forEach(function (node) {
        main.parentNode.insertBefore(node, main.nextSibling);
      });
  }
  function reconcile(data) {
    var blocks = data.blocks || [];
    var wanted = {};
    blocks.forEach(function (block) {
      wanted[block.id] = true;
    });
    all().forEach(function (node) {
      if (!wanted[node.getAttribute('data-section-id')]) node.parentNode.removeChild(node);
    });
    var changed = blocks.filter(function (block) {
      var known = byId(block.id);
      if (known && hashes[block.id] === undefined) hashes[block.id] = block.propsHash;
      return !known || hashes[block.id] !== block.propsHash;
    });
    var container = containerOf();
    Promise.all(
      changed.map(function (block) {
        var ticket = (tickets[block.id] || 0) + 1;
        tickets[block.id] = ticket;
        return fetchBlock(instanceOf(block.id, block.type, block.props), block.props).then(function (answer) {
          if (tickets[block.id] !== ticket) return { id: block.id, node: null };
          hashes[block.id] = block.propsHash;
          setCss(block.id, answer.css);
          return { id: block.id, node: nodeOf(answer.html), html: answer.html, script: answer.script };
        });
      })
    )
      .then(function (fresh) {
        var nodes = {};
        fresh.forEach(function (item) {
          if (item.node) nodes[item.id] = item.node;
        });
        placeAll(blocks, nodes, container);
        // Вставленные узлы — скрипту превью с codeOnly: true: HTML уже новый, ядро запускает код секции (часть 5г).
        fresh.forEach(function (item) {
          if (item.node && item.node.isConnected) handOver(item.node, item.html, item.script, true);
        });
        place();
        showBlock();
        post({ type: 'reconcile-ack', version: data.version, ok: true, applied: changed.length });
      })
      .catch(function (error) {
        var missing = changed.map(function (block) {
          return block.id;
        });
        post({ type: 'reconcile-ack', version: data.version, ok: false, applied: 0, missing: missing });
        failed(error);
      });
  }
  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      if (target && target.closest && target.closest('[data-merfy-duplicate]')) {
        event.preventDefault();
        event.stopPropagation();
        if (selected !== null) post({ type: 'duplicate-block', blockId: selected });
        return;
      }
      if (target && target.closest && target.closest('[data-merfy-delete]')) {
        event.preventDefault();
        event.stopPropagation();
        if (selected !== null) post({ type: 'delete-block', blockId: selected });
        return;
      }
      // Кнопка или поле секции (часть 5г, как в превью пяти тем): нажатие — коду секции, выбора нет; кнопка внутри
      // ссылки — как ссылка.
      var control = target && target.closest ? target.closest(CONTROLS) : null;
      if (control && sectionOf(control) && !control.closest('a[href]')) return;
      // Подпункт (Р60): select-subsection с местом блока среди разных id секции, выбора секции нет. Ссылка внутри
      // подпункта превью не уводит; остальное (раскрыть <details>) работает, как на проде.
      var blockNode = target && target.closest ? target.closest('[data-merfy-block]') : null;
      var parent = blockNode ? sectionOf(blockNode) : null;
      if (blockNode && parent) {
        if (target.closest('a')) event.preventDefault();
        var index = blockIdsOf(parent).indexOf(blockNode.getAttribute('data-merfy-block'));
        post({ type: 'select-subsection', parentId: parent.getAttribute('data-section-id'), index: index, field: null });
        navigateTo(target);
        return;
      }
      var node = sectionOf(target);
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      post({ type: 'select-block', blockId: node.getAttribute('data-section-id') });
      navigateTo(target);
    },
    true
  );
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  // Часть 5г: замена секции закончилась — рамка выбора по новому размеру.
  document.addEventListener(UPDATED_EVENT, function () {
    place();
    showBlock();
  });
  // Сбой скрипта секции (design.md блока 5, 3.7): красная рамка (STYLE) и подпись первым элементом секции, тем же видом,
  // что ошибка рендера в превью. Сбой при снятии (unmount) подписи не даёт: секции уже нет или её меняют.
  document.addEventListener(ERROR_EVENT, function (event) {
    var detail = event.detail || {};
    var section = typeof detail.id === 'string' && detail.stage !== 'unmount' ? byId(detail.id) : null;
    if (!section) return;
    ensureFrame();
    var note = section.firstElementChild;
    if (!note || !note.hasAttribute('data-merfy-script-error')) {
      note = document.createElement('div');
      note.setAttribute('data-merfy-script-error', '');
      section.insertBefore(note, section.firstChild);
    }
    var name = labels[detail.section] || detail.section || '';
    note.textContent = SCRIPT_ERROR + name + '\\u00bb: ' + String(detail.message || '').slice(0, MESSAGE_MAX);
    place();
  });
  // Наведение на секцию — подсветка всех её подпунктов, как на проде (Р59).
  document.addEventListener(
    'mouseover',
    function (event) {
      var section = sectionOf(event.target);
      if (section === hinted) return;
      hinted = section;
      ensureFrame();
      mark('data-merfy-block-hint', section ? Array.prototype.slice.call(section.querySelectorAll('[data-merfy-block]')) : []);
    },
    true
  );
  document.documentElement.addEventListener('mouseleave', function () {
    hinted = null;
    mark('data-merfy-block-hint', []);
  });
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== window.parent || !data || typeof data.type !== 'string') return;
    if (data.type === 'init') initialized = true;
    else if (data.type === 'set-labels') {
      labels = data.componentLabels || {};
      place();
    } else if (data.type === 'set-selection') {
      actions = data.actions || {};
      blockParent = data.subsectionParentId || null;
      blockIndex = typeof data.subsectionIndex === 'number' ? data.subsectionIndex : null;
      select(data.sectionId || null);
      showActions();
    }
    else if (data.type === 'update-block') updateBlock(data);
    else if (data.type === 'reconcile') reconcile(data);
  });
})();`;
