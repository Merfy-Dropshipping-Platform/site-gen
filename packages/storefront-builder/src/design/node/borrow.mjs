// Вкладка, уже открытая захватом (`design-capture.ts`), для чужого инструмента: он подключается к нашему Chromium по
// CDP, а вместо «нового контекста и новой вкладки» получает переходник над нашей вкладкой. Переход и ожидание загрузки
// пустые — страница уже открыта и дождалась загрузки; закрытие контекста и браузера тоже пустое — вкладкой владеет
// захват. Так инструмент не грузит сайт второй раз (своя загрузка и ожидание тишины в сети — 10–25 с на магазине) и не
// держит в памяти ещё одну копию страницы. Вкладка ищется по targetId CDP: в браузере задания могут быть и чужие.

const noop = async () => undefined;

async function targetOf(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { targetInfo } = await session.send('Target.getTargetInfo');
    return targetInfo.targetId;
  } finally {
    await session.detach().catch(() => undefined);
  }
}

export async function findTab(browser, targetId) {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const ids = await Promise.all(pages.map((page) => targetOf(page).catch(() => null)));
  const found = pages[ids.indexOf(targetId)];
  if (found === undefined) throw new Error(`вкладка ${targetId} не найдена`);
  return found;
}

// Ответ «перехода»: инструменты читают из него только статус.
const responseOf = (page, status) => ({
  status: () => status,
  ok: () => status < 400,
  url: () => page.url(),
  headers: () => ({}),
});

// Браузер-переходник: `newContext` → контекст над нашей вкладкой. `browser` — настоящее подключение по CDP.
export function lend(browser, page, status) {
  page.goto = async () => responseOf(page, status);
  page.reload = async () => responseOf(page, status);
  page.waitForLoadState = noop;
  const context = {
    newPage: async () => page,
    pages: () => [page],
    close: noop,
    addInitScript: noop,
    addCookies: noop,
    storageState: () => page.context().storageState(),
  };
  return {
    newContext: async () => context,
    contexts: () => [context],
    browserType: () => browser.browserType(),
    version: () => browser.version(),
    isConnected: () => browser.isConnected(),
    close: noop,
  };
}

// Аргументы скриптов: <адрес страницы> <адрес CDP (http)> <targetId вкладки> <HTTP-статус>.
export function tabArgs(argv) {
  const [url, cdp, targetId, statusText] = argv;
  if (!url || !cdp || !targetId) {
    process.stderr.write('нужны адрес страницы, адрес CDP и targetId вкладки\n');
    process.exit(2);
  }
  return { url, cdp, targetId, status: Number(statusText) || 200 };
}

// Ответ в stdout и выход, только когда stdout дописан: в трубу запись асинхронная, ранний exit обрезал ответ на 64 КБ.
export function answer(value) {
  process.stdout.write(JSON.stringify(value), () => process.exit(0));
}
