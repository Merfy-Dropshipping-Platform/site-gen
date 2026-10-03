/**
 * @jest-environment jsdom
 *
 * requests-form (T013b) — поведенческие тесты острова формы заявки на
 * странице товара: mountRequestsForm (дескриптор → форма вместо «В корзину»,
 * null → корзина не тронута), события (кнопки-варианты, условные поля,
 * счётчики), файлы (лимиты количества/формата/размера, blob-превью, фолбэк
 * недоступного эндпоинта), отправка (валидация с текстами мокапа, успех,
 * «Отправить ещё одну»). Функции импортируются напрямую — тот же код, что
 * уезжает на витрину строкой REQUESTS_FORM_RUNTIME_SOURCE.
 */
import {
  mountRequestsForm,
  REQUESTS_FORM_RUNTIME_SOURCE,
  type RequestFormDescriptor,
} from '../runtime/requests-form';

/* ── фиксстуры ─────────────────────────────────────────────────────────── */

const DESC: RequestFormDescriptor = {
  id: 'book',
  btn: 'Оставить заявку',
  done: 'Спасибо! Посмотрим фото и ответим в течение дня.',
  phone: 'opt',
  fields: [
    { id: 'f1', type: 'photo', label: 'Фото для книги', req: true, max: 2 },
    { id: 'f2', type: 'buttons', label: 'Обложка', req: true, opts: ['Твёрдая', 'Ткань'] },
    { id: 'f5', type: 'select', label: 'Цвет ткани', req: true, opts: ['Лён', 'Серый'], cond: { f: 'f2', v: 'Ткань' } },
    { id: 'f6', type: 'text', label: 'Надпись', req: false, len: 40 },
  ],
};

function pageRoot(): HTMLElement {
  const el = document.createElement('section');
  el.innerHTML =
    '<div data-product-actions><button type="button">В корзину</button></div>' +
    '<div class="rq-sf" data-request-form></div>';
  document.body.appendChild(el);
  return el;
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** fetch-мок с роутингом по URL: дескриптор / загрузка файла / отправка. */
function mockFetch(overrides?: {
  descriptor?: unknown;
  upload?: unknown;
  submit?: unknown;
}) {
  const calls: Array<{ url: string; opts?: RequestInit }> = [];
  const fn = jest.fn((url: string, opts?: RequestInit) => {
    calls.push({ url, opts });
    let data: unknown = null;
    if (url.indexOf('/store/requests/product/') >= 0) {
      const d =
        overrides && 'descriptor' in overrides ? overrides.descriptor : DESC;
      data = { success: true, data: d };
    } else if (url.indexOf('/store/requests-files') >= 0) {
      data =
        overrides && overrides.upload !== undefined
          ? overrides.upload
          : { success: true, data: { key: 'minio-key-1', url: 'https://files/x.jpg', name: 'a.jpg', size: 123, mime: 'image/jpeg' } };
    } else if (url.indexOf('/store/requests') >= 0) {
      data =
        overrides && overrides.submit !== undefined
          ? overrides.submit
          : { success: true, data: { id: 2099 } };
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    } as Response);
  });
  (window as any).fetch = fn;
  return { fn, calls };
}

function file(name: string, type: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** jsdom не даёт присвоить files напрямую (нужен FileList) — свой дескриптор. */
function setFiles(el: HTMLInputElement, files: File[]): void {
  Object.defineProperty(el, 'files', { value: files, configurable: true });
}

function pickFileInput(root: HTMLElement, fid: string): HTMLInputElement {
  const el = root.querySelector(`[data-sfile="${fid}"]`) as HTMLInputElement;
  setFiles(el, [file('a.jpg', 'image/jpeg')]);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  (URL as any).createObjectURL = jest.fn(() => 'blob:mock-1');
  (URL as any).revokeObjectURL = jest.fn();
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = jest.fn();
  mockFetch();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (window as any).fetch;
  delete (URL as any).createObjectURL;
  delete (URL as any).revokeObjectURL;
});

/* ── mount: дескриптор и фолбэк ────────────────────────────────────────── */

describe('requests-form mount (T013b)', () => {
  it('requests: дескриптор пришёл → форма отрисована, действия товара скрыты', async () => {
    const root = pageRoot();
    await mountRequestsForm(root, { productId: 'book', apiBase: 'https://gw/api', storeId: 'shop1' });
    await flush();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    expect(form.innerHTML).toContain('sf-box');
    expect(form.innerHTML).toContain('<h4>Оставить заявку</h4>');
    expect(form.innerHTML).toContain('data-sfile="f1"');
    const actions = root.querySelector('[data-product-actions]') as HTMLElement;
    expect(actions.getAttribute('hidden')).toBe('');
  });

  it('requests: дескриптор null → корзина не тронута, контейнер пуст', async () => {
    mockFetch({ descriptor: { success: true, data: null } });
    const root = pageRoot();
    await mountRequestsForm(root, { productId: 'book', apiBase: 'https://gw/api', storeId: 'shop1' });
    await flush();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    expect(form.innerHTML).toBe('');
    const actions = root.querySelector('[data-product-actions]') as HTMLElement;
    expect(actions.getAttribute('hidden')).toBe(null);
  });

  it('requests: сеть упала → тихо, корзина работает как была', async () => {
    (window as any).fetch = jest.fn(() => Promise.reject(new Error('down')));
    const root = pageRoot();
    const p = mountRequestsForm(root, { productId: 'book', apiBase: 'https://gw/api' });
    await p.catch(() => undefined);
    await flush();
    const actions = root.querySelector('[data-product-actions]') as HTMLElement;
    expect(actions.getAttribute('hidden')).toBe(null);
  });

  it('requests: нет productId или нет контейнера → ничего не делает', async () => {
    const root = pageRoot();
    await mountRequestsForm(root, { productId: '' });
    root.querySelector('[data-request-form]')!.remove();
    await mountRequestsForm(root, { productId: 'x' });
    const actions = root.querySelector('[data-product-actions]') as HTMLElement;
    expect(actions.getAttribute('hidden')).toBe(null);
  });
});

/* ── события ───────────────────────────────────────────────────────────── */

describe('requests-form события (T013b)', () => {
  async function mounted(overrides?: { descriptor?: unknown }) {
    mockFetch(overrides);
    const root = pageRoot();
    await mountRequestsForm(root, { productId: 'book', apiBase: 'https://gw/api', storeId: 'shop1' });
    await flush();
    return root;
  }

  it('requests: кнопка-вариант выбирается и снимается повторным кликом', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).click();
    expect(
      (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).getAttribute('aria-checked'),
    ).toBe('true');
    (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).click();
    expect(
      (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('requests: условное поле появляется после выбора условия и исчезает при смене', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    expect(form.querySelector('[data-sf="f5"]')).toBe(null);
    (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).click();
    expect(form.querySelector('[data-sf="f5"]')).not.toBe(null);
    (form.querySelector('[data-sfbtn="f2|Твёрдая"]') as HTMLElement).click();
    expect(form.querySelector('[data-sf="f5"]')).toBe(null);
  });

  it('requests: счётчик символов обновляется без перерисовки (фокус в инпуте)', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    const inp = form.querySelector('[data-sf="f6"]') as HTMLInputElement;
    inp.value = 'Наша история';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const counter = form.querySelector('[data-sf="f6"]')!.closest('.sf-f')!.querySelector('.sf-h')!;
    expect(counter.textContent).toBe('12 из 40');
    // и значение попало в стейт — видно по счётчику после перерисовки кнопкой
    (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).click();
    const counter2 = form.querySelector('[data-sf="f6"]')!.closest('.sf-f')!.querySelector('.sf-h')!;
    expect(counter2.textContent).toBe('12 из 40');
  });

  it('requests: select меняет значение (change → перерисовка с selected)', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).click();
    const sel = form.querySelector('[data-sf="f5"]') as HTMLSelectElement;
    sel.value = 'Лён';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(
      (form.querySelector('[data-sf="f5"]') as HTMLSelectElement).querySelector('option[selected]')!
        .textContent,
    ).toBe('Лён');
  });
});

/* ── файлы ─────────────────────────────────────────────────────────────── */

describe('requests-form файлы (T013b)', () => {
  async function mounted(overrides?: { descriptor?: unknown; upload?: unknown }) {
    mockFetch(overrides);
    const root = pageRoot();
    await mountRequestsForm(root, { productId: 'book', apiBase: 'https://gw/api', storeId: 'shop1' });
    await flush();
    return root;
  }

  it('requests: выбор фото → blob-превью сразу, мета из ответа после загрузки', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    pickFileInput(root, 'f1');
    (root.querySelector('[data-sfile="f1"]') as HTMLInputElement).dispatchEvent(
      new Event('change', { bubbles: true }),
    );
    expect(form.querySelectorAll('.sf-thumbs img').length).toBe(1);
    expect(form.querySelector('.sf-up .tx span')!.textContent).toBe('Добавить ещё');
    await flush(); // загрузка
    const fd = ((window as any).fetch as jest.Mock).mock.calls.find((c: any[]) =>
      String(c[0]).indexOf('/store/requests-files') >= 0,
    )!;
    expect(fd).toBeTruthy();
    expect((fd[1] as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('requests: лимит количества — сверх max файлы пропущены с note', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    const el = root.querySelector('[data-sfile="f1"]') as HTMLInputElement;
    setFiles(el, [
      file('a.jpg', 'image/jpeg'),
      file('b.jpg', 'image/jpeg'),
      file('c.jpg', 'image/jpeg'),
    ]);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(form.querySelectorAll('.sf-thumbs > div').length).toBe(2); // max: 2
    expect(form.querySelector('[data-request-note]')!.textContent).toContain('Пропущено: 1');
  });

  it('requests: формат и размер — чужой тип и >20 МБ пропущены', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    const el = root.querySelector('[data-sfile="f1"]') as HTMLInputElement;
    setFiles(el, [
      file('notes.txt', 'text/plain'), // не фото
      file('huge.jpg', 'image/jpeg', 21 * 1048576), // больше 20 МБ
    ]);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(form.querySelectorAll('.sf-thumbs > div').length).toBe(0);
    expect(form.querySelector('[data-request-note]')!.textContent).toContain('больше 20 МБ');
  });

  it('requests: × убирает файл', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    pickFileInput(root, 'f1');
    (root.querySelector('[data-sfile="f1"]') as HTMLInputElement).dispatchEvent(
      new Event('change', { bubbles: true }),
    );
    expect(form.querySelectorAll('.sf-thumbs > div').length).toBe(1);
    (form.querySelector('[data-sfdel]') as HTMLElement).click();
    expect(form.querySelectorAll('.sf-thumbs > div').length).toBe(0);
  });

  it('requests: эндпоинт файлов недоступен (404) → note «Загрузка файлов временно недоступна»', async () => {
    const root = await mounted();
    (window as any).fetch = jest.fn((url: string) =>
      String(url).indexOf('/store/requests-files') >= 0
        ? Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response)
        : Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: DESC }) } as Response),
    );
    // перемонтировать с новым fetch: свежая страница
    document.body.innerHTML = '';
    const root2 = pageRoot();
    await mountRequestsForm(root2, { productId: 'book', apiBase: 'https://gw/api' });
    await flush();
    pickFileInput(root2, 'f1');
    (root2.querySelector('[data-sfile="f1"]') as HTMLInputElement).dispatchEvent(
      new Event('change', { bubbles: true }),
    );
    await flush();
    const form = root2.querySelector('[data-request-form]') as HTMLElement;
    expect(form.querySelector('[data-request-note]')!.textContent).toBe(
      'Загрузка файлов временно недоступна',
    );
    void root;
  });
});

/* ── отправка ──────────────────────────────────────────────────────────── */

describe('requests-form отправка (T013b)', () => {
  async function mounted(overrides?: { submit?: unknown }) {
    mockFetch(overrides);
    const root = pageRoot();
    await mountRequestsForm(root, { productId: 'book', apiBase: 'https://gw/api', storeId: 'shop1' });
    await flush();
    return root;
  }

  function fill(root: HTMLElement) {
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    (form.querySelector('[data-sfbtn="f2|Ткань"]') as HTMLElement).click();
    const sel = form.querySelector('[data-sf="f5"]') as HTMLSelectElement;
    sel.value = 'Лён';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const name = form.querySelector('[data-sf="_name"]') as HTMLInputElement;
    name.value = 'Ольга';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const email = form.querySelector('[data-sf="_email"]') as HTMLInputElement;
    email.value = 'olga@example.ru';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    const ok = form.querySelector('[data-sf="_ok"]') as HTMLInputElement;
    ok.checked = true;
    ok.dispatchEvent(new Event('change', { bubbles: true }));
    return form;
  }

  it('requests: пустая форма → тексты ошибок мокапа у полей, скролл к первой', async () => {
    const root = await mounted();
    const form = root.querySelector('[data-request-form]') as HTMLElement;
    (form.querySelector('[data-request-submit]') as HTMLElement).click();
    expect(form.innerHTML).toContain('Добавьте хотя бы одно фото');
    expect(form.innerHTML).toContain('Выберите вариант');
    expect(form.innerHTML).toContain('Как к вам обращаться?');
    expect(form.innerHTML).toContain('Нужна почта: сюда придёт ответ магазина');
    expect(form.innerHTML).toContain('Без согласия магазин не сможет принять заявку');
    expect(
      (Element.prototype as unknown as Record<string, unknown>).scrollIntoView,
    ).toHaveBeenCalled();
  });

  it('requests: успех → «Заявка №N отправлена», POST несёт productId/values/contacts/files', async () => {
    const root = await mounted();
    // фото загружено (мок-ответ даёт key)
    pickFileInput(root, 'f1');
    (root.querySelector('[data-sfile="f1"]') as HTMLInputElement).dispatchEvent(
      new Event('change', { bubbles: true }),
    );
    await flush();
    const form = fill(root);
    (form.querySelector('[data-request-submit]') as HTMLElement).click();
    await flush();
    const post = ((window as any).fetch as jest.Mock).mock.calls.find(
      (c: any[]) => String(c[0]).indexOf('/store/requests?') >= 0,
    )!;
    expect(post).toBeTruthy();
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.productId).toBe('book');
    expect(body.contacts).toEqual({ name: 'Ольга', email: 'olga@example.ru', phone: undefined, consent: true });
    expect(body.values.f2).toBe('Ткань');
    expect(body.values.f5).toBe('Лён');
    expect(body.files).toEqual([
      { fieldId: 'f1', key: 'minio-key-1', url: 'https://files/x.jpg', name: 'a.jpg', size: 1024, mime: 'image/jpeg' },
    ]);
    const form2 = root.querySelector('[data-request-form]') as HTMLElement;
    expect(form2.innerHTML).toContain('Заявка №2099 отправлена');
    expect(form2.innerHTML).toContain('Спасибо! Посмотрим фото и ответим');
    expect(form2.innerHTML).toContain('olga@example.ru');
  });

  it('requests: «Отправить ещё одну» возвращает чистую форму', async () => {
    const root = await mounted();
    const form = fill(root);
    pickFileInput(root, 'f1');
    (root.querySelector('[data-sfile="f1"]') as HTMLInputElement).dispatchEvent(
      new Event('change', { bubbles: true }),
    );
    await flush();
    const form2 = root.querySelector('[data-request-form]') as HTMLElement;
    (form2.querySelector('[data-request-submit]') as HTMLElement).click();
    await flush();
    (root.querySelector('[data-request-again]') as HTMLElement).click();
    const form3 = root.querySelector('[data-request-form]') as HTMLElement;
    expect(form3.querySelector('[data-sfbtn="f2|Ткань"]')!.getAttribute('aria-checked')).toBe('false');
    expect(form3.querySelectorAll('.sf-thumbs > div').length).toBe(0);
    void form;
  });

  it('requests: сервер отказал → сообщение над формой, форма на месте', async () => {
    const root = await mounted({ submit: { success: false, error: 'x' } });
    const form = fill(root);
    pickFileInput(root, 'f1');
    (root.querySelector('[data-sfile="f1"]') as HTMLInputElement).dispatchEvent(
      new Event('change', { bubbles: true }),
    );
    await flush();
    (form.querySelector('[data-request-submit]') as HTMLElement).click();
    await flush();
    const form2 = root.querySelector('[data-request-form]') as HTMLElement;
    expect(form2.querySelector('[data-request-note]')!.textContent).toContain(
      'Не удалось отправить заявку',
    );
    expect(form2.querySelector('[data-request-submit]')).not.toBe(null);
  });
});

/* ── строка-рантайм ────────────────────────────────────────────────────── */

describe('requests-form runtime source (T013b)', () => {
  it('requests: инлайн-строка исполняется и выставляет window.__merfyRequestsForm', () => {
    const sandbox: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- проверяем именно инлайн-встраивание строкой (паттерн <script is:inline set:html>)
    const fn = new Function(
      'window',
      REQUESTS_FORM_RUNTIME_SOURCE + '\nreturn window.__merfyRequestsForm;',
    );
    const api = fn(sandbox) as Record<string, unknown>;
    expect(typeof api.mountRequestsForm).toBe('function');
    expect(typeof api.validate).toBe('function');
    expect(typeof api.renderFormHTML).toBe('function');
  });
});
