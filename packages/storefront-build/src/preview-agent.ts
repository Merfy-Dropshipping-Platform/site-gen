// Слушатель превью на стенде темы (design.md блока 8, «Правка токенов без перезагрузки»). Конструктор через 500 мс после
// правки шлёт в iframe { type: 'update-tokens', tokens } — правки в форме блока 1. Слушатель зовёт
// POST <адрес превью>/tokens, получает { css, attributes } и подменяет <style id="merfy-tokens"> и атрибуты выборов у
// <html>. Ответы на старые правки отбрасываются: побеждает последняя. Итог — сообщением родителю: tokens-applied или
// tokens-failed. Сообщение без объекта tokens (нынешний автосейв темы шлёт themeSettings) не трогает стенд.
// { type: 'reload-preview' } — тихая перезагрузка стенда: после правки настройки (это содержимое, а не CSS) и по сигналу
// «данные магазина изменились». Скрипт — строкой: страница печатает его как есть, в коде темы сети нет (сторож рендера
// блока 4).
export const PREVIEW_AGENT = `(function () {
  var tokensUrl = new URL('preview/tokens', location.href).href;
  var latest = 0;
  function apply(answer) {
    var style = document.getElementById('merfy-tokens');
    if (style) style.textContent = answer.css;
    Object.keys(answer.attributes).forEach(function (name) {
      document.documentElement.setAttribute(name, answer.attributes[name]);
    });
  }
  function send(tokens) {
    var ticket = ++latest;
    var body = JSON.stringify({ tokens: tokens });
    var request = { method: 'POST', headers: { 'content-type': 'application/json' }, body: body };
    fetch(tokensUrl, request)
      .then(function (response) {
        if (!response.ok) throw new Error('ответ ' + response.status);
        return response.json();
      })
      .then(function (answer) {
        if (ticket !== latest) return;
        apply(answer);
        window.parent.postMessage({ type: 'tokens-applied' }, '*');
      })
      .catch(function (error) {
        console.error('Превью: правки токенов не применились — ' + error.message);
        window.parent.postMessage({ type: 'tokens-failed' }, '*');
      });
  }
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== window.parent || !data) return;
    if (data.type === 'reload-preview') return location.reload();
    if (data.type !== 'update-tokens') return;
    if (typeof data.tokens !== 'object' || data.tokens === null) return;
    send(data.tokens);
  });
})();`;
