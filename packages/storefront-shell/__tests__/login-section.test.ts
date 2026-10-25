import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import loginScript from '../sections/login/script';
import { navigation } from '../src/core/navigation';
import { AUTH_TEXT, auth } from '../src/core/parts/auth';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, placeSection, SHOP_ID, watchFailures } from './core-support';
import { fakeGateway } from './sdk-support';

// Секция «Вход» (блок 10 «Секций и SDK», 10.7, «Решил сам» пп. 18, 19; часть 10в, Р10в-11): e-mail → письмо с кодом и
// ссылкой; код — на той же странице; ссылка /verify?token=… — вход сам; тексты ошибок — под полем (quiet: true).
const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(join(here, '../sections/login/template.astro'), 'utf8');
// Фикстура section.json — с проверкой формы (JSON.parse отдаёт unknown).
interface ManifestSetting {
  id?: string;
  wrapper?: string;
  setting?: { default?: unknown };
}
const settingOf = (raw: unknown): ManifestSetting => {
  if (typeof raw !== 'object' || raw === null) return {};
  const setting = 'setting' in raw && typeof raw.setting === 'object' && raw.setting !== null ? raw.setting : null;
  return {
    id: 'id' in raw && typeof raw.id === 'string' ? raw.id : undefined,
    wrapper: 'wrapper' in raw && typeof raw.wrapper === 'string' ? raw.wrapper : undefined,
    setting: setting === null ? undefined : { default: 'default' in setting ? setting.default : undefined },
  };
};
const MANIFEST: { settings: ManifestSetting[] } = (() => {
  const parsed: unknown = JSON.parse(readFileSync(join(here, '../sections/login/section.json'), 'utf8'));
  const settings = typeof parsed === 'object' && parsed !== null && 'settings' in parsed && Array.isArray(parsed.settings) ? parsed.settings : [];
  return { settings: settings.map(settingOf) };
})();
// Разметка, которую шаблон выводит при полях по умолчанию (без классов): по ней работает script.ts.
const MARKUP = `
  <div data-ref="email-step">
    <input data-ref="email" type="email">
    <p data-ref="email-error" role="alert" hidden></p>
    <button type="button" data-ref="request" data-action="request">Получить ссылку для входа</button>
  </div>
  <div data-ref="code-step" hidden>
    <p>Мы отправили письмо на <span data-ref="sent-to"></span>.</p>
    <input data-ref="code" inputmode="numeric">
    <p data-ref="code-error" role="alert" hidden></p>
    <button type="button" data-ref="verify" data-action="verify">Войти</button>
    <button type="button" data-action="change-email">Изменить e-mail</button>
  </div>
  <p data-ref="checking" hidden>Входим…</p>`;
const STORE_UNMOUNT_DELAY = 1000;
const verified = { status: 200, body: { success: true, data: { customer: { email: 'anna@example.ru', name: null, phone: null }, sessionToken: 't-new' } } };
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;
let go: ReturnType<typeof vi.spyOn>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const hidden = (root: Element, ref: string): boolean | undefined =>
  root.querySelector(`[data-ref="${ref}"]`)?.hasAttribute('hidden');
const text = (root: Element, ref: string): string => root.querySelector(`[data-ref="${ref}"]`)?.textContent?.trim() ?? '';
const type = (root: Element, ref: string, value: string): void => {
  const input = root.querySelector<HTMLInputElement>(`[data-ref="${ref}"]`);
  if (input) input.value = value;
};
const click = (root: Element, selector: string): void => root.querySelector<HTMLElement>(selector)?.click();

function openLogin(mode: 'live' | 'preview' = 'live', address = '/login') {
  window.history.replaceState(null, '', address);
  const gateway = fakeGateway();
  document.head.innerHTML = configTag(mode).replace('"page":{"id":"home","path":"/"}', '"page":{"id":"page-login","path":"/login"}');
  const page = placeSection('shop:login', 'login-1', MARKUP);
  return { gateway, page, run: () => (core = start({ parts: [auth], sections: [entry('shop:login', loginScript, { uses: ['auth'] })] })) };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  failures = watchFailures();
  go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
});

afterEach(async () => {
  core?.stop();
  core = undefined;
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  failures.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('«Вход»', () => {
  it('шаблон и поля: ссылки разметки, поля как на проде', () => {
    for (const part of MARKUP.match(/data-(?:ref|action)="[^"]+"/g) ?? []) expect(TEMPLATE).toContain(part);
    for (const part of ['settings.heading', 'settings.text', "settings['button-label']", 'Получить ссылку для входа'])
      expect(TEMPLATE).toContain(part);
    expect(MANIFEST.settings.map((item) => item.id ?? `wrapper:${item.wrapper}`)).toEqual([
      'heading',
      'text',
      'wrapper:scheme',
      'wrapper:padding',
      'button-label',
    ]);
    expect(MANIFEST.settings[0]?.setting?.default).toBe('Вход в аккаунт');
  });

  it('e-mail → письмо: POST magic/request, шаг кода с адресом, шаг e-mail скрыт', async () => {
    const { gateway, page, run } = openLogin();
    gateway.answer('POST /store/auth/magic/request', { status: 200, body: { success: true } });
    run();
    type(page, 'email', '  anna@example.ru ');
    click(page, '[data-action="request"]');
    await settle();
    expect(gateway.calls).toEqual([
      { key: 'POST /store/auth/magic/request', body: { store_id: SHOP_ID, email: 'anna@example.ru', shopName: 'Шарфы' } },
    ]);
    expect([hidden(page, 'email-step'), hidden(page, 'code-step'), text(page, 'sent-to')]).toEqual([true, false, 'anna@example.ru']);
  });

  it('частые запросы — текст под полем, шаг кода не открыт, уведомления и сбоя секции нет', async () => {
    const { gateway, page, run } = openLogin();
    gateway.answer('POST /store/auth/magic/request', { status: 429, body: { success: false, code: 'RATE_LIMIT_EXCEEDED' } });
    run();
    type(page, 'email', 'anna@example.ru');
    click(page, '[data-action="request"]');
    await settle();
    expect([hidden(page, 'email-error'), text(page, 'email-error'), hidden(page, 'code-step')]).toEqual([false, AUTH_TEXT.tooMany, true]);
    expect(failures.details).toEqual([]);
  });

  it('код → вход: POST magic/verify с e-mail и кодом, переход в кабинет; неверный код — текст под кодом', async () => {
    const { gateway, page, run } = openLogin();
    gateway.answer('POST /store/auth/magic/request', { status: 200, body: { success: true } });
    gateway.answer('POST /store/auth/magic/verify', { status: 400, body: { success: false, code: 'MAGIC_INVALID' } }, verified);
    run();
    type(page, 'email', 'anna@example.ru');
    click(page, '[data-action="request"]');
    await settle();
    type(page, 'code', '111111');
    click(page, '[data-action="verify"]');
    await settle();
    expect([hidden(page, 'code-error'), text(page, 'code-error')]).toEqual([false, AUTH_TEXT.code]);
    expect(go).not.toHaveBeenCalled();
    type(page, 'code', '123456');
    click(page, '[data-action="verify"]');
    await settle();
    expect(gateway.calls.at(-1)).toEqual({
      key: 'POST /store/auth/magic/verify',
      body: { store_id: SHOP_ID, email: 'anna@example.ru', code: '123456' },
    });
    expect(go).toHaveBeenCalledWith('/account');
  });

  it('«Изменить e-mail» — снова шаг e-mail', async () => {
    const { gateway, page, run } = openLogin();
    gateway.answer('POST /store/auth/magic/request', { status: 200, body: { success: true } });
    run();
    type(page, 'email', 'anna@example.ru');
    click(page, '[data-action="request"]');
    await settle();
    click(page, '[data-action="change-email"]');
    expect([hidden(page, 'email-step'), hidden(page, 'code-step')]).toEqual([false, true]);
  });

  it('ссылка из письма: /verify?token=… — вход без нажатий, переход по redirect; устарела — текст и шаг e-mail', async () => {
    const first = openLogin('live', '/verify?token=abc&redirect=%2Faccount%2Forders');
    first.gateway.answer('POST /store/auth/magic/verify', verified);
    first.run();
    expect(hidden(first.page, 'checking')).toBe(false);
    await settle();
    expect(first.gateway.calls).toEqual([{ key: 'POST /store/auth/magic/verify', body: { store_id: SHOP_ID, token: 'abc' } }]);
    expect(go).toHaveBeenCalledWith('/account/orders');
    core?.stop();
    document.body.replaceChildren();
    const second = openLogin('live', '/verify?token=old');
    second.gateway.answer('POST /store/auth/magic/verify', { status: 410, body: { success: false, code: 'MAGIC_EXPIRED' } });
    second.run();
    await settle();
    expect([hidden(second.page, 'checking'), hidden(second.page, 'email-step'), text(second.page, 'email-error')]).toEqual([
      true,
      false,
      AUTH_TEXT.expired,
    ]);
  });

  it('превью: кнопка и ссылка из адреса запросов не шлют', async () => {
    const { gateway, page, run } = openLogin('preview', '/verify?token=abc');
    run();
    type(page, 'email', 'anna@example.ru');
    click(page, '[data-action="request"]');
    await settle();
    expect(gateway.calls).toEqual([]);
    expect(hidden(page, 'code-step')).toBe(true);
  });
});
