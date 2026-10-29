import { type Failure, failed, failureOf, reportFailure } from '../failures';
import type { ActionOptions, CoreHandle, Result, SdkPart, ShareModule, ShareResult } from '../types';

// Часть share (базовые секции, 29.10; «Поделиться» у «Товара» пяти тем): окно «Поделиться» системы (navigator.share) с
// названием и адресом страницы, а там, где его нет, — адрес в буфер обмена. Так же делают flux и vanilla на проде
// (product-detail.js). Окно закрыли, не выбрав, — не ошибка: покупатель передумал. Нет ни окна, ни буфера, или буфер
// отказал — ошибка server с текстом «Не получилось…» (quiet: true — секция покажет свой текст). Скрипту секции нельзя
// navigator, поэтому всё здесь.

const AUTHOR = 'share.page';

// Закрытое окно «Поделиться»: AbortError (так отвечают Chrome, Safari и Firefox).
const isDismissed = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const fail = (core: CoreHandle, text: string, options?: ActionOptions): Result<never> => {
  const failure: Failure = failureOf('server', `${AUTHOR}: ${text}`);
  reportFailure(core, failure, options);
  return failed(failure);
};

async function copyLink(core: CoreHandle, url: string, options?: ActionOptions): Promise<Result<ShareResult>> {
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (clipboard === undefined) return fail(core, 'в браузере нет ни окна «Поделиться», ни буфера обмена', options);
  try {
    await clipboard.writeText(url);
  } catch {
    return fail(core, 'буфер обмена отказал в записи адреса', options);
  }
  return { ok: true, data: { method: 'copy' } };
}

async function openShare(title: string, url: string): Promise<Result<ShareResult>> {
  try {
    await navigator.share({ title, url });
  } catch (error) {
    if (!isDismissed(error)) throw error;
  }
  return { ok: true, data: { method: 'share' } };
}

export const share: SdkPart<'share', ShareModule> = {
  name: 'share',
  create: (core: CoreHandle): ShareModule => ({
    page: async (options?: ActionOptions): Promise<Result<ShareResult>> => {
      const url = window.location.href;
      if (typeof navigator.share !== 'function') return copyLink(core, url, options);
      try {
        return await openShare(document.title, url);
      } catch {
        // Окно «Поделиться» есть, но отказало (запрет разрешений, нет жеста пользователя) — запасной путь, как у пяти тем.
        return copyLink(core, url, options);
      }
    },
  }),
  markup: {
    page: { params: [], call: (api: ShareModule): Promise<Result<unknown>> => api.page() },
  },
};
