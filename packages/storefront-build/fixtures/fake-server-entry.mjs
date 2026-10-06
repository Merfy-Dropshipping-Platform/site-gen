// Подставная серверная сборка темы для быстрых тестов рисовальщика. Вход тот же, что у @astrojs/node в режиме
// middleware: handler(req, res, next, locals). Отвечает по таблице адресов, без Astro.
const PAGES = new Map([
  ['/', (merfy) => `<h1>${merfy.shop.name}</h1><p>© ${merfy.year}</p>`],
  [
    '/broken',
    () => {
      throw new Error('страница сломалась');
    },
  ],
]);

function respond(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

export function handler(req, res, next, locals) {
  const page = PAGES.get(new URL(req.url, 'http://renderer').pathname);
  if (page === undefined) return respond(res, 404, 'нет страницы');
  if (locals.merfy === undefined) return respond(res, 500, 'нет Astro.locals.merfy');
  try {
    return respond(res, 200, page(locals.merfy));
  } catch (error) {
    return respond(res, 500, String(error));
  }
}
