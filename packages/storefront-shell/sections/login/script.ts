import { defineSection, type Ctx, type El } from '@merfy/shell';

// «Вход» (блок 10 «Секций и SDK», 10.7, «Решил сам» пп. 18, 19; часть 10в, Р10в-11): e-mail → письмо с кодом и
// ссылкой; код — на той же странице; ссылка /verify?token=… — вход сама; отказы — текст под полем (quiet: true).
// На время запроса кнопка показывает блеск «Отправляем...»/«Проверяем...» и выключается. В превью кнопки ничего
// не шлют; вошедшую на страницу «Входа» уводит в кабинет часть auth (как на проде).

const showNotice = (message: string, notice: El | null): void => {
  notice?.text(message);
  notice?.show();
};

const clearNotice = (notice: El | null): void => {
  notice?.text('');
  notice?.hide();
};

// Кнопка в работе: блеск вместо текста, disabled — от повторного нажатия (как у пяти тем на проде).
const busy = (button: El | null, on: boolean): void => {
  button?.attr('disabled', on ? '' : null);
  if (button === null) return;
  const loading = button.ref('request-loading') ?? button.ref('verify-loading');
  const text = button.ref('request-text') ?? button.ref('verify-text');
  if (on) {
    loading?.show();
    text?.hide();
  } else {
    loading?.hide();
    text?.show();
  }
};

// Шаг e-mail → шаг кода: адрес в текст, ошибки скрыть, фокус на поле кода.
const openCodeStep = (ctx: Ctx<Record<string, unknown>, 'auth'>, email: string): void => {
  ctx.ref('sent-to')?.text(email);
  ctx.ref('email-step')?.hide();
  ctx.ref('code-step')?.show();
  clearNotice(ctx.ref('email-error'));
  ctx.ref('code')?.focus();
};

async function requestCode(ctx: Ctx<Record<string, unknown>, 'auth'>, button: El | null): Promise<void> {
  const email = ctx.ref('email')?.value().trim() ?? '';
  busy(button, true);
  const result = await ctx.auth.requestCode({ email }, { quiet: true });
  busy(button, false);
  if (result.ok) {
    openCodeStep(ctx, email);
    return;
  }
  showNotice(result.error.message, ctx.ref('email-error'));
}

async function verifyCode(ctx: Ctx<Record<string, unknown>, 'auth'>, button: El | null): Promise<void> {
  const email = ctx.ref('sent-to')?.text() ?? '';
  const code = ctx.ref('code')?.value() ?? '';
  busy(button, true);
  const result = await ctx.auth.verify({ email, code }, { quiet: true });
  busy(button, false);
  if (!result.ok) showNotice(result.error.message, ctx.ref('code-error'));
  // Успех — переход делает модуль входа (Р10в-5).
}

// Ссылка из письма: /verify?token=… — вход без нажатий (Р10в-11).
async function verifyByToken(ctx: Ctx<Record<string, unknown>, 'auth'>, token: string): Promise<void> {
  ctx.ref('email-step')?.hide();
  ctx.ref('checking')?.show();
  const result = await ctx.auth.verify({ token }, { quiet: true });
  if (result.ok) return;
  ctx.ref('checking')?.hide();
  ctx.ref('email-step')?.show();
  showNotice(result.error.message, ctx.ref('email-error'));
}

export default defineSection({
  mount(_el, ctx) {
    if (ctx.mode === 'preview') return;
    const token = ctx.page.query.token;
    if (typeof token === 'string' && token !== '') void verifyByToken(ctx, token);
    // Enter в поле e-mail или кода — то же, что кнопка шага.
    ctx.on('document', 'keydown', (event) => {
      if (event.key !== 'Enter') return;
      const email = ctx.ref('email');
      const code = ctx.ref('code');
      if (email !== null && event.inside(email)) void requestCode(ctx, ctx.ref('request'));
      else if (code !== null && event.inside(code)) void verifyCode(ctx, ctx.ref('verify'));
    });
  },
  actions: {
    request(target, ctx) {
      if (ctx.mode === 'preview') return;
      void requestCode(ctx, target);
    },
    verify(target, ctx) {
      if (ctx.mode === 'preview') return;
      void verifyCode(ctx, target);
    },
    'change-email'(_target, ctx) {
      ctx.ref('code-step')?.hide();
      ctx.ref('email-step')?.show();
      clearNotice(ctx.ref('email-error'));
      clearNotice(ctx.ref('code-error'));
    },
  },
});
