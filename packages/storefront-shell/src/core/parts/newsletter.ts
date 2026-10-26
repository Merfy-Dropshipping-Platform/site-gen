import { type Failure, type Reason, failed, failureOf, reasonOf, reportFailure } from '../failures';
import { requestJson } from '../requests';
import type { ActionOptions, CoreHandle, NewsletterModule, Result, SdkPart } from '../types';

// Подписка на рассылку (блок 9, Р9а-14): тот же запрос, что у rose и flux на проде, — POST /storefront/newsletter/
// subscribe с { store_id, email }. Разметки нет: e-mail — в поле формы, а значения действия разметки — только
// data-атрибуты. Секция «Подвал» вызывает с quiet: true и показывает тексты под формой сама.

// Статусы подписки без кода в теле → причина: 400 и 404 — invalid («Каталоги» блока 9).
const STATUS_REASON: Readonly<Record<number, Reason>> = { 400: 'invalid', 404: 'invalid' };

// alreadySubscribed из ответа шлюза; не булево — ответ не по форме.
const alreadyOf = (body: unknown): boolean | null => {
  if (typeof body !== 'object' || body === null) return null;
  const value: unknown = Reflect.get(body, 'alreadySubscribed');
  return typeof value === 'boolean' ? value : null;
};

const invalidText = (status: number): string => `newsletter.subscribe: шлюз ответил ${status} — проверьте email`;

type SubscribeResult = Result<{ readonly alreadySubscribed: boolean }>;

const fail = (core: CoreHandle, failure: Failure, options?: ActionOptions): SubscribeResult => {
  reportFailure(core, failure, options);
  return failed(failure);
};

export const newsletter: SdkPart<'newsletter', NewsletterModule> = {
  name: 'newsletter',
  create: (core: CoreHandle): NewsletterModule => ({
    subscribe: async (args: { readonly email: string }, options?: ActionOptions): Promise<SubscribeResult> => {
      const email = args.email.trim();
      if (email === '') {
        return fail(core, failureOf('invalid', 'newsletter.subscribe: email — непустая строка'), options);
      }
      const config = core.config;
      if (config === null) {
        return fail(core, failureOf('server', 'newsletter.subscribe: конфиг витрины не прочитан'), options);
      }
      const reply = await requestJson(`${config.api.url}/storefront/newsletter/subscribe`, {
        method: 'POST',
        body: { store_id: config.shop.id, email },
      });
      const already = alreadyOf(reply.body);
      const ok = reply.status >= 200 && reply.status < 300;
      if (!ok || already === null) {
        const reason = already === null && ok ? 'server' : reasonOf(reply, STATUS_REASON);
        return fail(core, failureOf(reason, invalidText(reply.status), reply), options);
      }
      return { ok: true, data: { alreadySubscribed: already } };
    },
  }),
};
