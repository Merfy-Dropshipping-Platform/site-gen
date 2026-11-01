import { type Failure, failed, failureOf, reportFailure, reportInfo } from '../failures';
import type { ActionOptions, CoreHandle, NoData, Result, SdkPart, ShareModule, ShareResult } from '../types';

// Часть share (базовые секции, 29.10; «Поделиться» у «Товара» пяти тем): окно «Поделиться» системы (navigator.share) с
// названием и адресом страницы, а там, где его нет, — адрес в буфер обмена. Так же делают flux и vanilla на проде
// (product-detail.js). Окно закрыли, не выбрав, — не ошибка: покупатель передумал. Нет ни окна, ни буфера, или буфер
// отказал — ошибка server с текстом «Не получилось…» (quiet: true — секция покажет свой текст). Скрипту секции нельзя
// navigator, поэтому всё здесь.
//
// copy (кнопка data-action="share.copy" с data-text): скопировать текст — промокод, ссылку. Буфер обмена есть — пишет в
// него; нет или он отказал (запрет браузера, страница без https) — запасной способ: скрытое поле и execCommand('copy'),
// оно работает по нажатию, то есть из кнопки. Успех — уведомление «Скопировано» тем же путём, что прочие уведомления ядра.

const PAGE = 'share.page';
const COPY = 'share.copy';
export const COPIED_TEXT = 'Скопировано';

// Закрытое окно «Поделиться»: AbortError (так отвечают Chrome, Safari и Firefox).
const isDismissed = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const fail = (core: CoreHandle, action: string, text: string, options?: ActionOptions): Result<never> => {
  const failure: Failure = failureOf('server', `${action}: ${text}`);
  reportFailure(core, failure, options);
  return failed(failure);
};

async function copyLink(core: CoreHandle, url: string, options?: ActionOptions): Promise<Result<ShareResult>> {
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (clipboard === undefined)
    return fail(core, PAGE, 'в браузере нет ни окна «Поделиться», ни буфера обмена', options);
  try {
    await clipboard.writeText(url);
  } catch {
    return fail(core, PAGE, 'буфер обмена отказал в записи адреса', options);
  }
  return { ok: true, data: { method: 'copy' } };
}

// Запасной способ записи: поле вне экрана с выделенным текстом и команда copy. Фокус возвращается туда, где был.
function copyWithCommand(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false;
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    if (previous instanceof HTMLElement) previous.focus();
  }
}

async function writeToClipboard(text: string): Promise<boolean> {
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (clipboard !== undefined) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Буфер отказал — пробуем запасной способ.
    }
  }
  return copyWithCommand(text);
}

async function copyText(core: CoreHandle, text: string, options?: ActionOptions): Promise<Result<NoData>> {
  if (text === '') {
    const failure = failureOf(
      'invalid',
      `${COPY}: нет текста для копирования — он в data-text кнопки или в аргументе text`,
    );
    reportFailure(core, failure, options);
    return failed(failure);
  }
  if (!(await writeToClipboard(text)))
    return fail(core, COPY, 'ни буфер обмена, ни запасной способ не записали текст', options);
  reportInfo(core, COPIED_TEXT, options);
  return { ok: true, data: {} };
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
    copy: (args: { readonly text: string }, options?: ActionOptions): Promise<Result<NoData>> =>
      copyText(core, args.text, options),
  }),
  markup: {
    page: { params: [], call: (api: ShareModule): Promise<Result<unknown>> => api.page() },
    copy: {
      params: ['text'],
      call: (api: ShareModule, values): Promise<Result<unknown>> => api.copy({ text: values.text ?? '' }),
    },
  },
};
