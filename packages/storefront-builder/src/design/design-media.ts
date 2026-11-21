// Видео и файлы шрифтов «Дизайну по ссылке» не нужны: стиль и контур — это CSS и DOM, вычисленные font-family видны и
// без файлов. Не грузим их во всём браузере задания — перехват Fetch на уровне браузера (CDP). На стенде 21.11 контур и
// свой стиль allbirds и rhodeskin с пропуском и без совпали. Картинки грузим: без них (отказом и даже заглушкой 1×1)
// скрипты gymshark занимают главный поток повторами загрузки — второй клиент CDP (dembrandt) ждал вкладку дольше 40 с;
// а размеры картинок нужны контуру (роли «hero», «image-text»). Остальные запросы перехват не трогает: фильтр адресов
// (`design-egress.ts`) — тот же.

export const SKIPPED_RESOURCES = ['Media', 'Font'] as const;

export const skipPatterns = (): { urlPattern: string; resourceType: (typeof SKIPPED_RESOURCES)[number] }[] =>
  SKIPPED_RESOURCES.map((resourceType) => ({ urlPattern: '*', resourceType }));

type Paused = { requestId: string };

// То, что нужно от сессии CDP: событие перехвата и две команды Fetch.
export interface FetchSession {
  on(event: 'Fetch.requestPaused', listener: (event: Paused) => void): unknown;
  send(method: 'Fetch.failRequest' | 'Fetch.enable', params: object): Promise<unknown>;
}

// Каждый перехваченный запрос — отказ «заблокировано клиентом»; ошибка отказа (вкладка уже закрыта) не важна.
export function refuseAll(session: FetchSession): void {
  session.on('Fetch.requestPaused', (event: Paused) => {
    void session
      .send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
      .catch(() => undefined);
  });
}

export async function skipMedia(browser: { newBrowserCDPSession(): Promise<FetchSession> }): Promise<void> {
  const session = await browser.newBrowserCDPSession();
  refuseAll(session);
  await session.send('Fetch.enable', { patterns: skipPatterns() });
}
