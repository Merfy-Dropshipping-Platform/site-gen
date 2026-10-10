// Подставная серверная сборка темы для быстрых тестов рисовальщика. Вход тот же, что у @astrojs/node в режиме
// middleware: handler(req, res, next, locals). Отвечает по таблице адресов, без Astro. Страница магазина берёт данные
// из locals.merfy, стенд (блок 8) — из locals.merfyStand.
const PAGES = new Map([
  ['/', { key: 'merfy', draw: (merfy) => `<h1>${merfy.shop.name}</h1><p>© ${merfy.year}</p>` }],
  ['/theme-stand', { key: 'merfyStand', draw: (stand) => `<h1>${stand.shop.name}</h1><p>${stand.head.title}</p>` }],
  [
    '/broken',
    {
      key: 'merfy',
      draw: () => {
        throw new Error('страница сломалась');
      },
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
  if (locals[page.key] === undefined) return respond(res, 500, `нет Astro.locals.${page.key}`);
  try {
    return respond(res, 200, page.draw(locals[page.key]));
  } catch (error) {
    return respond(res, 500, String(error));
  }
}
