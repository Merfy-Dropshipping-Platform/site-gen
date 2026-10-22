import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkEventDetail } from '../src/core/event-catalog';
import {
  NOTICE_TEXT,
  failed,
  failureOf,
  partialText,
  reasonOf,
  reportFailure,
  reportWarning,
} from '../src/core/failures';
import { fakeCore } from './sdk-support';

// Ответ шлюза → код SDK и уведомление (блок 9, таблица «Коды ошибок», «Решил сам» пп. 6–9). Договор с шлюзом: тело
// ошибки codedError — { success: false, code, message }.
const coded = (status: number, code: string, message = 'текст сервера') => ({
  status,
  body: { success: false, code, message },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('причина по ответу шлюза', () => {
  it.each([
    [coded(400, 'out_of_stock'), 'out-of-stock'],
    [coded(400, 'product_not_found'), 'invalid'],
    [coded(400, 'invalid_input'), 'invalid'],
    [coded(404, 'not_found'), 'invalid'],
    [coded(403, 'forbidden'), 'invalid'],
    [coded(401, 'unauthorized'), 'unauthorized'],
    [coded(422, 'refused'), 'refused'],
    [coded(503, 'unavailable'), 'server'],
    [coded(502, 'fn_error'), 'server'],
    [coded(502, 'invalid_output'), 'server'],
    [coded(400, 'something_new'), 'server'],
    [{ status: 0, body: null }, 'network'],
    [{ status: 401, body: null }, 'unauthorized'],
    [{ status: 429, body: { message: 'ThrottlerException: Too Many Requests' } }, 'rate-limit'],
    [{ status: 500, body: null }, 'server'],
    [{ status: 400, body: { statusCode: 400, message: 'Товара нет в наличии' } }, 'server'],
  ])('%j → %s', (reply, reason) => {
    expect(reasonOf(reply)).toBe(reason);
  });

  it('таблица статусов действия — после кода тела и до общей таблицы', () => {
    const byStatus = { 400: 'invalid', 404: 'invalid' } as const;
    expect(reasonOf({ status: 400, body: { message: ['email must be an email'] } }, byStatus)).toBe('invalid');
    expect(reasonOf(coded(400, 'out_of_stock'), byStatus)).toBe('out-of-stock');
    expect(reasonOf({ status: 429, body: null }, byStatus)).toBe('rate-limit');
  });
});

describe('ошибка действия', () => {
  it.each([
    ['out-of-stock', 'out-of-stock', 'Этого товара нет в наличии'],
    ['stock-limit', 'limit', 'Больше нет в наличии'],
    ['rate-limit', 'limit', 'Слишком много запросов. Попробуйте через минуту'],
    ['unauthorized', 'unauthorized', 'Войдите, чтобы продолжить'],
    ['network', 'network', 'Нет связи с магазином. Проверьте интернет и попробуйте ещё раз'],
    ['server', 'server', 'Не получилось. Попробуйте ещё раз через минуту'],
  ] as const)('%s → код %s, текст «%s» — и в ответе, и в уведомлении', (reason, code, text) => {
    expect(failureOf(reason, 'не нужен')).toEqual({ code, message: text, notice: text });
    expect(NOTICE_TEXT[reason]).toBe(text);
  });

  it('invalid — текст для автора, покупателю ничего', () => {
    expect(failureOf('invalid', 'cart.add: товара p12 нет — проверьте productId')).toEqual({
      code: 'invalid',
      message: 'cart.add: товара p12 нет — проверьте productId',
      notice: null,
    });
  });

  it('refused — текст расширения; без текста — текст server', () => {
    const reply = coded(422, 'refused', 'Баллы списываются от 500 ₽');
    expect(failureOf('refused', '', reply)).toEqual({
      code: 'refused',
      message: 'Баллы списываются от 500 ₽',
      notice: 'Баллы списываются от 500 ₽',
    });
    expect(failureOf('refused', '', { status: 422, body: null }).notice).toBe(NOTICE_TEXT.server);
  });

  it('failed — ответ { ok: false, error: { code, message } }', () => {
    expect(failed(failureOf('network', ''))).toEqual({
      ok: false,
      error: { code: 'network', message: NOTICE_TEXT.network },
    });
  });

  it('урезанное количество — предупреждение с числом', () => {
    expect(partialText(2)).toBe('Добавили 2 шт. — больше нет в наличии');
  });
});

describe('кто видит ошибку', () => {
  it('уведомление платформы — merfy:notice:show с уровнем error и кодом, по каталогу', () => {
    const { core, events } = fakeCore();
    reportFailure(core, failureOf('out-of-stock', ''));
    expect(events).toEqual([
      {
        name: 'merfy:notice:show',
        detail: { level: 'error', message: 'Этого товара нет в наличии', code: 'out-of-stock' },
      },
    ]);
    expect(checkEventDetail('merfy:notice:show', events[0]?.detail)).toBeNull();
  });

  it('quiet — уведомления нет: секция покажет ошибку сама', () => {
    const { core, events } = fakeCore();
    reportFailure(core, failureOf('network', ''), { quiet: true });
    reportWarning(core, partialText(1), { quiet: true });
    expect(events).toEqual([]);
  });

  it('invalid — строка в консоли для автора, уведомления нет; и с quiet', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { core, events } = fakeCore();
    reportFailure(core, failureOf('invalid', 'cart.add: productId — непустая строка'), { quiet: true });
    expect(events).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('cart.add: productId — непустая строка');
  });

  it('предупреждение — уровень warning без кода', () => {
    const { core, events } = fakeCore();
    reportWarning(core, partialText(2));
    expect(events).toEqual([
      { name: 'merfy:notice:show', detail: { level: 'warning', message: 'Добавили 2 шт. — больше нет в наличии' } },
    ]);
  });
});
