/**
 * @jest-environment jsdom
 *
 * requests-mine (T014) — поведенческие тесты «Моих заявок»: захват mine-токена
 * из ?token= (localStorage + чистка URL), пустое состояние без токена (БЕЗ
 * редиректа на логин), список и карточка на моках fetch (проверяется заголовок
 * Authorization: Bearer), ответ покупателя POST-ом, 404/ошибка.
 */
import {
  REQUESTS_MINE_TOKEN_KEY,
  captureRequestsMineToken,
  getRequestsMineToken,
  requestMineRowHTML,
  requestMineCardHTML,
  initRequestsMineList,
  initRequestsMineDetail,
  type RequestMineDetail,
  type RequestMineListItem,
} from '../runtime/requests-mine';

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function mountListPage(): void {
  document.body.innerHTML =
    '<div class="account-page-container">' +
    '<div id="requests-loading">Загрузка...</div>' +
    '<div id="requests-empty" class="hidden">Здесь появятся ваши заявки — ссылки приходят на почту</div>' +
    '<div id="requests-list" class="hidden"></div>' +
    '</div>';
}

function mountDetailPage(): void {
  document.body.innerHTML =
    '<div class="account-page-container">' +
    '<span class="account-subtitle" id="request-subtitle"></span>' +
    '<div id="request-loading">Загрузка...</div>' +
    '<div id="request-not-found" class="hidden">Заявка не найдена.</div>' +
    '<div id="request-content" class="hidden" style="display: grid; gap: 1.5rem;"></div>' +
    '</div>';
}

const LIST: RequestMineListItem[] = [
  { id: 2083, number: 2083, status: 'new', productName: 'Фотокнига «Наша история»', createdAt: '2026-10-03T12:40:00Z' },
  { id: 2081, number: 2081, status: 'closed', statusReason: 'Не договорились', productName: 'Медальон с фото', createdAt: '2026-09-28T16:30:00Z' },
];

const DETAIL: RequestMineDetail = {
  id: 2083,
  number: 2083,
  status: 'disc',
  productName: 'Фотокнига «Наша история»',
  createdAt: '2026-10-03T12:40:00Z',
  canReply: true,
  fields: [
    { label: 'Формат', value: '30 × 30 см' },
    { label: 'Обложка', value: 'Ткань' },
    { label: 'Надпись', value: '' },
    { label: 'Фото для книги', type: 'photo', files: [{ url: '/f1.jpg', name: 'IMG_1.jpg' }, { url: '/f2.jpg', name: 'IMG_2.jpg' }] },
    { label: 'Чертёж', type: 'file', files: [{ name: 'план.pdf', size: '84 КБ' }] },
  ],
  offer: { amountCents: 560000, term: '12 рабочих дней', validUntil: '10 октября' },
  messages: [
    { author: 'system', text: 'Заявка отправлена с сайта', at: '12:40' },
    { author: 'shop', text: 'Анна, здравствуйте! Лён — плюс 400 ₽.', at: '14:40' },
    { author: 'customer', text: 'Да, лён.', at: '15:05' },
  ],
};

function mockFetchOk(routes: Record<string, unknown>): jest.Mock {
  const fn = jest.fn((url: string) => {
    for (const key of Object.keys(routes)) {
      if (url.indexOf(key) >= 0) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(routes[key]),
        } as Response);
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response);
  });
  (window as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/account/requests');
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gw/api' };
});

afterEach(() => {
  delete (window as any).fetch;
  delete (window as any).__MERFY_CONFIG__;
});

describe('requests-mine токен (T014)', () => {
  it('requests-mine: ?token= сохраняется в localStorage и возвращается', () => {
    const t = captureRequestsMineToken('?id=1&token=abc.def');
    expect(t).toBe('abc.def');
    expect(localStorage.getItem(REQUESTS_MINE_TOKEN_KEY)).toBe('abc.def');
    expect(getRequestsMineToken()).toBe('abc.def');
  });

  it('requests-mine: без token параметра ничего не пишет', () => {
    expect(captureRequestsMineToken('?id=1')).toBe(null);
    expect(localStorage.getItem(REQUESTS_MINE_TOKEN_KEY)).toBe(null);
  });

  it('requests-mine: страница списка чистит token из URL после захвата', async () => {
    window.history.replaceState({}, '', '/account/requests?token=tk1');
    mountListPage();
    mockFetchOk({ '/store/requests/mine?': { success: true, data: [] } });
    initRequestsMineList();
    expect(getRequestsMineToken()).toBe('tk1');
    expect(window.location.search).not.toContain('token=');
  });
});

describe('requests-mine список (T014)', () => {
  it('requests-mine: без токена — пустое состояние, fetch не зовётся', async () => {
    mountListPage();
    const fn = mockFetchOk({});
    initRequestsMineList();
    await flush();
    expect(document.getElementById('requests-empty')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('requests-list')!.classList.contains('hidden')).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('requests-mine: с токеном — строки с номером/товаром/статусом + Bearer', async () => {
    localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, 'tk1');
    mountListPage();
    const fn = mockFetchOk({ '/store/requests/mine?': { success: true, data: LIST } });
    initRequestsMineList();
    await flush();
    const rows = document.querySelectorAll('.account-order-row');
    expect(rows.length).toBe(2);
    expect(rows[0].innerHTML).toContain('Заявка №2083');
    expect(rows[0].innerHTML).toContain('Фотокнига «Наша история»');
    expect(rows[0].innerHTML).toContain('Новая');
    expect(rows[1].innerHTML).toContain('Закрыта: не договорились');
    expect(rows[0].innerHTML).toContain('href="/account/request?id=2083"');
    expect(fn.mock.calls[0][0]).toContain('/store/requests/mine?store_id=shop1');
    expect((fn.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tk1',
    });
  });

  it('requests-mine: пустой список → пустое состояние; ошибка → сообщение', async () => {
    localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, 'tk1');
    mountListPage();
    mockFetchOk({ '/store/requests/mine?': { success: true, data: [] } });
    initRequestsMineList();
    await flush();
    expect(document.getElementById('requests-empty')!.classList.contains('hidden')).toBe(false);

    document.body.innerHTML = '';
    localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, 'tk1');
    mountListPage();
    (window as any).fetch = jest.fn(() => Promise.reject(new Error('net')));
    initRequestsMineList();
    await flush();
    expect(document.getElementById('requests-loading')!.textContent).toBe('Не удалось загрузить заявки');
  });

  it('requests-mine: statusText данных важнее фолбека', () => {
    const html = requestMineRowHTML({
      id: 1,
      status: 'wait',
      statusText: 'Ждём предоплаты',
    });
    expect(html).toContain('Ждём предоплаты');
  });
});

describe('requests-mine карточка (T014)', () => {
  it('requests-mine: ?id= → Bearer-запрос, поля/галерея/предложение/тред/форма ответа', async () => {
    window.history.replaceState({}, '', '/account/request?id=2083');
    localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, 'tk1');
    mountDetailPage();
    const fn = mockFetchOk({ '/store/requests/mine/2083': { success: true, data: DETAIL } });
    initRequestsMineDetail();
    await flush();
    const content = document.getElementById('request-content')!;
    expect(content.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('request-subtitle')!.textContent).toContain('Обсуждается');
    expect(content.innerHTML).toContain('Формат');
    expect(content.innerHTML).toContain('30 × 30 см');
    expect(content.innerHTML).toContain('не заполнено');
    expect(content.querySelectorAll('img').length).toBe(2); // галерея фото
    expect(content.innerHTML).toContain('план.pdf');
    expect(content.innerHTML).toContain('Предложение');
    expect(content.innerHTML).toContain('600 ₽'); // jsdom: «5\u00A0600 ₽» (nbsp)
    expect(content.innerHTML).toContain('действует до 10 октября');
    expect(content.innerHTML).toContain('Заявка отправлена с сайта');
    expect(content.innerHTML).toContain('Лён — плюс 400 ₽');
    expect(document.getElementById('request-reply-send')).not.toBe(null);
    expect(fn.mock.calls[0][0]).toContain('/store/requests/mine/2083?store_id=shop1');
    expect((fn.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tk1',
    });
  });

  it('requests-mine: ответ покупателя — POST {text}, сообщение добавляется в тред', async () => {
    window.history.replaceState({}, '', '/account/request?id=2083');
    localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, 'tk1');
    mountDetailPage();
    mockFetchOk({
      '/store/requests/mine/2083': { success: true, data: DETAIL },
    });
    initRequestsMineDetail();
    await flush();
    // переопределяем fetch после загрузки карточки: POST теперь ок
    const fn = mockFetchOk({
      '/store/requests/mine/2083': { success: true, data: {} },
    });
    const text = document.getElementById('request-reply-text') as HTMLTextAreaElement;
    text.value = 'Отправил список файлом.';
    (document.getElementById('request-reply-send') as HTMLElement).click();
    await flush();
    const post = fn.mock.calls.find((c: any[]) => (c[1] as RequestInit).method === 'POST')!;
    expect(post).toBeTruthy();
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ text: 'Отправил список файлом.' });
    const thread = document.getElementById('request-thread')!;
    expect(thread.innerHTML).toContain('Отправил список файлом.');
    expect((document.getElementById('request-reply-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('requests-mine: ошибка ответа — сообщение под формой', async () => {
    window.history.replaceState({}, '', '/account/request?id=2083');
    localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, 'tk1');
    mountDetailPage();
    mockFetchOk({ '/store/requests/mine/2083': { success: true, data: DETAIL } });
    initRequestsMineDetail();
    await flush();
    (window as any).fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response),
    );
    const text = document.getElementById('request-reply-text') as HTMLTextAreaElement;
    text.value = 'Ответ';
    (document.getElementById('request-reply-send') as HTMLElement).click();
    await flush();
    const err = document.getElementById('request-reply-error')!;
    expect(err.textContent).toContain('Не удалось отправить ответ');
    expect(err.classList.contains('hidden')).toBe(false);
  });

  it('requests-mine: 404/нет id/нет токена → «Заявка не найдена»', async () => {
    window.history.replaceState({}, '', '/account/request?id=404');
    localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, 'tk1');
    mountDetailPage();
    mockFetchOk({});
    initRequestsMineDetail();
    await flush();
    expect(document.getElementById('request-not-found')!.classList.contains('hidden')).toBe(false);

    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/account/request');
    localStorage.removeItem(REQUESTS_MINE_TOKEN_KEY);
    mountDetailPage();
    initRequestsMineDetail();
    await flush();
    expect(document.getElementById('request-not-found')!.classList.contains('hidden')).toBe(false);
  });

  it('requests-mine: canReply=false — формы ответа нет, подпись про закрытость', () => {
    const html = requestMineCardHTML({ ...DETAIL, canReply: false });
    expect(html).not.toContain('request-reply-send');
    expect(html).toContain('Заявка закрыта для ответов');
  });

  it('requests-mine: разметка экранируется', () => {
    const html = requestMineRowHTML({
      id: '<script>',
      productName: '<b>Чужой</b>',
      status: 'new',
    });
    expect(html).not.toContain('<b>Чужой</b>');
    expect(html).toContain('&lt;b&gt;Чужой&lt;/b&gt;');
    expect(html).not.toContain('id=<script>');
  });
});
