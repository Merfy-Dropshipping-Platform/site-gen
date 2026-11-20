import {
  BLOCK_DESELECT_EVENT,
  BLOCK_SELECT_EVENT,
  MESSAGE_MAX_LENGTH,
  OVERLAY_HIDE_EVENT,
  OVERLAY_SHOW_EVENT,
  PREVIEW_LIST_EVENT,
  PREVIEW_REPLAY_EVENT,
  PREVIEW_STILL_ATTRIBUTE,
  PREVIEW_STORES_EVENT,
  PREVIEW_UPDATE_EVENT,
  PREVIEW_UPDATED_EVENT,
  SECTION_ERROR_EVENT,
} from '@merfy/shell/preview';
import { OVERLAY_ATTRIBUTE } from '@merfy/shell/roles';

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
// (Р11). set-agent-frame { sectionId, label? } (этап 4 «Живой холст») — рамка Визи #merfy-agent-frame: фиолетовая, с
// подписью «Визи · <label>», без кнопок; выбор мерчанта не трогает, секция за краем окна — прокрутка, как у select();
// sectionId: null — рамки нет. set-check-marks { marks: [{ sectionId, items: [{ title, text? }] }] } (этап 5 «Проверки в
// окне») — янтарный значок с числом находок в правом верхнем углу секции (data-merfy-check-mark, в нём
// data-merfy-check-badge и data-merfy-check-list), клик по значку открывает и закрывает список; marks: [] — метки сняты;
// метки идут за секциями вместе с рамками. Ошибка запроса — render-error. Скрипт — строкой ES5: страница печатает его как есть. Рамка и плашка — как у
// превью нынешних тем (site-gen, src/services/preview.service.ts): рамка 2px #88b0da, плашка #181818, текст #c3c3c3,
// шрифт системный, значок «Удалить» — мусорная корзина.
export const PREVIEW_SECTIONS_AGENT = `(function () {
  var blockUrl = new URL('preview/block', location.href).href;
  // Часть 5г: имена событий — из протокола превью @merfy/shell/preview.
  var UPDATE_EVENT = ${JSON.stringify(PREVIEW_UPDATE_EVENT)};
  var UPDATED_EVENT = ${JSON.stringify(PREVIEW_UPDATED_EVENT)};
  var STORES_EVENT = ${JSON.stringify(PREVIEW_STORES_EVENT)};
  var ERROR_EVENT = ${JSON.stringify(SECTION_ERROR_EVENT)};
  var MESSAGE_MAX = ${MESSAGE_MAX_LENGTH};
  // Часть 6в: события выбора блока для кода секции — тоже из протокола превью.
  var SELECT_EVENT = ${JSON.stringify(BLOCK_SELECT_EVENT)};
  var DESELECT_EVENT = ${JSON.stringify(BLOCK_DESELECT_EVENT)};
  // Блок 11, часть 11а-2: модуль «Каталог» просит список с параметрами — тоже из протокола превью.
  var LIST_EVENT = ${JSON.stringify(PREVIEW_LIST_EVENT)};
  // 01.11: окно выбранной секции поверх страницы — ядру; атрибут окна — у ядра (@merfy/shell/roles).
  var OVERLAY_SHOW_EVENT = ${JSON.stringify(OVERLAY_SHOW_EVENT)};
  var OVERLAY_HIDE_EVENT = ${JSON.stringify(OVERLAY_HIDE_EVENT)};
  var OVERLAY_ATTRIBUTE = ${JSON.stringify(OVERLAY_ATTRIBUTE)};
  // Кнопка «Проиграть анимации» (replay из конструктора): ядру — запустить секцию или все секции заново с анимациями.
  var REPLAY_EVENT = ${JSON.stringify(PREVIEW_REPLAY_EVENT)};
  // Свежий узел на месте прежнего (правка настроек или текста) запускается без анимаций: метка читается ядром при вставке.
  var STILL_ATTRIBUTE = ${JSON.stringify(PREVIEW_STILL_ATTRIBUTE)};
  // Кнопки и поля секции — как в превью пяти тем (src/services/preview.service.ts): нажатие — коду секции, выбора нет.
  var CONTROLS = 'button, input, select, textarea, label[for], [data-action]';
  // Значения сторов расширений вместо ответов сервера (ext-store-values; превью секции в кабинете расширения). Кабинет
  // присылает { extension, store, recordId, value }: store — имя стора из storefront.stores манифеста, функцию (fn) и
  // by: "record" скрипт берёт из конфига страницы (#merfy-config). Запрос стора по записи к функции расширения
  // (POST /store/extensions/<id>/fn/<fn>, тело { recordIds }) по такой записи отвечает присланное значение, а не сервер;
  // остальные записи запроса идут на сервер как есть. Ничего не пишется: подмена живёт, пока открыта рамка.
  var storeValues = {};
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  function configExtensions() {
    var tag = document.getElementById('merfy-config');
    if (!tag) return {};
    try {
      return JSON.parse(tag.textContent || '{}').extensions || {};
    } catch (error) {
      return {};
    }
  }
  function setStoreValues(list) {
    var extensions = configExtensions();
    storeValues = {};
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var extension = item && typeof item.extension === 'string' ? extensions[item.extension] : null;
      var spec = extension && extension.stores && typeof item.store === 'string' ? extension.stores[item.store] : null;
      if (!spec || spec.by !== 'record' || typeof item.recordId !== 'string' || item.recordId === '') return;
      storeValues[item.extension + '/' + spec.fn + '/' + item.recordId] = item.value;
    });
    // Подставленное сменилось: ядро перечитывает сторы, на которые подписаны секции, и они получают новые значения.
    document.dispatchEvent(new CustomEvent(STORES_EVENT));
  }
  function jsonReply(data) {
    return new Response(JSON.stringify({ success: true, data: data }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }
  function storeCall(url) {
    var marker = '/store/extensions/';
    var at = url.indexOf(marker);
    if (at === -1) return null;
    var parts = url.slice(at + marker.length).split('?')[0].split('/');
    if (parts.length !== 3 || parts[1] !== 'fn') return null;
    try {
      return { extension: decodeURIComponent(parts[0]), fn: decodeURIComponent(parts[2]) };
    } catch (error) {
      return null;
    }
  }
  function withStoreValues(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var call = Object.keys(storeValues).length === 0 || !init || typeof init.body !== 'string' ? null : storeCall(url);
    var body = null;
    if (call) {
      try {
        body = JSON.parse(init.body);
      } catch (error) {
        body = null;
      }
    }
    var ids = body && Array.isArray(body.recordIds) ? body.recordIds : null;
    if (!call || !ids) return realFetch(input, init);
    var mine = {};
    var rest = [];
    ids.forEach(function (id) {
      var key = call.extension + '/' + call.fn + '/' + id;
      if (Object.prototype.hasOwnProperty.call(storeValues, key)) mine[id] = storeValues[key];
      else rest.push(id);
    });
    if (Object.keys(mine).length === 0) return realFetch(input, init);
    if (rest.length === 0) return Promise.resolve(jsonReply(mine));
    var next = Object.assign({}, init, { body: JSON.stringify(Object.assign({}, body, { recordIds: rest })) });
    return realFetch(input, next)
      .then(function (response) {
        return response.json();
      })
      .then(function (answer) {
        var data = answer && answer.data && typeof answer.data === 'object' ? answer.data : {};
        return jsonReply(Object.assign({}, data, mine));
      })
      .catch(function () {
        return jsonReply(mine);
      });
  }
  if (realFetch) window.fetch = withStoreValues;
  // «Ошибка в скрипте секции «» — escape-последовательностями, как подсказки кнопок рамки.
  var SCRIPT_ERROR = '\\u041e\\u0448\\u0438\\u0431\\u043a\\u0430 \\u0432 \\u0441\\u043a\\u0440\\u0438\\u043f\\u0442\\u0435 \\u0441\\u0435\\u043a\\u0446\\u0438\\u0438 \\u00ab';
  // Рамка окна лежит в его слое (frameBox): фон, отступы и размеры, которые слой даёт корню окна, рамке не нужны.
  var STYLE = '#merfy-selection{position:absolute;display:none;pointer-events:none;box-sizing:border-box;margin:0;padding:0;max-width:none;background:none;border:2px solid #88b0da;z-index:2147483646}'
    + '#merfy-selection [data-merfy-label]{position:absolute;left:-2px;top:-26px;display:flex;align-items:center;gap:8px;height:24px;padding:0 8px;border-radius:8px 8px 0 0;background:#181818;color:#c3c3c3;font:500 12px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;white-space:nowrap}'
    + '#merfy-selection [data-merfy-delete],#merfy-selection [data-merfy-duplicate]{display:flex;align-items:center;gap:4px;border:0;padding:0;background:none;color:inherit;font:inherit;cursor:pointer}'
    // Рамка Визи (этап 4): фиолетовая #5b45e0 — акцент прототипа; z-index на единицу ниже рамки выбора, подпись без кнопок.
    + '#merfy-agent-frame{position:absolute;display:none;pointer-events:none;box-sizing:border-box;margin:0;padding:0;max-width:none;background:none;border:2px solid #5b45e0;z-index:2147483645}'
    + '#merfy-agent-frame [data-merfy-agent-label]{position:absolute;left:-2px;top:-26px;display:flex;align-items:center;height:24px;padding:0 8px;border-radius:8px 8px 0 0;background:#5b45e0;color:#fff;font:500 12px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap}'
    // Метка проверок (этап 5): слой на всю секцию без перехвата кликов, в нём янтарный значок с числом находок в правом
    // верхнем углу и список находок под ним; список виден, пока у слоя стоит data-merfy-check-open. Ниже рамок Визи.
    // pointer-events:none !important — слой окна поверх страницы отдаёт кликы всем своим потомкам (> *), а слой метки на
    // всю секцию не должен их перехватывать.
    + '[data-merfy-check-mark]{position:absolute;display:none;pointer-events:none !important;box-sizing:border-box;margin:0;padding:0;max-width:none;background:none;border:0;z-index:2147483644}'
    + '[data-merfy-check-badge]{position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:24px;height:24px;margin:0;padding:0 6px;border:0;border-radius:12px;background:#f59e0b;color:#1f1300;font:600 12px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,.3)}'
    + '[data-merfy-check-list]{position:absolute;top:40px;right:8px;box-sizing:border-box;width:280px;max-width:calc(100% - 16px);margin:0;padding:4px 0;border-radius:8px;background:#181818;color:#c3c3c3;font:400 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:left;pointer-events:auto;box-shadow:0 4px 16px rgba(0,0,0,.35)}'
    + '[data-merfy-check-mark]:not([data-merfy-check-open]) [data-merfy-check-list]{display:none}'
    + '[data-merfy-check-item]{margin:0;padding:8px 12px;border-top:1px solid #3a3a3a}'
    + '[data-merfy-check-item]:first-child{border-top:0}'
    + '[data-merfy-check-title]{margin:0;padding:0;color:#fff;font-weight:600}'
    + '[data-merfy-check-text]{margin:4px 0 0;padding:0;white-space:pre-wrap}'
    + '[data-merfy-block][data-merfy-block-hint]{outline:2px solid #cfdff0 !important;outline-offset:2px}'
    + '[data-merfy-block][data-merfy-block-selected]{outline:2px solid #88b0da !important;outline-offset:2px}'
    + 'merfy-section[data-merfy-state="failed"]{outline:2px solid #dc2626 !important;outline-offset:-2px}'
    + '[data-merfy-script-error]{border:2px solid #dc2626;padding:16px;color:#dc2626;font:14px/1.4 system-ui,sans-serif}'
    // Часть 6: подсказка пустого редактируемого элемента — как на проде (цвет самого элемента, не --color-muted).
    + '[data-merfy-edit]:empty:before,[data-merfy-edit-html]:empty:before{content:attr(data-merfy-placeholder);color:currentColor;opacity:.45;pointer-events:none}';
  var DELETE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  // «Скопировать» — значок подписи превью пяти тем (src/services/preview.service.ts, строки 2107–2109), 16 px.
  var COPY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var labels = {};
  // Какие кнопки показать на подписи (set-selection.actions, п. 24): duplicate: false — без «Скопировать»,
  // remove: false — без «Удалить»; флагов нет — обе.
  var actions = {};
  var selected = null;
  var frame = null;
  // Рамка Визи (set-agent-frame): секция, где работает Визи, и подпись; своя, выбор мерчанта не трогает. revealed —
  // прокрутка к цели уже была (секции ещё могло не быть на странице: прокрутим, когда она встанет).
  var agentTarget = null;
  var agentFrame = null;
  var revealed = true;
  // «Визи · » — escape-последовательности, как подсказки кнопок: страница превью может быть не в UTF-8.
  var AGENT_PREFIX = '\\u0412\\u0438\\u0437\\u0438';
  var AGENT_SEPARATOR = ' \\u00b7 ';
  // Метки проверок (set-check-marks, этап 5): id секции → { items: [{ title, text? }], open, node }; node — слой метки,
  // он создаётся при первом показе и живёт, пока секция в списке. «Находки проверок: » — подсказка значка.
  var checkMarks = Object.create(null);
  var CHECK_BADGE_TITLE = '\\u041d\\u0430\\u0445\\u043e\\u0434\\u043a\\u0438 \\u043f\\u0440\\u043e\\u0432\\u0435\\u0440\\u043e\\u043a: ';
  // Подпункты (часть 3, Р59, Р60): выбранный — секция и место среди разных data-merfy-block секции; секция под курсором.
  var blockParent = null;
  var blockIndex = null;
  var hinted = null;
  var initialized = false;
  var readySent = 0;
  var tickets = {};
  var hashes = {};
  // Тип и props блоков из reconcile и update-block (блок 11): по ним блок запрашивается заново с параметрами списка.
  var known = {};
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
  // Выбор блока для кода секции (блок 6, часть 6в; В6-1 А): событие на первом узле блока с { blockId }. Другой блок или
  // снятие выбора — сначала «выбор снят» прежнему; тот же блок — ничего. again — после замены секции: её новый
  // экземпляр получает «выбран блок» ещё раз.
  var announced = null;
  function sendBlock(name, sectionId, id) {
    var section = byId(sectionId);
    var target = section ? blockNodesOf(section, id)[0] || section : null;
    if (target) target.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { blockId: id } }));
  }
  function announce(again) {
    var section = blockParent === null ? null : byId(blockParent);
    var id = section && blockIndex !== null ? blockIdsOf(section)[blockIndex] : undefined;
    var next = id === undefined ? null : { section: blockParent, block: id };
    var same = announced !== null && next !== null && announced.section === next.section && announced.block === next.block;
    if (same && !again) return;
    if (announced !== null && !same) sendBlock(DESELECT_EVENT, announced.section, announced.block);
    announced = next;
    if (next !== null) sendBlock(SELECT_EVENT, next.section, next.block);
  }
  // Стили скрипта — один раз: их нужны обе рамки, выбора и Визи.
  var styled = false;
  function ensureStyle() {
    if (styled) return;
    styled = true;
    var style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  function ensureFrame() {
    if (frame) return frame;
    ensureStyle();
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
  // Обе рамки — рамка выбора и рамка Визи — и метки проверок пересчитываются вместе: на scroll, resize, после замены
  // секции.
  function place() {
    placeSelection();
    placeAgent();
    placeMarks();
  }
  // Слой и положение элемента по секции: слой и координаты — frameBox; узел переезжает в слой секции, если её заменили.
  function layBox(element, section) {
    var box = frameBox(section);
    if (element.parentNode !== box.layer) box.layer.appendChild(element);
    element.style.display = 'block';
    element.style.top = box.top + 'px';
    element.style.left = box.left + 'px';
    element.style.width = box.width + 'px';
    element.style.height = box.height + 'px';
    return box;
  }
  // Рамка вокруг секции: слой и координаты — layBox. У верхнего края страницы (или слоя окна) подпись — внутри
  // рамки: над рамкой её не видно и «Удалить» не нажать. Подпись — первый потомок рамки.
  function layFrame(element, section) {
    var box = layBox(element, section);
    var label = element.firstElementChild;
    label.style.top = box.top < label.offsetHeight + 2 ? '0' : '';
  }
  function placeSelection() {
    if (!frame) return;
    var section = selected === null ? null : byId(selected);
    if (!section) {
      frame.style.display = 'none';
      return;
    }
    var name = section.getAttribute('data-section') || '';
    frame.querySelector('[data-merfy-name]').textContent = labels[name] || name;
    layFrame(frame, section);
  }
  // Рамка Визи: подпись «Визи · <label>» (label не прислали — название секции, нет и его — просто «Визи»).
  function placeAgent() {
    if (!agentFrame) return;
    var section = agentTarget === null ? null : byId(agentTarget.id);
    if (!section) {
      agentFrame.style.display = 'none';
      return;
    }
    var name = section.getAttribute('data-section') || '';
    var text = agentTarget.label || labels[name] || name;
    agentFrame.firstElementChild.textContent = text ? AGENT_PREFIX + AGENT_SEPARATOR + text : AGENT_PREFIX;
    layFrame(agentFrame, section);
    if (!revealed) {
      revealed = true;
      reveal(section, 'start');
    }
  }
  function ensureAgentFrame() {
    if (agentFrame) return agentFrame;
    ensureStyle();
    agentFrame = document.createElement('div');
    agentFrame.id = 'merfy-agent-frame';
    agentFrame.innerHTML = '<div data-merfy-agent-label></div>';
    document.body.appendChild(agentFrame);
    return agentFrame;
  }
  // Секция (блок) за краем окна — прокрутка к ней; на виду — страница стоит.
  function reveal(target, align) {
    var rect = target.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) target.scrollIntoView({ block: align });
  }
  // set-agent-frame { sectionId, label? }: рамка Визи на секции; null или пусто — рамки нет. Выбор мерчанта и панель
  // не трогает; прокрутка — по правилу select().
  function setAgentFrame(data) {
    var id = typeof data.sectionId === 'string' && data.sectionId !== '' ? data.sectionId : null;
    agentTarget = id === null ? null : { id: id, label: typeof data.label === 'string' ? data.label : '' };
    revealed = id === null;
    if (id !== null) ensureAgentFrame();
    placeAgent();
  }
  // Метки проверок (этап 5). Находка — { title, text? } со строковым непустым title; кривая находка выпадает, секция
  // без находок и без id — тоже. Тексты находок — только textContent: HTML из них в страницу не попадает.
  function itemOf(raw) {
    var valid = raw && typeof raw.title === 'string' && raw.title !== '';
    return valid ? { title: raw.title, text: typeof raw.text === 'string' ? raw.text : '' } : null;
  }
  function markOf(raw) {
    var id = raw && typeof raw.sectionId === 'string' ? raw.sectionId : '';
    var items = id !== '' && Array.isArray(raw.items) ? raw.items.map(itemOf).filter(Boolean) : [];
    return items.length > 0 ? { id: id, items: items } : null;
  }
  function itemNode(item) {
    var node = document.createElement('div');
    node.setAttribute('data-merfy-check-item', '');
    var title = document.createElement('div');
    title.setAttribute('data-merfy-check-title', '');
    title.textContent = item.title;
    node.appendChild(title);
    if (item.text === '') return node;
    var text = document.createElement('div');
    text.setAttribute('data-merfy-check-text', '');
    text.textContent = item.text;
    node.appendChild(text);
    return node;
  }
  // Открыт ли список — атрибут слоя (стили показывают список только с ним) и aria-expanded значка.
  function showOpen(entry) {
    if (entry.open) entry.node.setAttribute('data-merfy-check-open', '');
    else entry.node.removeAttribute('data-merfy-check-open');
    entry.node.querySelector('[data-merfy-check-badge]').setAttribute('aria-expanded', entry.open ? 'true' : 'false');
  }
  // Слой метки: значок с числом находок и список; пересобирается при каждом set-check-marks (находки могли смениться).
  function fillMark(id) {
    var entry = checkMarks[id];
    if (!entry.node) {
      entry.node = document.createElement('div');
      entry.node.setAttribute('data-merfy-check-mark', id);
    }
    entry.node.textContent = '';
    var badge = document.createElement('button');
    badge.type = 'button';
    badge.setAttribute('data-merfy-check-badge', '');
    badge.setAttribute('title', CHECK_BADGE_TITLE + entry.items.length);
    badge.setAttribute('aria-label', CHECK_BADGE_TITLE + entry.items.length);
    badge.textContent = String(entry.items.length);
    var list = document.createElement('div');
    list.setAttribute('data-merfy-check-list', '');
    entry.items.forEach(function (item) {
      list.appendChild(itemNode(item));
    });
    entry.node.appendChild(badge);
    entry.node.appendChild(list);
    showOpen(entry);
  }
  function placeMarks() {
    var sections = {};
    all().forEach(function (node) {
      sections[node.getAttribute('data-section-id')] = node;
    });
    Object.keys(checkMarks).forEach(function (id) {
      var section = Object.prototype.hasOwnProperty.call(sections, id) ? sections[id] : null;
      if (section) layBox(checkMarks[id].node, section);
      else checkMarks[id].node.style.display = 'none';
    });
  }
  // set-check-marks { marks: [{ sectionId, items: [{ title, text? }] }] }: метки на секциях; marks: [] — снять все.
  // Секция, что остаётся с меткой, сохраняет открытость списка. Не массив — сообщение пропускается.
  function setCheckMarks(data) {
    if (!Array.isArray(data.marks)) return;
    var next = Object.create(null);
    data.marks.map(markOf).filter(Boolean).forEach(function (mark) {
      var old = checkMarks[mark.id];
      next[mark.id] = { items: mark.items, open: old ? old.open : false, node: old ? old.node : null };
    });
    Object.keys(checkMarks).forEach(function (id) {
      if (!next[id] && checkMarks[id].node.parentNode) checkMarks[id].node.parentNode.removeChild(checkMarks[id].node);
    });
    checkMarks = next;
    if (Object.keys(next).length > 0) ensureStyle();
    Object.keys(next).forEach(fillMark);
    place();
  }
  // Клик внутри слоя метки: значок открывает и закрывает список; остальное (текст находки) просто не выбирает секцию.
  // Возвращает true, если клик пришёлся на метку.
  function markClick(target) {
    var node = target.closest('[data-merfy-check-mark]');
    var entry = node ? checkMarks[node.getAttribute('data-merfy-check-mark')] : null;
    if (entry && target.closest('[data-merfy-check-badge]')) {
      entry.open = !entry.open;
      showOpen(entry);
    }
    return node !== null;
  }
  // Что обводит рамка и в каком слое она лежит. Секция страницы — сама секция, рамка в body по координатам документа.
  // Окно поверх страницы (01.11) — корень шаблона: <merfy-section> окна — прозрачный слой на весь экран в верхнем слое
  // страницы, и рамка в body была бы вокруг экрана и под окном и подложкой. Поэтому рамка окна — внутри его слоя, по
  // координатам раскладки корня (offset*): с ними рамку масштабирует та же анимация, что и окно.
  function frameBox(section) {
    var root = section.hasAttribute(OVERLAY_ATTRIBUTE) ? section.firstElementChild : null;
    if (root && root !== frame && root !== agentFrame && !root.hasAttribute('data-merfy-check-mark')) {
      return { layer: section, top: root.offsetTop, left: root.offsetLeft, width: root.offsetWidth, height: root.offsetHeight };
    }
    var rect = section.getBoundingClientRect();
    return {
      layer: document.body,
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    };
  }
  // Окно поверх страницы (01.11): выбранная секция с data-overlay — ядру «открыть окно», чтобы мерчант видел и правил
  // его; прежняя — «закрыть». Повтор для той же секции (после замены) ядро открывает заново или оставляет открытым.
  var overlayShown = null;
  function showOverlay() {
    var node = selected === null ? null : byId(selected);
    var next = node && node.hasAttribute(OVERLAY_ATTRIBUTE) ? node : null;
    if (overlayShown && overlayShown !== next && overlayShown.isConnected) overlayShown.dispatchEvent(new Event(OVERLAY_HIDE_EVENT));
    overlayShown = next;
    if (next) next.dispatchEvent(new Event(OVERLAY_SHOW_EVENT));
  }
  function select(id) {
    selected = id;
    showOverlay();
    ensureFrame();
    place();
    var block = showBlock();
    var section = id === null ? null : byId(id);
    var target = block || section;
    if (target) reveal(target, block ? 'center' : 'start');
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
  // revision — ревизия кода секции целиком (шаблон, section.json, скрипт) из ответа блока: по ней ядро отличает правку
  // кода от правки настроек и текста; старый ответ её не отдаёт.
  function handOver(node, html, script, codeOnly, revision) {
    if (script === undefined) return false;
    var detail = { html: html, script: script, codeOnly: codeOnly };
    if (typeof revision === 'string') detail.revision = revision;
    return !node.dispatchEvent(new CustomEvent(UPDATE_EVENT, { bubbles: true, cancelable: true, detail: detail }));
  }
  // Тело запроса блока: экземпляр; меню ревизии и правки настроек темы (часть 4) — если конструктор их прислал.
  // list (блок 11, часть 11а-2) — параметры списка из события модуля «Каталог»; нет — без ключа.
  function fetchBlock(instance, props, list) {
    var payload = { instance: instance };
    if (typeof list === 'string') payload.list = list;
    if (props && Array.isArray(props.menus)) payload.menus = props.menus;
    if (props && props.theme && typeof props.theme === 'object') payload.theme = props.theme;
    // Часть 8г-2 блока 8: страница и запись из адреса превью (?page=…&record=…) — те же, что у всей страницы превью.
    var query = new URLSearchParams(location.search);
    var pageId = query.get('page');
    var recordId = query.get('record');
    if (pageId) payload.page = pageId;
    if (recordId) payload.record = recordId;
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
    known[instance.id] = { type: data.blockType, props: data.props };
    var ticket = (tickets[instance.id] || 0) + 1;
    tickets[instance.id] = ticket;
    fetchBlock(instance, data.props)
      .then(function (answer) {
        var old = byId(instance.id);
        var fresh = nodeOf(answer.html);
        if (tickets[instance.id] !== ticket || !old || !fresh) return;
        // Часть 6: пока курсор в редактируемом элементе секции, ответ ждёт (holdWhileEditing).
        if (holdWhileEditing(instance.id, answer)) return;
        setCss(instance.id, answer.css);
        if (handOver(old, answer.html, answer.script, false, answer.revision)) return;
        old.parentNode.replaceChild(fresh, old);
        if (instance.id === selected) showOverlay();
        place();
        showBlock();
      })
      .catch(failed);
  }
  function containerOf() {
    var first = all()[0];
    return (first && first.parentNode) || document.querySelector('main') || document.body;
  }
  // Ориентир шапки или подвала рядом с <main> (семантика 18.11, как pageLocals в head.ts): <header> прямо перед ним,
  // <footer> прямо после; нет — создаётся.
  function landmarkOf(main, tag) {
    var near = tag === 'header' ? main.previousElementSibling : main.nextElementSibling;
    if (near && near.tagName === tag.toUpperCase()) return near;
    var made = document.createElement(tag);
    main.parentNode.insertBefore(made, tag === 'header' ? main : main.nextSibling);
    return made;
  }
  function fillLandmark(main, tag, list) {
    var box = landmarkOf(main, tag);
    list.forEach(function (node) {
      box.appendChild(node);
    });
    if (!box.firstElementChild) box.parentNode.removeChild(box);
  }
  // Место секции по группе (часть 4, Р1-4-11): header — в <header> перед <main>, page — в <main>, footer — в <footer>
  // сразу после <main>, overlay — в конец <body>; внутри группы — порядок списка; группы нет — page. <main> нет — все в
  // контейнер, как раньше.
  function placeAll(blocks, nodes, container) {
    var main = document.querySelector('main');
    var groups = { header: [], page: [], footer: [], overlay: [] };
    blocks.forEach(function (block) {
      var old = byId(block.id);
      var node = nodes[block.id] || old;
      if (!node) return;
      if (old && old !== node) old.parentNode.removeChild(old);
      var group = block.props && block.props.group;
      groups[group === 'header' || group === 'footer' || group === 'overlay' ? group : 'page'].push(node);
    });
    if (!main) {
      groups.header.concat(groups.page, groups.footer, groups.overlay).forEach(function (node) {
        container.appendChild(node);
      });
      return;
    }
    fillLandmark(main, 'header', groups.header);
    groups.page.forEach(function (node) {
      main.appendChild(node);
    });
    fillLandmark(main, 'footer', groups.footer);
    // Секции поверх страницы (блок 12, 12.2) — после подвала, в конец <body>.
    groups.overlay.forEach(function (node) {
      document.body.appendChild(node);
    });
  }
  function reconcile(data) {
    var blocks = data.blocks || [];
    var wanted = {};
    blocks.forEach(function (block) {
      wanted[block.id] = true;
      known[block.id] = { type: block.type, props: block.props };
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
          return { id: block.id, node: nodeOf(answer.html), html: answer.html, script: answer.script, revision: answer.revision };
        });
      })
    )
      .then(function (fresh) {
        var nodes = {};
        fresh.forEach(function (item) {
          if (!item.node) return;
          nodes[item.id] = item.node;
          // Узел встаёт на место прежнего — правка настроек или текста: ядро запускает его без анимаций. Новая секция
          // (прежнего узла нет) играет. Сменится код — замена экземпляра скриптом превью перезапустит его с анимациями.
          if (byId(item.id)) item.node.setAttribute(STILL_ATTRIBUTE, '');
        });
        placeAll(blocks, nodes, container);
        // Вставленные узлы — скрипту превью с codeOnly: true: HTML уже новый, ядро запускает код секции (часть 5г).
        fresh.forEach(function (item) {
          if (item.node && item.node.isConnected) handOver(item.node, item.html, item.script, true, item.revision);
        });
        // Секции ядро уже запустило при вставке (mount выполнен), метка запуска без анимаций больше не нужна.
        fresh.forEach(function (item) {
          if (item.node) item.node.removeAttribute(STILL_ATTRIBUTE);
        });
        showOverlay();
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
      // Метка проверок (этап 5): значок и список — своё дело метки; секцию клик по ним не выбирает и коду секции не уходит.
      if (target && target.closest && markClick(target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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
      // Листание списка секции (блок 11, 11.9): клик по «Показать ещё»/«Показать предыдущие» — коду секции: поведение
      // catalog само отменяет переход и шлёт merfy:preview:list. Не отдать — клик не дойдёт, список в превью не листается.
      if (target && target.closest && target.closest('[data-part="next"],[data-part="prev"]')) return;
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
  // Правка текста в превью (часть 6 блока 1, design.md 3.18), как у пяти тем: элемент с data-merfy-edit (string, text) или
  // data-merfy-edit-html (richtext) — contenteditable, правка начинается с первого клика. Enter и Esc не обрабатываются.
  // Когда курсор ушёл с элемента и значение изменилось, в конструктор уходит edit-field: string и text — textContent без
  // пробелов по краям, richtext — innerHTML; field — путь к настройке из атрибута («<id>» или «blocks/<id блока>/<id>»).
  // Пока курсор в элементе секции, ответ update-block по ней ждёт: ушёл без правки — ответ применяется, с правкой —
  // отбрасывается (конструктор запишет правку, и PreviewFrame пришлёт новый update-block со всеми данными секции).
  var EDIT_SELECTOR = '[data-merfy-edit],[data-merfy-edit-html]';
  var editing = null;
  var held = {};
  function editableOf(target) {
    return target && target.closest ? target.closest(EDIT_SELECTOR) : null;
  }
  function editValueOf(node) {
    return node.hasAttribute('data-merfy-edit-html') ? node.innerHTML : (node.textContent || '').trim();
  }
  function applyEditable() {
    Array.prototype.forEach.call(document.querySelectorAll(EDIT_SELECTOR), function (node) {
      if (node.getAttribute('contenteditable') !== 'true') node.setAttribute('contenteditable', 'true');
    });
  }
  function isEditingIn(id) {
    var section = editing === null ? null : sectionOf(editing.node);
    return section !== null && section.getAttribute('data-section-id') === id;
  }
  function holdWhileEditing(id, answer) {
    if (!isEditingIn(id)) return false;
    held[id] = answer;
    return true;
  }
  function releaseHeld() {
    Object.keys(held).forEach(function (id) {
      if (isEditingIn(id)) return;
      var answer = held[id];
      delete held[id];
      var old = byId(id);
      var fresh = old ? nodeOf(answer.html) : null;
      if (!old || !fresh) return;
      setCss(id, answer.css);
      if (handOver(old, answer.html, answer.script, false, answer.revision)) return;
      old.parentNode.replaceChild(fresh, old);
      place();
      showBlock();
    });
  }
  applyEditable();
  if (document.body) {
    new MutationObserver(function () {
      applyEditable();
    }).observe(document.body, { childList: true, subtree: true });
  }
  document.addEventListener(
    'focusin',
    function (event) {
      var node = editableOf(event.target);
      editing = node ? { node: node, before: editValueOf(node) } : null;
    },
    true
  );
  document.addEventListener(
    'focusout',
    function (event) {
      var node = editableOf(event.target);
      if (!node || editing === null || editing.node !== node) return;
      var before = editing.before;
      var section = sectionOf(node);
      var id = section ? section.getAttribute('data-section-id') : null;
      var value = editValueOf(node);
      editing = null;
      if (id !== null && value !== before) {
        delete held[id];
        post({
          type: 'edit-field',
          blockId: id,
          field: node.getAttribute('data-merfy-edit-html') || node.getAttribute('data-merfy-edit'),
          value: value
        });
      }
      setTimeout(releaseHeld, 0);
    },
    true
  );
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  // Часть 5г: замена секции закончилась — рамка выбора по новому размеру.
  document.addEventListener(UPDATED_EVENT, function (event) {
    place();
    showBlock();
    // Часть 6в: заменили секцию с выбранным блоком — новый экземпляр получает «выбран блок».
    var detail = event.detail || {};
    if (announced !== null && detail.id === announced.section) announce(true);
    // 01.11: заменили выбранное окно поверх страницы — новый экземпляр открывает его снова.
    if (detail.id === selected) showOverlay();
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
  // Список с параметрами (блок 11 «Секций и SDK», часть 11а-2, Р11а-20): модуль «Каталог» шлёт событие на узле внутри
  // своей секции. Блок известен — событие отменяется, блок запрашивается с list; ответ на старый запрос отбрасывается,
  // как у update-block; стили блока — сразу, HTML секции — модулю в detail.reply (вставляет он сам).
  document.addEventListener(LIST_EVENT, function (event) {
    var node = event.target && event.target.closest ? event.target.closest('merfy-section[data-section-id]') : null;
    var id = node ? node.getAttribute('data-section-id') : null;
    var block = id ? known[id] : null;
    var detail = event.detail;
    if (!block || !detail || typeof detail.list !== 'string' || typeof detail.reply !== 'function') return;
    event.preventDefault();
    var ticket = (tickets[id] || 0) + 1;
    tickets[id] = ticket;
    fetchBlock(instanceOf(id, block.type, block.props), block.props, detail.list)
      .then(function (answer) {
        if (tickets[id] !== ticket || !byId(id) || !nodeOf(answer.html)) return;
        setCss(id, answer.css);
        detail.reply(answer.html);
      })
      .catch(failed);
  });
  // replay: sectionId — строка: проиграть только эту секцию (за краем окна — сначала показать, иначе появления ждут входа
  // в экран и ничего не видно); нет — страницу целиком. Событие на секции или на document — ядро решает по цели.
  function replay(data) {
    var single = typeof data.sectionId === 'string' && data.sectionId !== '';
    var node = single ? byId(data.sectionId) : null;
    if (single && !node) return;
    if (node) {
      var rect = node.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) node.scrollIntoView({ block: 'start' });
    }
    (node || document).dispatchEvent(new Event(REPLAY_EVENT, { bubbles: true }));
  }
  function setSelection(data) {
    actions = data.actions || {};
    blockParent = data.subsectionParentId || null;
    blockIndex = typeof data.subsectionIndex === 'number' ? data.subsectionIndex : null;
    select(data.sectionId || null);
    showActions();
    announce(false);
  }
  // Сообщения конструктора по типу; незнакомый тип (в том числе от нового конструктора к старому скрипту) молча
  // пропускается.
  var MESSAGES = {
    'init': function () {
      initialized = true;
    },
    'set-labels': function (data) {
      labels = data.componentLabels || {};
      place();
    },
    'set-selection': setSelection,
    'set-agent-frame': setAgentFrame,
    'set-check-marks': setCheckMarks,
    'ext-store-values': function (data) {
      setStoreValues(data.values);
    },
    'update-block': updateBlock,
    'reconcile': reconcile,
    'replay': replay
  };
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== window.parent || !data || typeof data.type !== 'string') return;
    if (Object.prototype.hasOwnProperty.call(MESSAGES, data.type)) MESSAGES[data.type](data);
  });
})();`;
